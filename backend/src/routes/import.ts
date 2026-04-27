import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { createServiceSchema } from "../utils/validators.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.originalname.endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only CSV files are accepted") as unknown as Error);
    }
  },
});

// CSV column name -> schema field mapping (now creates services, not claims)
const COLUMN_MAP: Record<string, string> = {
  insurance_provider_id: "insuranceProviderId",
  clinic_id: "clinicId",
  clinician_id: "clinicianId",
  dependent_id: "dependentId",
  date_of_service: "dateOfService",
  cpt_code: "cptCode",
  cpt_modifier: "cptModifier",
  place_of_service: "placeOfService",
  diagnosis_codes: "diagnosisCodes",
  billed_amount: "billedAmount",
};

function mapColumnName(col: string): string {
  const normalized = col.trim().toLowerCase().replace(/\s+/g, "_");
  return COLUMN_MAP[normalized] ?? col.trim();
}

// POST /import/csv — imports services (not claims)
router.post("/csv", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ValidationError("No CSV file uploaded");
    }

    const dryRun = req.query.dryRun === "true";
    const userId = req.user!.userId;
    const csvContent = req.file.buffer.toString("utf-8");

    let records: Record<string, string>[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new ValidationError("Failed to parse CSV file");
    }

    if (records.length === 0) {
      throw new ValidationError("CSV file is empty");
    }

    const errors: Array<{ row: number; errors: string[] }> = [];
    const validServices: Array<Record<string, unknown>> = [];

    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      const mapped: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(raw)) {
        const fieldName = mapColumnName(key);

        // Handle array fields
        if (fieldName === "diagnosisCodes") {
          mapped[fieldName] = value
            ? value.split("|").map((v: string) => v.trim()).filter(Boolean)
            : [];
        } else {
          mapped[fieldName] = value || undefined;
        }
      }

      const parsed = createServiceSchema.safeParse(mapped);
      if (!parsed.success) {
        errors.push({
          row: i + 2,
          errors: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        });
      } else {
        validServices.push(parsed.data);
      }
    }

    let createdCount = 0;

    if (!dryRun && validServices.length > 0) {
      const result = await prisma.$transaction(
        validServices.map((data) =>
          prisma.serviceLineItem.create({
            data: {
              userId,
              clinicId: data.clinicId as string,
              clinicianId: data.clinicianId as string,
              dependentId: data.dependentId as string,
              insuranceProviderId: (data.insuranceProviderId as string) ?? null,
              dateOfService: new Date(data.dateOfService as string),
              cptCode: data.cptCode as string,
              cptModifier: (data.cptModifier as string) ?? null,
              units: (data.units as number) ?? 1,
              placeOfService: (data.placeOfService as string) ?? null,
              diagnosisCodes: (data.diagnosisCodes as string[]) ?? [],
              billedAmount: data.billedAmount as string,
              description: (data.description as string) ?? null,
              status: "unsubmitted",
            },
          }),
        ),
      );
      createdCount = result.length;

      console.log(`CSV import: ${createdCount} services created for user`);
    }

    res.status(dryRun ? 200 : 201).json({
      data: {
        dryRun,
        totalRows: records.length,
        validRows: validServices.length,
        invalidRows: errors.length,
        createdCount: dryRun ? 0 : createdCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
