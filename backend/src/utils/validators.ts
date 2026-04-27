import { z } from "zod";

// ── Auth ──────────────────────────────────────────────

export const registerSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "Handle must be alphanumeric with _ or -"),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── Claim ─────────────────────────────────────────────

export const CLAIM_STATUSES = [
  "draft",
  "submitted",
  "received",
  "processing",
  "resolved",
  "paid",
  "closed",
  "denied",
  "reprocessing_requested",
  "reprocessing",
  "reprocessed",
  "appealed",
  "write_off",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const STATUS_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  draft: ["submitted"],
  submitted: ["received", "processing"],
  received: ["processing"],
  processing: ["resolved", "denied"],
  resolved: ["paid", "denied"],
  paid: ["closed", "reprocessing_requested"],
  denied: ["reprocessing_requested", "appealed", "write_off"],
  reprocessing_requested: ["reprocessing"],
  reprocessing: ["reprocessed", "denied"],
  reprocessed: ["paid", "denied"],
  appealed: ["paid", "denied", "write_off"],
  closed: [],
  write_off: [],
};

export function isValidStatusTransition(
  from: ClaimStatus,
  to: ClaimStatus,
): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const createServiceSchema = z.object({
  clinicianId: z.string().uuid(),
  clinicId: z.string().uuid(),
  dependentId: z.string().uuid(),
  insuranceProviderId: z.string().uuid().optional().nullable(),
  dateOfService: z.string().refine((v) => !isNaN(Date.parse(v)), {
    message: "Invalid date",
  }),
  cptCode: z.string().min(1).max(10),
  cptModifier: z.string().max(10).optional().nullable(),
  units: z.number().int().positive().default(1),
  placeOfService: z.string().max(5).optional().nullable(),
  diagnosisCodes: z.array(z.string().max(100)).default([]),
  billedAmount: z.union([z.string(), z.number()]).transform(String),
  description: z.string().optional().nullable(),
});

export const updateServiceSchema = createServiceSchema.partial();

export const createClaimSchema = z.object({
  insuranceProviderId: z.string().uuid(),
  clinicId: z.string().uuid(),
  dependentId: z.string().uuid(),
  claimNumber: z.string().max(100).optional().nullable(),
  claimPart: z.string().max(20).optional().nullable(),
  dateSubmitted: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
    .optional()
    .nullable(),
  servicePeriodStart: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
    .optional()
    .nullable(),
  servicePeriodEnd: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
    .optional()
    .nullable(),
  totalBilled: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  allowedAmount: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  amountSaved: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  insurancePaid: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  patientResponsibility: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  deductibleApplied: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  copay: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  coinsurance: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  planDoesNotCover: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  claimProcessingCodes: z.array(z.string().max(20)).default([]),
  status: z.enum(CLAIM_STATUSES).default("draft"),
  statusDetail: z.string().optional().nullable(),
  submissionMethod: z.string().max(20).optional().nullable(),
  superbillId: z.string().uuid().optional().nullable(),
  advocateAction: z.string().optional().nullable(),
  advocateComments: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateClaimSchema = createClaimSchema.partial();

// ── Insurance Provider ────────────────────────────────

export const insuranceProviderSchema = z.object({
  name: z.string().min(1).max(255),
  planType: z.string().max(50).optional().nullable(),
  policyNumber: z.string().max(100).optional().nullable(),
  groupNumber: z.string().max(100).optional().nullable(),
  claimsAddress: z.string().optional().nullable(),
  claimsPhone: z.string().max(20).optional().nullable(),
  portalUrl: z.string().max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateInsuranceProviderSchema = insuranceProviderSchema.partial();

// ── Clinic Organization ───────────────────────────────

export const clinicOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  ein: z.string().max(20).optional().nullable(),
  npi: z.string().max(10).optional().nullable(),
  superbillFormat: z.string().max(50).optional().nullable(),
  billingContact: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateClinicOrganizationSchema =
  clinicOrganizationSchema.partial();

// ── Clinician ─────────────────────────────────────────

export const clinicianSchema = z.object({
  name: z.string().min(1).max(255),
  credential: z.string().max(50).optional().nullable(),
  licenseNumber: z.string().max(50).optional().nullable(),
  npi: z.string().max(10).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  typicalCptCodes: z.array(z.string().max(50)).default([]),
  ratePerSession: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

export const updateClinicianSchema = clinicianSchema.partial();

// ── Dependent ─────────────────────────────────────────

export const dependentSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().refine((v) => !isNaN(Date.parse(v)), {
    message: "Invalid date",
  }),
  relationship: z.string().min(1).max(50),
  memberId: z.string().max(100).optional().nullable(),
});

export const updateDependentSchema = dependentSchema.partial();

// ── Claim Event ───────────────────────────────────────

export const claimEventSchema = z.object({
  eventType: z.string().min(1).max(50),
  eventDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date" })
    .optional(),
  description: z.string().optional().nullable(),
  metadataJson: z.record(z.unknown()).optional().nullable(),
  source: z.string().max(20).default("manual"),
});
