import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

type Fixture = {
  schemaVersion: number;
  generatedAt: string;
  sourceCounts: Record<string, number>;
  insuranceProviders: any[];
  clinics: any[];
  clinicians: any[];
  dependents: any[];
  superbills: any[];
  claims: any[];
  serviceLineItems: any[];
  claimEvents: any[];
  payments: any[];
  paymentAllocations: any[];
  eobDocuments: any[];
  reconciliationReports: any[];
  nonClaimableCharges: any[];
};

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await prisma.user.upsert({
    where: { handle: "demo" },
    update: {},
    create: {
      handle: "demo",
      email: "demo@claimpilot.local",
      passwordHash,
    },
  });
  console.log(`  User: ${user.handle} (${user.id})`);

  // Optional fixture: redacted snapshot of a real DB.
  const fixturePath = path.join(__dirname, "seed-data.json");
  if (!fs.existsSync(fixturePath)) {
    console.log("  No seed-data.json present — only the demo user is seeded.");
    console.log("  Use the document-import flow to add data, or generate a fixture");
    console.log("  with: npx tsx backend/scripts/export-redacted-fixture.ts");
    return;
  }

  const existingClaims = await prisma.claim.count({ where: { userId: user.id } });
  if (existingClaims > 0) {
    console.log(`  Demo user already has ${existingClaims} claims — skipping fixture import.`);
    return;
  }

  const raw = fs.readFileSync(fixturePath, "utf-8");
  const fixture: Fixture = JSON.parse(raw);
  console.log(`  Loading fixture (generated ${fixture.generatedAt})...`);

  const userId = user.id;
  const dec = (v: any) => (v === null || v === undefined ? null : new Prisma.Decimal(v));
  const dt = (v: any) => (v ? new Date(v) : null);

  await prisma.insuranceProvider.createMany({
    data: fixture.insuranceProviders.map((r) => ({ ...r, userId })),
  });
  await prisma.clinicOrganization.createMany({
    data: fixture.clinics.map((r) => ({ ...r, userId })),
  });
  await prisma.clinician.createMany({
    data: fixture.clinicians.map((r) => ({
      ...r,
      userId,
      ratePerSession: dec(r.ratePerSession),
    })),
  });
  await prisma.dependent.createMany({
    data: fixture.dependents.map((r) => ({
      ...r,
      userId,
      dateOfBirth: new Date(r.dateOfBirth),
    })),
  });
  await prisma.superbill.createMany({
    data: fixture.superbills.map((r) => ({
      ...r,
      userId,
      billingPeriodStart: new Date(r.billingPeriodStart),
      billingPeriodEnd: new Date(r.billingPeriodEnd),
      receivedDate: dt(r.receivedDate),
      totalAmount: dec(r.totalAmount),
    })),
  });
  await prisma.claim.createMany({
    data: fixture.claims.map((r) => ({
      ...r,
      userId,
      paymentDate: dt(r.paymentDate),
      paymentAmount: dec(r.paymentAmount),
      dateSubmitted: dt(r.dateSubmitted),
      servicePeriodStart: dt(r.servicePeriodStart),
      servicePeriodEnd: dt(r.servicePeriodEnd),
      totalBilled: dec(r.totalBilled),
      allowedAmount: dec(r.allowedAmount),
      amountSaved: dec(r.amountSaved),
      insurancePaid: dec(r.insurancePaid),
      patientResponsibility: dec(r.patientResponsibility),
      deductibleApplied: dec(r.deductibleApplied),
      copay: dec(r.copay),
      coinsurance: dec(r.coinsurance),
      planDoesNotCover: dec(r.planDoesNotCover),
    })),
  });
  await prisma.serviceLineItem.createMany({
    data: fixture.serviceLineItems.map((r) => ({
      ...r,
      userId,
      dateOfService: new Date(r.dateOfService),
      billedAmount: new Prisma.Decimal(r.billedAmount),
      amountPaid: dec(r.amountPaid),
      allowedAmount: dec(r.allowedAmount),
      amountSaved: dec(r.amountSaved),
      planPaid: dec(r.planPaid),
      deductibleApplied: dec(r.deductibleApplied),
      copay: dec(r.copay),
      coinsurance: dec(r.coinsurance),
      planDoesNotCover: dec(r.planDoesNotCover),
      amountOwed: dec(r.amountOwed),
    })),
  });
  await prisma.claimEvent.createMany({
    data: fixture.claimEvents.map((r) => ({
      ...r,
      eventDate: new Date(r.eventDate),
    })),
  });
  await prisma.payment.createMany({
    data: fixture.payments.map((r) => ({
      ...r,
      userId,
      paymentDate: new Date(r.paymentDate),
      totalAmount: new Prisma.Decimal(r.totalAmount),
    })),
  });
  await prisma.paymentAllocation.createMany({
    data: fixture.paymentAllocations.map((r) => ({
      ...r,
      allocatedAmount: new Prisma.Decimal(r.allocatedAmount),
    })),
  });
  await prisma.eobDocument.createMany({
    data: fixture.eobDocuments.map((r) => ({
      ...r,
      userId,
      receivedDate: dt(r.receivedDate),
      eobDate: dt(r.eobDate),
      serviceDateStart: dt(r.serviceDateStart),
      serviceDateEnd: dt(r.serviceDateEnd),
      providerBilled: dec(r.providerBilled),
      amountSaved: dec(r.amountSaved),
      planAllowedAmount: dec(r.planAllowedAmount),
      planPaid: dec(r.planPaid),
      appliedToDeductible: dec(r.appliedToDeductible),
      copay: dec(r.copay),
      coinsurance: dec(r.coinsurance),
      planDoesNotCover: dec(r.planDoesNotCover),
      totalYouOwe: dec(r.totalYouOwe),
      adjustments: dec(r.adjustments),
    })),
  });
  await prisma.reconciliationReport.createMany({
    data: fixture.reconciliationReports.map((r) => ({
      ...r,
      userId,
      billingPeriodStart: new Date(r.billingPeriodStart),
      billingPeriodEnd: new Date(r.billingPeriodEnd),
    })),
  });
  await prisma.nonClaimableCharge.createMany({
    data: fixture.nonClaimableCharges.map((r) => ({
      ...r,
      userId,
      date: new Date(r.date),
      amount: new Prisma.Decimal(r.amount),
    })),
  });

  console.log(`  Inserted from fixture:`);
  console.log(`    insurance_providers     ${fixture.insuranceProviders.length}`);
  console.log(`    clinic_organizations    ${fixture.clinics.length}`);
  console.log(`    clinicians              ${fixture.clinicians.length}`);
  console.log(`    dependents              ${fixture.dependents.length}`);
  console.log(`    superbills              ${fixture.superbills.length}`);
  console.log(`    claims                  ${fixture.claims.length}`);
  console.log(`    service_line_items      ${fixture.serviceLineItems.length}`);
  console.log(`    claim_events            ${fixture.claimEvents.length}`);
  console.log(`    payments                ${fixture.payments.length}`);
  console.log(`    payment_allocations     ${fixture.paymentAllocations.length}`);
  console.log(`    eob_documents           ${fixture.eobDocuments.length}`);
  console.log(`    reconciliation_reports  ${fixture.reconciliationReports.length}`);
  console.log(`    non_claimable_charges   ${fixture.nonClaimableCharges.length}`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
