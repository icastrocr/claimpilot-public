import { Router } from "express";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string; numpages: number; info: any }>;
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { AppError, ValidationError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB for PDFs
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(
        new ValidationError("Only PDF files are accepted") as unknown as Error,
      );
    }
  },
});

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "ANTHROPIC_API_KEY is not configured. PDF extraction requires an Anthropic API key.",
      500,
      "CONFIG_ERROR",
    );
  }
  return new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
}

// ── Superbill extraction prompt ──────────────────────────
const SUPERBILL_PROMPT = `You are a healthcare document data extraction assistant. Extract ALL service line items from this superbill/invoice document.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no explanation):

{
  "documentType": "superbill",
  "clinic": {
    "name": "clinic name",
    "address": "full address",
    "phone": "phone number",
    "ein": "EIN if present",
    "npi": "NPI if present"
  },
  "patient": {
    "name": "patient full name",
    "dateOfBirth": "MM/DD/YYYY if present"
  },
  "responsibleParty": {
    "name": "name of person billed/responsible"
  },
  "services": [
    {
      "dateOfService": "YYYY-MM-DD",
      "cptCode": "90834",
      "cptModifier": "95 or null",
      "description": "service description",
      "clinician": "clinician name with credentials",
      "clinicianNpi": "1234567890 or null",
      "clinicianLicense": "license number or null",
      "diagnosisCodes": ["F32.A", "F41.9"],
      "placeOfService": "11 or 10 etc",
      "units": 1,
      "billedAmount": "152.00",
      "amountPaid": "152.00 or null"
    }
  ],
  "totalBilled": "4965.26",
  "totalPaid": "4965.26 or null"
}

Rules:
- Extract EVERY service line, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be strings without $ signs
- If a field is not present, use null
- diagnosisCodes should be an array of ICD-10 codes
- placeOfService: "11" = office, "10" = telehealth, "02" = telehealth if shown as "Telehealth"
- Parse clinician name including credentials (e.g. "Jane Doe, LMHC")
- clinicianNpi: extract the rendering provider NPI number if present (10-digit number, often near the clinician name or in a provider detail section)
- clinicianLicense: extract the provider license number if present (often labeled "License #" or "Lic.")`;

// ── Invoice extraction prompt ────────────────────────────
const INVOICE_PROMPT = `You are a healthcare document data extraction assistant. Extract ALL line items from this invoice or billing statement document.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no explanation):

{
  "documentType": "invoice",
  "clinic": {
    "name": "clinic name",
    "address": "full address",
    "phone": "phone number"
  },
  "patient": {
    "name": "patient full name"
  },
  "responsibleParty": {
    "name": "name of person billed/responsible"
  },
  "billingPeriod": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "lineItems": [
    {
      "dateOfService": "YYYY-MM-DD",
      "description": "full service description including CPT and clinician",
      "cptCode": "90832",
      "cptModifier": "95 or null",
      "clinician": "clinician name with credentials",
      "billedAmount": "101.33",
      "amountPaid": "101.33 or null",
      "paymentDate": "YYYY-MM-DD or null",
      "paymentMethod": "Credit/Debit (Amex -1008) or null",
      "balance": "0.00",
      "type": "service or payment or cancellation_fee or adjustment"
    }
  ],
  "totalBilled": "4965.26",
  "totalPaid": "4965.26",
  "balance": "0.00"
}

Rules:
- Extract EVERY line item, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be strings without $ signs
- If a field is not present, use null
- billingPeriod: derive from the earliest and latest dateOfService across all line items
- Service lines have a date, CPT code, and billed amount — mark type as "service"
- Payment/credit lines are marked as type "payment"
- Late cancellation fees or no-show fees are type "cancellation_fee"
- Adjustments or discounts are type "adjustment"
- Parse CPT code from description (e.g. "90832 +95 Individual..." → cptCode: "90832", cptModifier: "95")
- Parse clinician name from description (e.g. "...with Jane Doe, LMHC" → clinician: "Jane Doe, LMHC")
- If a line has no CPT code and is a payment transaction, set cptCode to null`;

// ── EoB extraction prompt ────────────────────────────────
const EOB_PROMPT = `You are a healthcare document data extraction assistant. Extract ALL claim details from this Explanation of Benefits (EOB) document.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no explanation):

{
  "documentType": "eob",
  "insuranceProvider": "insurance company name",
  "member": {
    "name": "member name",
    "memberId": "member ID number"
  },
  "patient": {
    "name": "patient name",
    "relationship": "self, child, spouse, etc."
  },
  "group": {
    "name": "group/employer name or null",
    "number": "group number or null"
  },
  "statementDate": "YYYY-MM-DD",
  "serviceDateRange": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD"
  },
  "claims": [
    {
      "claimNumber": "EX1234567890",
      "patientAccountNumber": "9999999999 or null",
      "provider": "provider name",
      "networkStatus": "In-network or Out-of-network",
      "services": [
        {
          "dateOfService": "YYYY-MM-DD",
          "description": "service description",
          "providerBilled": "135.00",
          "amountSaved": "135.00",
          "planAllowedAmount": "0.00",
          "planPaid": "0.00",
          "deductible": "0.00",
          "copay": "0.00",
          "coinsurance": "0.00",
          "planDoesNotCover": "0.00",
          "amountYouOwe": "0.00",
          "claimProcessingCodes": ["V6"]
        }
      ]
    }
  ],
  "claimProcessingCodeDescriptions": {
    "HK": "BENEFITS FOR THIS SERVICE ARE DENIED..."
  },
  "totalProviderBilled": "810.00",
  "totalYouOwe": "0.00"
}

Rules:
- Extract EVERY claim and every service line within each claim
- Dates must be YYYY-MM-DD format
- Amounts must be strings without $ signs
- If a field is not present, use null
- claimProcessingCodes: extract the code letters (e.g. "HK", "A1")
- Include the full description of each processing code`;

// ── POST /documents/extract — Upload PDF & extract data ──
router.post("/extract", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError("No file uploaded");
    }

    const docType = req.body.documentType;
    if (!docType || !["superbill", "invoice", "eob"].includes(docType)) {
      throw new ValidationError(
        'documentType must be "superbill", "invoice", or "eob"',
      );
    }

    // Extract text from PDF
    const pdfData = await pdf(req.file.buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length < 50) {
      throw new ValidationError(
        "Could not extract text from PDF. The file may be image-based (scanned). Please ensure the PDF contains selectable text.",
      );
    }

    // Send to Claude for structured extraction
    const client = getAnthropicClient();
    const prompt =
      docType === "superbill" ? SUPERBILL_PROMPT : docType === "invoice" ? INVOICE_PROMPT : EOB_PROMPT;

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nHere is the document text:\n\n${rawText}`,
        },
      ],
    });

    // Check if response was truncated
    if (message.stop_reason === "max_tokens") {
      console.warn("Claude response was truncated (max_tokens reached)");
    }

    // Extract text content from Claude response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse JSON from response (handle markdown fences, extra text, etc.)
    let extracted: any;
    try {
      // Try direct parse first
      extracted = JSON.parse(responseText.trim());
    } catch {
      try {
        // Try extracting JSON from markdown code fences
        const fenceMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenceMatch) {
          extracted = JSON.parse(fenceMatch[1].trim());
        } else {
          // Try finding the first { ... } block
          const firstBrace = responseText.indexOf("{");
          const lastBrace = responseText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            extracted = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
          } else {
            throw new Error("No JSON found");
          }
        }
      } catch (innerErr: any) {
        console.error("Failed to parse Claude response:", responseText.substring(0, 500));
        throw new AppError(
          "Failed to parse extraction results. Please try again.",
          500,
          "EXTRACTION_ERROR",
        );
      }
    }

    res.json({
      data: {
        documentType: docType,
        fileName: req.file.originalname,
        extracted,
        rawTextLength: rawText.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /documents/confirm-superbill — Create services from extraction ──
// Auto-creates/matches clinic, clinicians, and dependent from extracted data
router.post("/confirm-superbill", async (req, res, next) => {
  try {
    const {
      insuranceProviderId,
      // Extracted data from AI (clinic, patient, services with clinician names)
      extracted,
      // Optional overrides (if user selected manually)
      clinicId: overrideClinicId,
      dependentId: overrideDependentId,
      services, // Array with clinician name strings (not IDs)
    } = req.body;

    if (!services?.length) {
      throw new ValidationError("services array is required");
    }

    const userId = (req as any).user.userId;

    const createdServices = await prisma.$transaction(async (tx) => {
      // ── 1. Find or create Clinic from superbill data ──
      let clinicId = overrideClinicId;
      if (!clinicId && extracted?.clinic?.name) {
        const clinicName = extracted.clinic.name.trim();
        let clinic = await tx.clinicOrganization.findFirst({
          where: { userId, name: { equals: clinicName, mode: "insensitive" } },
        });
        if (!clinic) {
          clinic = await tx.clinicOrganization.create({
            data: {
              userId,
              name: clinicName,
              address: extracted.clinic.address || null,
              phone: extracted.clinic.phone || null,
              ein: extracted.clinic.ein || null,
              npi: extracted.clinic.npi || null,
            },
          });
        }
        clinicId = clinic.id;
      }
      if (!clinicId) {
        throw new ValidationError("Could not determine clinic. Provide clinicId or ensure superbill has clinic name.");
      }

      // ── 2. Find or create Dependent (patient) from superbill data ──
      let dependentId = overrideDependentId;
      if (!dependentId && extracted?.patient?.name) {
        const patientName = extracted.patient.name.trim();
        const nameParts = patientName.split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || firstName;

        let dependent = await tx.dependent.findFirst({
          where: {
            userId,
            firstName: { equals: firstName, mode: "insensitive" },
            lastName: { equals: lastName, mode: "insensitive" },
          },
        });
        if (!dependent) {
          dependent = await tx.dependent.create({
            data: {
              userId,
              firstName,
              lastName,
              dateOfBirth: extracted.patient.dateOfBirth
                ? new Date(extracted.patient.dateOfBirth)
                : new Date("2000-01-01"),
              relationship: "self",
            },
          });
        }
        dependentId = dependent.id;
      }
      if (!dependentId) {
        throw new ValidationError("Could not determine patient. Provide dependentId or ensure superbill has patient name.");
      }

      // ── 3. Build clinician lookup (find or create by name within clinic) ──
      const clinicianCache: Record<string, string> = {};
      async function getClinicianId(clinicianName: string | undefined, clinicianNpi?: string | null, clinicianLicense?: string | null): Promise<string> {
        if (!clinicianName) {
          // Create a fallback clinician
          const name = "Unknown Clinician";
          if (clinicianCache[name]) return clinicianCache[name];
          let c = await tx.clinician.findFirst({ where: { userId, clinicId, name } });
          if (!c) c = await tx.clinician.create({ data: { userId, clinicId, name, isActive: true } });
          clinicianCache[name] = c.id;
          return c.id;
        }

        const normalized = clinicianName.trim();
        if (clinicianCache[normalized]) return clinicianCache[normalized];

        // Try exact match first, then fuzzy
        let clinician = await tx.clinician.findFirst({
          where: { userId, clinicId, name: { equals: normalized, mode: "insensitive" } },
        });
        if (!clinician) {
          // Try partial match (e.g. "Jane Doe" matches "Jane Doe, LMHC")
          const shortName = normalized.split(",")[0].trim();
          clinician = await tx.clinician.findFirst({
            where: { userId, clinicId, name: { contains: shortName, mode: "insensitive" } },
          });
        }
        if (!clinician) {
          // Parse credential from name like "Jane Doe, LMHC"
          const parts = normalized.split(",").map((p) => p.trim());
          const name = parts[0];
          const credential = parts.length > 1 ? parts.slice(1).join(", ") : null;
          clinician = await tx.clinician.create({
            data: {
              userId, clinicId, name, credential,
              npi: clinicianNpi || null,
              licenseNumber: clinicianLicense || null,
              isActive: true,
            },
          });
        } else {
          // Backfill NPI and/or license on existing clinician if we have new data they're missing
          const updates: Record<string, string> = {};
          if (clinicianNpi && !clinician.npi) updates.npi = clinicianNpi;
          if (clinicianLicense && !clinician.licenseNumber) updates.licenseNumber = clinicianLicense;
          if (Object.keys(updates).length > 0) {
            clinician = await tx.clinician.update({
              where: { id: clinician.id },
              data: updates,
            });
          }
        }
        clinicianCache[normalized] = clinician.id;
        return clinician.id;
      }

      // ── 4. Create service line items (with duplicate detection) ──
      const created = [];
      const skipped = [];
      for (const svc of services) {
        const clinicianId = svc.clinicianId || await getClinicianId(svc.clinician, svc.clinicianNpi, svc.clinicianLicense);
        const dosDate = new Date(svc.dateOfService);

        // Check for existing service with same date + CPT + clinician + dependent
        const existing = await tx.serviceLineItem.findFirst({
          where: {
            userId,
            dateOfService: dosDate,
            cptCode: svc.cptCode,
            clinicianId,
            dependentId,
            deletedAt: null,
          },
        });

        if (existing) {
          skipped.push({
            dateOfService: svc.dateOfService,
            cptCode: svc.cptCode,
            clinician: svc.clinician || null,
            billedAmount: svc.billedAmount,
            reason: "Duplicate service already exists",
          });
          continue;
        }

        const service = await tx.serviceLineItem.create({
          data: {
            userId,
            clinicId,
            dependentId,
            insuranceProviderId: insuranceProviderId || null,
            clinicianId,
            dateOfService: dosDate,
            cptCode: svc.cptCode,
            cptModifier: svc.cptModifier || null,
            units: svc.units || 1,
            placeOfService: svc.placeOfService || null,
            diagnosisCodes: svc.diagnosisCodes || [],
            billedAmount: String(svc.billedAmount),
            description: svc.description || null,
            status: "unsubmitted",
          },
        });
        created.push(service);
      }

      return { created, skipped };
    });

    res.status(201).json({
      data: {
        createdCount: createdServices.created.length,
        skippedCount: createdServices.skipped.length,
        services: createdServices.created,
        skippedServices: createdServices.skipped,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /documents/confirm-eob — Create claims from EoB and match services ──
// Accepts grouped claims: each item in `claims` has a claimNumber and array of services
router.post("/confirm-eob", async (req, res, next) => {
  try {
    const {
      claims: eobClaims, // Array of { claimNumber, patientAccountNumber, provider, networkStatus, services: [...] }
    } = req.body;

    if (!eobClaims?.length) {
      throw new ValidationError("claims array is required");
    }

    const userId = (req as any).user.userId;
    const createdClaims: any[] = [];
    const skippedClaims: any[] = [];
    let matchedServicesCount = 0;

    // Extract statementDate (eobDate) from request body if provided
    const eobDate = req.body.statementDate || null;

    await prisma.$transaction(async (tx) => {
      for (const eobClaim of eobClaims) {
        const services = eobClaim.services || [];

        // ── Duplicate check: skip if a resolved/paid claim with same claimNumber already exists ──
        if (eobClaim.claimNumber) {
          const existingClaim = await tx.claim.findFirst({
            where: {
              userId,
              claimNumber: eobClaim.claimNumber,
              status: { in: ["resolved", "paid", "closed"] },
              deletedAt: null,
            },
          });
          if (existingClaim) {
            skippedClaims.push({
              claimNumber: eobClaim.claimNumber,
              existingClaimId: existingClaim.id,
              reason: `Claim #${eobClaim.claimNumber} already exists`,
            });
            continue;
          }
        }

        // Compute date range from services
        const dates = services
          .map((s: any) => s.dateOfService)
          .filter(Boolean)
          .map((d: string) => new Date(d).getTime());
        const minDate = dates.length ? new Date(Math.min(...dates)) : null;
        const maxDate = dates.length ? new Date(Math.max(...dates)) : null;

        // Sum financials across services
        const sumField = (field: string) => {
          const total = services.reduce((sum: number, s: any) => {
            const val = parseFloat(s[field] || "0");
            return sum + (isNaN(val) ? 0 : val);
          }, 0);
          return total > 0 ? String(total) : null;
        };

        // Collect all processing codes
        const allCodes = services.flatMap(
          (s: any) => s.claimProcessingCodes || [],
        );
        const uniqueCodes = [...new Set(allCodes)];

        // EoB import always sets status to resolved.
        // Claim moves to "paid" only when the user records the actual payment.
        const newStatus = "resolved";

        // Resolve clinician from EoB provider name
        // EoB format is typically "F LASTNAME" (e.g. "J DOE" for "Jane Doe"),
        // so we try multiple strategies: exact contains, then initial+last-name match.
        let clinicianId: string | null = null;
        if (eobClaim.provider) {
          const providerRaw = eobClaim.provider.trim();

          // Strategy 1: direct contains (either direction)
          let clinician = await tx.clinician.findFirst({
            where: {
              userId,
              deletedAt: null,
              name: { contains: providerRaw, mode: "insensitive" },
            },
            select: { id: true, name: true },
          });

          if (!clinician) {
            // Strategy 2: check if any clinician name contains the EoB provider string
            // (handles case where DB name is longer, e.g. "Jane Doe, Ph.D." contains "Doe")
            const allClinicians = await tx.clinician.findMany({
              where: { userId, deletedAt: null },
              select: { id: true, name: true },
            });

            const providerUpper = providerRaw.toUpperCase();

            // Strategy 2a: DB clinician name contains the EoB provider string
            clinician = allClinicians.find((c) =>
              c.name.toUpperCase().includes(providerUpper),
            ) ?? null;

            // Strategy 2b: EoB format "F LASTNAME" — match first initial + last name
            if (!clinician) {
              const parts = providerRaw.split(/\s+/);
              if (parts.length >= 2) {
                const firstInitial = parts[0].toUpperCase();
                const lastName = parts.slice(1).join(" ").toUpperCase();

                clinician = allClinicians.find((c) => {
                  const nameParts = c.name.trim().split(/\s+/);
                  if (nameParts.length < 2) return false;
                  const cFirst = nameParts[0].toUpperCase();
                  const cLast = nameParts.slice(1).join(" ").toUpperCase();
                  return (
                    cLast === lastName &&
                    cFirst.startsWith(firstInitial.charAt(0))
                  );
                }) ?? null;
              }
            }
          }

          clinicianId = clinician?.id ?? null;
        }

        // ── Try to find an existing claim (draft or submitted) to upgrade ──
        // Match by: same dependent + clinician (via linked services) + overlapping service dates.
        // Both `draft` and `submitted` are valid candidates — the user may have marked the
        // claim as submitted before the EoB arrived, or left it as draft. Either should match.
        let claim: any = null;
        let upgradedFromStatus: string | null = null;

        if (clinicianId && minDate && maxDate) {
          const candidateClaims = await tx.claim.findMany({
            where: {
              userId,
              status: { in: ["draft", "submitted"] },
              deletedAt: null,
              serviceLineItems: {
                some: {
                  clinicianId,
                  deletedAt: null,
                },
              },
            },
            include: {
              serviceLineItems: {
                where: { deletedAt: null, clinicianId },
                select: { dateOfService: true },
              },
            },
          });

          // Pick the candidate whose service dates overlap with the EoB date range
          for (const candidate of candidateClaims) {
            const candDates = candidate.serviceLineItems.map((s) => s.dateOfService.getTime());
            const candMin = Math.min(...candDates);
            const candMax = Math.max(...candDates);
            const eobMin = minDate.getTime();
            const eobMax = maxDate.getTime();

            // Overlapping if ranges intersect (with 1-day tolerance)
            const DAY = 86400000;
            if (candMin <= eobMax + DAY && candMax >= eobMin - DAY) {
              claim = candidate;
              upgradedFromStatus = candidate.status;
              break;
            }
          }
        }

        const eobData = {
          claimNumber: eobClaim.claimNumber || undefined,
          patientAccountNumber: eobClaim.patientAccountNumber || undefined,
          servicePeriodStart: minDate,
          servicePeriodEnd: maxDate,
          totalBilled: sumField("providerBilled"),
          allowedAmount: sumField("planAllowedAmount"),
          insurancePaid: sumField("planPaid"),
          deductibleApplied: sumField("deductible"),
          copay: sumField("copay"),
          coinsurance: sumField("coinsurance"),
          planDoesNotCover: sumField("planDoesNotCover"),
          amountSaved: sumField("amountSaved"),
          patientResponsibility: sumField("amountYouOwe"),
          claimProcessingCodes: uniqueCodes,
          status: newStatus,
        };

        if (upgradedFromStatus && claim) {
          // Upgrade existing draft/submitted claim with EoB data
          const previousStatus = claim.status;
          claim = await tx.claim.update({
            where: { id: claim.id },
            data: eobData,
          });

          await tx.claimEvent.create({
            data: {
              claimId: claim.id,
              eventType: "status_change",
              previousStatus,
              newStatus,
              description: `EoB imported — claim ${eobClaim.claimNumber || ""} upgraded from ${previousStatus}${eobClaim.networkStatus ? ` (${eobClaim.networkStatus})` : ""}`,
              source: "eob_import",
              metadataJson: {
                ...(eobDate ? { eobDate } : {}),
                ...(eobClaim.networkStatus ? { networkStatus: eobClaim.networkStatus } : {}),
                upgradedFromStatus: previousStatus,
              },
            },
          });
        } else {
          // No matching draft/submitted claim — reject this EoB claim
          const providerLabel = eobClaim.provider || "Unknown provider";
          const dateRange = minDate && maxDate
            ? `${minDate.toISOString().slice(0, 10)} to ${maxDate.toISOString().slice(0, 10)}`
            : "unknown dates";
          skippedClaims.push({
            claimNumber: eobClaim.claimNumber || null,
            reason: `No matching draft or submitted claim found for ${providerLabel} (${dateRange}). Import the superbill and generate claims first, then re-import this EoB.`,
          });
          continue;
        }

        // Match existing services by dateOfService + clinician
        for (const svc of services) {
          if (svc.dateOfService) {
            const serviceWhere: any = {
              userId,
              dateOfService: new Date(svc.dateOfService),
              deletedAt: null,
              // Match services already linked to this claim OR unlinked ones
              OR: [
                { claimId: claim.id },
                {
                  claimId: null,
                  status: { in: ["unsubmitted", "submitted", "claim_ready"] },
                },
              ],
            };
            if (clinicianId) {
              serviceWhere.clinicianId = clinicianId;
            }

            const matched = await tx.serviceLineItem.updateMany({
              where: serviceWhere,
              data: {
                claimId: claim.id,
                status: "claimed",
                allowedAmount: svc.planAllowedAmount || null,
                amountSaved: svc.amountSaved || null,
                planPaid: svc.planPaid || null,
                deductibleApplied: svc.deductible || null,
                copay: svc.copay || null,
                coinsurance: svc.coinsurance || null,
                planDoesNotCover: svc.planDoesNotCover || null,
                amountOwed: svc.amountYouOwe || null,
                processingCodes: svc.claimProcessingCodes || [],
              },
            });
            matchedServicesCount += matched.count;
          }
        }

        createdClaims.push(claim);
      }
    });

    res.json({
      data: {
        createdCount: createdClaims.length,
        skippedCount: skippedClaims.length,
        matchedServicesCount,
        claims: createdClaims,
        skippedClaims,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /documents/reconcile-invoice — Reconcile invoice against existing services ──
router.post("/reconcile-invoice", async (req, res, next) => {
  try {
    const { extracted } = req.body;
    if (!extracted?.lineItems || !extracted?.billingPeriod) {
      throw new ValidationError("extracted data with lineItems and billingPeriod is required");
    }

    const userId = (req as any).user.userId;
    const { billingPeriod, clinic, patient, lineItems, totalBilled, totalPaid, balance } = extracted;
    const force = req.body.force === true;

    // Check for existing reconciliation report for this period
    if (!force) {
      const existingReport = await prisma.reconciliationReport.findFirst({
        where: {
          userId,
          billingPeriodStart: new Date(billingPeriod.start),
          billingPeriodEnd: new Date(billingPeriod.end),
        },
        orderBy: { createdAt: "desc" },
      });
      if (existingReport) {
        return res.json({
          data: {
            duplicateFound: true,
            existingReportId: existingReport.id,
            existingReportDate: existingReport.createdAt,
            billingPeriod,
          },
        });
      }
    }

    // Pre-check: ensure services exist for this billing period
    const existingServices = await prisma.serviceLineItem.findMany({
      where: {
        userId,
        dateOfService: {
          gte: new Date(billingPeriod.start),
          lte: new Date(billingPeriod.end),
        },
        deletedAt: null,
      },
      include: {
        clinician: true,
      },
    });

    if (existingServices.length === 0) {
      throw new ValidationError(
        `No services found for this billing period (${billingPeriod.start} to ${billingPeriod.end}). Please import the corresponding superbill first.`,
      );
    }

    // Track which system services have been matched
    const matchedSystemIds = new Set<string>();
    const items: any[] = [];

    // Process each invoice line item
    for (const line of lineItems) {
      if (line.type === "cancellation_fee") {
        items.push({
          status: "cancellation_fee",
          invoiceLine: {
            date: line.dateOfService,
            description: line.description,
            cptCode: line.cptCode || null,
            clinician: line.clinician || null,
            billedAmount: line.billedAmount,
            amountPaid: line.amountPaid || null,
          },
          systemService: null,
          note: "Missed/Cancelled appointment fee",
        });
        continue;
      }

      if (line.type !== "service") {
        // Skip payment and adjustment lines from matching
        continue;
      }

      // Try to match by dateOfService AND cptCode
      const match = existingServices.find(
        (svc) =>
          !matchedSystemIds.has(svc.id) &&
          svc.dateOfService.toISOString().slice(0, 10) === line.dateOfService &&
          svc.cptCode === line.cptCode,
      );

      if (match) {
        matchedSystemIds.add(match.id);
        const invoiceAmount = parseFloat(line.billedAmount || "0");
        const systemAmount = parseFloat(String(match.billedAmount) || "0");
        const diff = Math.abs(invoiceAmount - systemAmount);
        const amountsMatch = diff < 0.01;

        items.push({
          status: amountsMatch ? "matched" : "discrepancy",
          invoiceLine: {
            date: line.dateOfService,
            cptCode: line.cptCode,
            cptModifier: line.cptModifier || null,
            clinician: line.clinician || null,
            description: line.description || null,
            billedAmount: line.billedAmount,
            amountPaid: line.amountPaid || null,
          },
          systemService: {
            id: match.id,
            date: match.dateOfService.toISOString().slice(0, 10),
            cptCode: match.cptCode,
            cptModifier: match.cptModifier || null,
            clinician: (match as any).clinician?.name || null,
            billedAmount: String(match.billedAmount),
          },
          note: amountsMatch
            ? null
            : `Amount difference: invoice $${line.billedAmount} vs system $${String(match.billedAmount)}`,
        });
      } else {
        items.push({
          status: "missing_from_system",
          invoiceLine: {
            date: line.dateOfService,
            cptCode: line.cptCode,
            cptModifier: line.cptModifier || null,
            clinician: line.clinician || null,
            description: line.description || null,
            billedAmount: line.billedAmount,
            amountPaid: line.amountPaid || null,
          },
          systemService: null,
          note: "Service on invoice but not found in system",
        });
      }
    }

    // Find system services not matched to any invoice line
    for (const svc of existingServices) {
      if (!matchedSystemIds.has(svc.id)) {
        items.push({
          status: "missing_from_invoice",
          invoiceLine: null,
          systemService: {
            id: svc.id,
            date: svc.dateOfService.toISOString().slice(0, 10),
            cptCode: svc.cptCode,
            cptModifier: svc.cptModifier || null,
            clinician: (svc as any).clinician?.name || null,
            billedAmount: String(svc.billedAmount),
          },
          note: "Service in system but not on invoice",
        });
      }
    }

    // Sort all items by date
    items.sort((a, b) => {
      const dateA = a.invoiceLine?.date || a.systemService?.date || "";
      const dateB = b.invoiceLine?.date || b.systemService?.date || "";
      return dateA.localeCompare(dateB);
    });

    // Compute summary
    const summary = {
      totalInvoiceLines: lineItems.filter((l: any) => l.type === "service").length,
      matched: items.filter((i) => i.status === "matched").length,
      discrepancies: items.filter((i) => i.status === "discrepancy").length,
      missingFromSystem: items.filter((i) => i.status === "missing_from_system").length,
      missingFromInvoice: items.filter((i) => i.status === "missing_from_invoice").length,
      cancellationFees: items.filter((i) => i.status === "cancellation_fee").length,
      totalInvoiceBilled: totalBilled || "0.00",
      totalSystemBilled: existingServices
        .reduce((sum, svc) => sum + parseFloat(String(svc.billedAmount) || "0"), 0)
        .toFixed(2),
      difference: (
        parseFloat(totalBilled || "0") -
        existingServices.reduce((sum, svc) => sum + parseFloat(String(svc.billedAmount) || "0"), 0)
      ).toFixed(2),
    };

    // Persist the reconciliation report
    const report = await prisma.reconciliationReport.create({
      data: {
        userId,
        clinic: clinic?.name || null,
        patient: patient?.name || null,
        billingPeriodStart: new Date(billingPeriod.start),
        billingPeriodEnd: new Date(billingPeriod.end),
        fileName: (req.body as any).fileName || null,
        summaryJson: summary,
        itemsJson: items,
      },
    });

    res.json({
      data: {
        id: report.id,
        billingPeriod,
        clinic: clinic?.name || null,
        patient: patient?.name || null,
        summary,
        items,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
