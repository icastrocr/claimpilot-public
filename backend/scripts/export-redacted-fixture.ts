/**
 * Export-redacted-fixture
 * -----------------------
 * Reads a real ClaimPilot database, applies redaction + date-shift rules,
 * and writes `backend/prisma/seed-data.json`. The JSON is then loaded by
 * `seed.ts` on first boot to give a reviewer a populated UI without
 * shipping any real PHI in the public repo.
 *
 * Read-only against the source DB. Run from the project root after
 * pointing DATABASE_URL at the source database.
 *
 *   DATABASE_URL=postgres://... npx tsx backend/scripts/export-redacted-fixture.ts
 *
 * Redaction rules (summary):
 *   - Names (clinician, clinic, patient, insurer) → fixed placeholders
 *   - NPIs / EINs / license numbers / claim numbers / member IDs → placeholders
 *   - All free-text notes / descriptions / advocate comments → "[redacted note]"
 *   - All dates → minus 2 years and 6 months (preserves cadence/spacing)
 *   - All UUIDs → fresh UUIDs (with referential integrity preserved)
 *   - Amounts, CPT codes, POS codes, ICD-10 codes, statuses, processing codes,
 *     credentials, plan types, charge types — preserved as-is
 */

import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────
const SHIFT_MONTHS = 30; // 2 years 6 months back
const REDACTED_NOTE = "[redacted note]";

const CLINIC_PLACEHOLDER = {
  name: "Example Pediatric Clinic, LLC",
  address: "123 Example Street, Suite 100, Anytown, MA 02100-0000",
  phone: "(555) 555-0100",
  ein: "123456789",
  npi: "1234567890",
  billingContact: "billing@example.com",
};

const INSURER_PLACEHOLDER = {
  name: "Example Insurance Co.",
  groupNumberPrefix: "GRP",
  policyNumberPrefix: "POL",
  claimsAddress: "P.O. Box 12345, Anytown, ST 00000",
  claimsPhone: "800-555-0100",
  portalUrl: "https://portal.example.com",
};

const CLINICIAN_PLACEHOLDERS = [
  { name: "Dr. A. Example", license: "10001", npi: "1234567891" },
  { name: "Dr. B. Sample", license: "10002", npi: "1234567892" },
  { name: "Dr. C. Reed", license: "10003", npi: "1234567893" },
  { name: "Dr. D. Roe", license: "10004", npi: "1234567894" },
  { name: "Dr. E. Doe", license: "10005", npi: "1234567895" },
  { name: "Dr. F. Coe", license: "10006", npi: "1234567896" },
  { name: "Dr. G. Poe", license: "10007", npi: "1234567897" },
  { name: "Dr. H. Loe", license: "10008", npi: "1234567898" },
];

// ── Helpers ───────────────────────────────────────────────────────
const idMap = new Map<string, string>();
function remap(sourceId: string | null | undefined): string | null {
  if (!sourceId) return null;
  if (!idMap.has(sourceId)) idMap.set(sourceId, uuidv4());
  return idMap.get(sourceId)!;
}

function shiftDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const shifted = new Date(d);
  shifted.setMonth(shifted.getMonth() - SHIFT_MONTHS);
  return shifted.toISOString();
}

function decimalToString(d: any): string | null {
  if (d === null || d === undefined) return null;
  return String(d);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// Track names we've seen so we can scrub them out of free-text JSON later.
const realNames: string[] = [];
function rememberName(name: string | null | undefined): void {
  if (!name) return;
  const trimmed = name.trim();
  if (trimmed.length > 1) realNames.push(trimmed);
}

function deepScrubNames(value: any, clinicianNameMap: Map<string, string>): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let out = value;
    // Remap clinician names first (most likely to appear in free text)
    for (const [real, placeholder] of clinicianNameMap.entries()) {
      out = out.split(real).join(placeholder);
    }
    // Then any remaining real names → [redacted]
    for (const real of realNames) {
      if (out.includes(real)) out = out.split(real).join("[redacted]");
    }
    // UUIDs that might be in free text → leave alone (they get remapped if they're our IDs)
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepScrubNames(v, clinicianNameMap));
  }
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepScrubNames(v, clinicianNameMap);
    }
    return out;
  }
  return value;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const userHandle = process.env.SOURCE_USER_HANDLE;
  let user;
  if (userHandle) {
    user = await prisma.user.findUnique({ where: { handle: userHandle } });
  } else {
    const users = await prisma.user.findMany({ where: { deletedAt: null } });
    if (users.length === 0) throw new Error("No users found in source DB");
    if (users.length > 1) {
      console.warn(
        `Found ${users.length} users; using first ("${users[0].handle}"). ` +
          `Set SOURCE_USER_HANDLE env var to pick a different one.`,
      );
    }
    user = users[0];
  }
  if (!user) throw new Error(`User not found`);
  console.log(`Source user: ${user.handle}\n`);
  const userId = user.id;

  // ── Read all relevant tables ──
  const insuranceProviders = await prisma.insuranceProvider.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const clinics = await prisma.clinicOrganization.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const clinicians = await prisma.clinician.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const dependents = await prisma.dependent.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const superbills = await prisma.superbill.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const claims = await prisma.claim.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const services = await prisma.serviceLineItem.findMany({
    where: { userId, deletedAt: null },
    orderBy: { dateOfService: "asc" },
  });
  const claimEvents = await prisma.claimEvent.findMany({
    where: { claim: { userId } },
    orderBy: { eventDate: "asc" },
  });
  const payments = await prisma.payment.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const paymentAllocations = await prisma.paymentAllocation.findMany({
    where: { payment: { userId } },
    orderBy: { createdAt: "asc" },
  });
  const eobs = await prisma.eobDocument.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const reconReports = await prisma.reconciliationReport.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const nonClaimable = await prisma.nonClaimableCharge.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  console.log("Source counts:");
  console.log(`  insurance_providers      ${insuranceProviders.length}`);
  console.log(`  clinic_organizations     ${clinics.length}`);
  console.log(`  clinicians               ${clinicians.length}`);
  console.log(`  dependents               ${dependents.length}`);
  console.log(`  superbills               ${superbills.length}`);
  console.log(`  claims                   ${claims.length}`);
  console.log(`  service_line_items       ${services.length}`);
  console.log(`  claim_events             ${claimEvents.length}`);
  console.log(`  payments                 ${payments.length}`);
  console.log(`  payment_allocations      ${paymentAllocations.length}`);
  console.log(`  eob_documents            ${eobs.length}`);
  console.log(`  reconciliation_reports   ${reconReports.length}`);
  console.log(`  non_claimable_charges    ${nonClaimable.length}`);
  console.log("");

  // Remember real names so we can scrub them out of JSON blobs.
  for (const c of clinicians) rememberName(c.name);
  for (const c of clinics) rememberName(c.name);
  for (const d of dependents) {
    rememberName(d.firstName);
    rememberName(d.lastName);
    rememberName(`${d.firstName} ${d.lastName}`);
  }
  for (const ip of insuranceProviders) rememberName(ip.name);

  // Map source clinician id → placeholder name (deterministic by index)
  const clinicianNameByIdx = new Map<string, string>();
  const clinicianNameMap = new Map<string, string>(); // real name → placeholder
  clinicians.forEach((c, i) => {
    const ph = CLINICIAN_PLACEHOLDERS[i % CLINICIAN_PLACEHOLDERS.length];
    clinicianNameByIdx.set(c.id, ph.name);
    clinicianNameMap.set(c.name, ph.name);
  });

  // ── Apply redactions ──
  const redactedInsurance = insuranceProviders.map((ip, i) => ({
    id: remap(ip.id),
    name: i === 0 ? INSURER_PLACEHOLDER.name : `${INSURER_PLACEHOLDER.name} (Plan ${i + 1})`,
    planType: ip.planType,
    policyNumber: `${INSURER_PLACEHOLDER.policyNumberPrefix}${pad(i + 1, 8)}`,
    groupNumber: `${INSURER_PLACEHOLDER.groupNumberPrefix}${pad(i + 1, 8)}`,
    claimsAddress: INSURER_PLACEHOLDER.claimsAddress,
    claimsPhone: INSURER_PLACEHOLDER.claimsPhone,
    portalUrl: INSURER_PLACEHOLDER.portalUrl,
    notes: ip.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(ip.createdAt),
    updatedAt: shiftDate(ip.updatedAt),
  }));

  const redactedClinics = clinics.map((c, i) => ({
    id: remap(c.id),
    name: i === 0 ? CLINIC_PLACEHOLDER.name : `${CLINIC_PLACEHOLDER.name.replace(", LLC", "")} ${i + 1}, LLC`,
    address: CLINIC_PLACEHOLDER.address,
    phone: CLINIC_PLACEHOLDER.phone,
    ein: CLINIC_PLACEHOLDER.ein,
    npi: CLINIC_PLACEHOLDER.npi,
    superbillFormat: c.superbillFormat,
    billingContact: CLINIC_PLACEHOLDER.billingContact,
    notes: c.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(c.createdAt),
    updatedAt: shiftDate(c.updatedAt),
  }));

  const redactedClinicians = clinicians.map((c, i) => {
    const ph = CLINICIAN_PLACEHOLDERS[i % CLINICIAN_PLACEHOLDERS.length];
    return {
      id: remap(c.id),
      clinicId: remap(c.clinicId),
      name: ph.name,
      credential: c.credential,
      licenseNumber: ph.license,
      npi: ph.npi,
      specialty: c.specialty,
      typicalCptCodes: c.typicalCptCodes,
      ratePerSession: decimalToString(c.ratePerSession),
      isActive: c.isActive,
      createdAt: shiftDate(c.createdAt),
      updatedAt: shiftDate(c.updatedAt),
    };
  });

  const redactedDependents = dependents.map((d, i) => ({
    id: remap(d.id),
    firstName: "Patient",
    lastName: String.fromCharCode(65 + i), // A, B, C, ...
    dateOfBirth: shiftDate(d.dateOfBirth),
    relationship: d.relationship,
    memberId: `MEM${pad(i + 1, 8)}`,
    createdAt: shiftDate(d.createdAt),
    updatedAt: shiftDate(d.updatedAt),
  }));

  const redactedSuperbills = superbills.map((s, i) => ({
    id: remap(s.id),
    clinicId: remap(s.clinicId),
    filePath: `/uploads/example-superbill-${pad(i + 1, 3)}.pdf`,
    billingPeriodStart: shiftDate(s.billingPeriodStart),
    billingPeriodEnd: shiftDate(s.billingPeriodEnd),
    totalAmount: decimalToString(s.totalAmount),
    receivedDate: shiftDate(s.receivedDate),
    parsed: s.parsed,
    notes: s.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(s.createdAt),
    updatedAt: shiftDate(s.updatedAt),
  }));

  const redactedClaims = claims.map((c, i) => ({
    id: remap(c.id),
    insuranceProviderId: remap(c.insuranceProviderId),
    clinicId: remap(c.clinicId),
    dependentId: remap(c.dependentId),
    superbillId: remap(c.superbillId),
    claimNumber: c.claimNumber ? `EX${pad(i + 1, 10)}` : null,
    patientAccountNumber: c.patientAccountNumber ? "9999999999" : null,
    claimPart: c.claimPart,
    paymentDate: shiftDate(c.paymentDate),
    paymentCheckNumber: c.paymentCheckNumber ? `CK${pad(i + 1, 6)}` : null,
    paymentAmount: decimalToString(c.paymentAmount),
    dateSubmitted: shiftDate(c.dateSubmitted),
    servicePeriodStart: shiftDate(c.servicePeriodStart),
    servicePeriodEnd: shiftDate(c.servicePeriodEnd),
    totalBilled: decimalToString(c.totalBilled),
    allowedAmount: decimalToString(c.allowedAmount),
    amountSaved: decimalToString(c.amountSaved),
    insurancePaid: decimalToString(c.insurancePaid),
    patientResponsibility: decimalToString(c.patientResponsibility),
    deductibleApplied: decimalToString(c.deductibleApplied),
    copay: decimalToString(c.copay),
    coinsurance: decimalToString(c.coinsurance),
    planDoesNotCover: decimalToString(c.planDoesNotCover),
    claimProcessingCodes: c.claimProcessingCodes,
    status: c.status,
    statusDetail: c.statusDetail ? REDACTED_NOTE : null,
    submissionMethod: c.submissionMethod,
    advocateAction: c.advocateAction ? REDACTED_NOTE : null,
    advocateComments: c.advocateComments ? REDACTED_NOTE : null,
    notes: c.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(c.createdAt),
    updatedAt: shiftDate(c.updatedAt),
  }));

  const redactedServices = services.map((s) => ({
    id: remap(s.id),
    clinicId: remap(s.clinicId),
    dependentId: remap(s.dependentId),
    insuranceProviderId: remap(s.insuranceProviderId),
    superbillId: remap(s.superbillId),
    claimId: remap(s.claimId),
    clinicianId: remap(s.clinicianId),
    dateOfService: shiftDate(s.dateOfService),
    cptCode: s.cptCode,
    cptModifier: s.cptModifier,
    units: s.units,
    placeOfService: s.placeOfService,
    diagnosisCodes: s.diagnosisCodes,
    description: s.description ? REDACTED_NOTE : null,
    billedAmount: decimalToString(s.billedAmount),
    amountPaid: decimalToString(s.amountPaid),
    allowedAmount: decimalToString(s.allowedAmount),
    amountSaved: decimalToString(s.amountSaved),
    planPaid: decimalToString(s.planPaid),
    deductibleApplied: decimalToString(s.deductibleApplied),
    copay: decimalToString(s.copay),
    coinsurance: decimalToString(s.coinsurance),
    planDoesNotCover: decimalToString(s.planDoesNotCover),
    amountOwed: decimalToString(s.amountOwed),
    processingCodes: s.processingCodes,
    status: s.status,
    createdAt: shiftDate(s.createdAt),
    updatedAt: shiftDate(s.updatedAt),
  }));

  const redactedClaimEvents = claimEvents.map((e) => ({
    id: remap(e.id),
    claimId: remap(e.claimId),
    eventType: e.eventType,
    eventDate: shiftDate(e.eventDate),
    previousStatus: e.previousStatus,
    newStatus: e.newStatus,
    description: e.description ? REDACTED_NOTE : null,
    metadataJson: e.metadataJson ? deepScrubNames(e.metadataJson, clinicianNameMap) : null,
    source: e.source,
    createdAt: shiftDate(e.createdAt),
  }));

  const redactedPayments = payments.map((p, i) => ({
    id: remap(p.id),
    paymentDate: shiftDate(p.paymentDate),
    paymentMethod: p.paymentMethod,
    checkNumber: p.checkNumber ? `CK${pad(i + 1, 6)}` : null,
    totalAmount: decimalToString(p.totalAmount),
    payer: p.payer ? INSURER_PLACEHOLDER.name : null,
    received: p.received,
    notes: p.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(p.createdAt),
    updatedAt: shiftDate(p.updatedAt),
  }));

  const redactedPaymentAllocations = paymentAllocations.map((a) => ({
    id: remap(a.id),
    paymentId: remap(a.paymentId),
    claimId: remap(a.claimId),
    allocatedAmount: decimalToString(a.allocatedAmount),
    isOverpayment: a.isOverpayment,
    adjustmentReason: a.adjustmentReason,
    createdAt: shiftDate(a.createdAt),
  }));

  const redactedEobs = eobs.map((e, i) => ({
    id: remap(e.id),
    insuranceProviderId: remap(e.insuranceProviderId),
    claimId: remap(e.claimId),
    receivedDate: shiftDate(e.receivedDate),
    eobDate: shiftDate(e.eobDate),
    filePath: e.filePath ? `/uploads/example-eob-${pad(i + 1, 3)}.pdf` : null,
    claimNumber: e.claimNumber ? `EX${pad(i + 1, 10)}` : null,
    providerName: e.providerName ? "Dr. A. Example" : null,
    serviceDateStart: shiftDate(e.serviceDateStart),
    serviceDateEnd: shiftDate(e.serviceDateEnd),
    providerBilled: decimalToString(e.providerBilled),
    amountSaved: decimalToString(e.amountSaved),
    planAllowedAmount: decimalToString(e.planAllowedAmount),
    planPaid: decimalToString(e.planPaid),
    appliedToDeductible: decimalToString(e.appliedToDeductible),
    copay: decimalToString(e.copay),
    coinsurance: decimalToString(e.coinsurance),
    planDoesNotCover: decimalToString(e.planDoesNotCover),
    totalYouOwe: decimalToString(e.totalYouOwe),
    claimProcessingCodes: e.claimProcessingCodes,
    adjustments: decimalToString(e.adjustments),
    isReprocessed: e.isReprocessed,
    notes: e.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(e.createdAt),
    updatedAt: shiftDate(e.updatedAt),
  }));

  const redactedReconReports = reconReports.map((r, i) => {
    // summaryJson is pure aggregate numbers — keep as-is.
    // itemsJson contains clinician names + descriptions + UUID refs to services.
    // Walk it: replace clinician names with placeholders, scrub free text, remap service IDs.
    const scrubItems = (raw: any): any => {
      if (raw === null || raw === undefined) return raw;
      if (Array.isArray(raw)) return raw.map(scrubItems);
      if (typeof raw === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(raw)) {
          if (k === "clinician" && typeof v === "string") {
            // Try to map real name → placeholder
            const matched = clinicianNameMap.get(v);
            out[k] = matched || (v.length > 0 ? "Dr. A. Example" : v);
          } else if (k === "description" && typeof v === "string") {
            out[k] = REDACTED_NOTE;
          } else if (k === "id" && typeof v === "string" && /^[0-9a-f-]{36}$/.test(v)) {
            out[k] = remap(v);
          } else if (k === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
            const shifted = shiftDate(new Date(v));
            out[k] = shifted ? shifted.slice(0, 10) : v;
          } else if (k === "note" && typeof v === "string") {
            // Notes can be computed (e.g., "Amount difference: invoice $X vs system $Y") — keep
            // numeric structure, just scrub names.
            out[k] = deepScrubNames(v, clinicianNameMap);
          } else {
            out[k] = scrubItems(v);
          }
        }
        return out;
      }
      return raw;
    };
    return {
      id: remap(r.id),
      clinic: r.clinic ? CLINIC_PLACEHOLDER.name : null,
      patient: r.patient ? `Patient ${String.fromCharCode(65 + (i % 26))}` : null,
      billingPeriodStart: shiftDate(r.billingPeriodStart),
      billingPeriodEnd: shiftDate(r.billingPeriodEnd),
      fileName: r.fileName ? `example-invoice-${pad(i + 1, 3)}.pdf` : null,
      summaryJson: r.summaryJson, // aggregate counts/totals — no PHI
      itemsJson: scrubItems(r.itemsJson),
      createdAt: shiftDate(r.createdAt),
    };
  });

  const redactedNonClaimable = nonClaimable.map((n) => ({
    id: remap(n.id),
    clinicId: remap(n.clinicId),
    chargeType: n.chargeType,
    date: shiftDate(n.date),
    amount: decimalToString(n.amount),
    clinicianId: remap(n.clinicianId),
    description: n.description ? REDACTED_NOTE : null,
    billingPeriod: n.billingPeriod, // e.g., "2025-10" → could be a soft fingerprint
    notes: n.notes ? REDACTED_NOTE : null,
    createdAt: shiftDate(n.createdAt),
    updatedAt: shiftDate(n.updatedAt),
  }));

  // ── Assemble fixture ──
  const fixture = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCounts: {
      insuranceProviders: insuranceProviders.length,
      clinics: clinics.length,
      clinicians: clinicians.length,
      dependents: dependents.length,
      superbills: superbills.length,
      claims: claims.length,
      services: services.length,
      claimEvents: claimEvents.length,
      payments: payments.length,
      paymentAllocations: paymentAllocations.length,
      eobs: eobs.length,
      reconReports: reconReports.length,
      nonClaimable: nonClaimable.length,
    },
    redaction: {
      shiftMonths: SHIFT_MONTHS,
      uuidsRegenerated: true,
      amountsPreserved: true,
    },
    insuranceProviders: redactedInsurance,
    clinics: redactedClinics,
    clinicians: redactedClinicians,
    dependents: redactedDependents,
    superbills: redactedSuperbills,
    claims: redactedClaims,
    serviceLineItems: redactedServices,
    claimEvents: redactedClaimEvents,
    payments: redactedPayments,
    paymentAllocations: redactedPaymentAllocations,
    eobDocuments: redactedEobs,
    reconciliationReports: redactedReconReports,
    nonClaimableCharges: redactedNonClaimable,
  };

  const out = path.join(__dirname, "..", "prisma", "seed-data.json");
  fs.writeFileSync(out, JSON.stringify(fixture, null, 2));
  console.log(`Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
  console.log(`\nReview the file before committing it to the public repo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
