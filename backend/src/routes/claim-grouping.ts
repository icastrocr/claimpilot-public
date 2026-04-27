import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// ── Types ────────────────────────────────────────────

interface GroupingFilters {
  serviceIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  clinicianId?: string;
  clinicId?: string;
  dependentId?: string;
}

interface ValidationIssue {
  field: string;
  message: string;
  entityType: string;
  entityId: string;
  entityName?: string;
}

interface ClaimGroup {
  key: string;
  dependent: { id: string; firstName: string; lastName: string; memberId: string | null; dateOfBirth: Date };
  clinician: { id: string; name: string; npi: string | null; credential: string | null };
  clinic: { id: string; name: string; npi: string | null; ein: string | null };
  services: Array<{
    id: string;
    dateOfService: Date;
    cptCode: string;
    cptModifier: string | null;
    units: number;
    placeOfService: string | null;
    diagnosisCodes: string[];
    billedAmount: Prisma.Decimal;
    description: string | null;
  }>;
  servicePeriod: { start: Date; end: Date };
  totalBilled: string;
  lineCount: number;
  validationIssues: ValidationIssue[];
  isValid: boolean;
}

// Max service lines per CMS-1500 form
const CMS_1500_MAX_LINES = 6;

// ── Helpers ──────────────────────────────────────────

function buildGroupKey(dependentId: string, clinicianId: string, clinicId: string): string {
  return `${dependentId}|${clinicianId}|${clinicId}`;
}

function validateGroup(group: ClaimGroup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Clinician must have NPI
  if (!group.clinician.npi) {
    issues.push({
      field: "npi",
      message: "Clinician is missing NPI number",
      entityType: "clinician",
      entityId: group.clinician.id,
      entityName: group.clinician.name,
    });
  }

  // Clinic must have NPI
  if (!group.clinic.npi) {
    issues.push({
      field: "npi",
      message: "Clinic is missing NPI number",
      entityType: "clinic",
      entityId: group.clinic.id,
      entityName: group.clinic.name,
    });
  }

  // Clinic must have EIN
  if (!group.clinic.ein) {
    issues.push({
      field: "ein",
      message: "Clinic is missing EIN (Tax ID)",
      entityType: "clinic",
      entityId: group.clinic.id,
      entityName: group.clinic.name,
    });
  }

  // At least one service must have diagnosis codes
  const hasDiagnosis = group.services.some((s) => s.diagnosisCodes.length > 0);
  if (!hasDiagnosis) {
    issues.push({
      field: "diagnosisCodes",
      message: "No diagnosis codes found on any service line",
      entityType: "services",
      entityId: group.key,
    });
  }

  return issues;
}

/**
 * Split a group of services into CMS-1500 batches of max 6 lines each.
 */
function splitIntoBatches(group: ClaimGroup): ClaimGroup[] {
  const sortedServices = [...group.services].sort(
    (a, b) => new Date(a.dateOfService).getTime() - new Date(b.dateOfService).getTime(),
  );

  if (sortedServices.length <= CMS_1500_MAX_LINES) {
    return [{ ...group, services: sortedServices }];
  }

  const batches: ClaimGroup[] = [];
  for (let i = 0; i < sortedServices.length; i += CMS_1500_MAX_LINES) {
    const batchServices = sortedServices.slice(i, i + CMS_1500_MAX_LINES);
    const dates = batchServices.map((s) => new Date(s.dateOfService).getTime());
    const totalBilled = batchServices
      .reduce((sum, s) => sum + Number(s.billedAmount), 0)
      .toFixed(2);

    batches.push({
      ...group,
      services: batchServices,
      servicePeriod: {
        start: new Date(Math.min(...dates)),
        end: new Date(Math.max(...dates)),
      },
      totalBilled,
      lineCount: batchServices.length,
    });
  }

  return batches;
}

// ── Core grouping logic ──────────────────────────────

async function groupServices(userId: string, filters: GroupingFilters) {
  const where: Prisma.ServiceLineItemWhereInput = {
    userId,
    deletedAt: null,
    status: "unsubmitted",
    claimId: null,
  };

  if (filters.serviceIds?.length) {
    where.id = { in: filters.serviceIds };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.dateOfService = {};
    if (filters.dateFrom) {
      (where.dateOfService as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      (where.dateOfService as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
    }
  }

  if (filters.clinicianId) where.clinicianId = filters.clinicianId;
  if (filters.clinicId) where.clinicId = filters.clinicId;
  if (filters.dependentId) where.dependentId = filters.dependentId;

  const services = await prisma.serviceLineItem.findMany({
    where,
    include: {
      clinician: {
        select: { id: true, name: true, npi: true, credential: true },
      },
      clinic: {
        select: { id: true, name: true, npi: true, ein: true },
      },
      dependent: {
        select: { id: true, firstName: true, lastName: true, memberId: true, dateOfBirth: true },
      },
    },
    orderBy: { dateOfService: "asc" },
  });

  // Group by dependent + clinician + clinic (insurance is assigned later)
  const groupMap = new Map<string, ClaimGroup>();

  for (const svc of services) {
    const key = buildGroupKey(svc.dependentId, svc.clinicianId, svc.clinicId);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        dependent: svc.dependent,
        clinician: svc.clinician,
        clinic: svc.clinic,
        services: [],
        servicePeriod: { start: svc.dateOfService, end: svc.dateOfService },
        totalBilled: "0.00",
        lineCount: 0,
        validationIssues: [],
        isValid: true,
      });
    }

    const group = groupMap.get(key)!;
    group.services.push({
      id: svc.id,
      dateOfService: svc.dateOfService,
      cptCode: svc.cptCode,
      cptModifier: svc.cptModifier,
      units: svc.units,
      placeOfService: svc.placeOfService,
      diagnosisCodes: svc.diagnosisCodes,
      billedAmount: svc.billedAmount,
      description: svc.description,
    });
  }

  // Calculate totals, validate, and split into CMS-1500 batches
  const allBatches: ClaimGroup[] = [];

  for (const group of groupMap.values()) {
    const dates = group.services.map((s) => new Date(s.dateOfService).getTime());
    group.servicePeriod = {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates)),
    };
    group.totalBilled = group.services
      .reduce((sum, s) => sum + Number(s.billedAmount), 0)
      .toFixed(2);
    group.lineCount = group.services.length;

    const issues = validateGroup(group);
    group.validationIssues = issues;
    group.isValid = issues.length === 0;

    const batches = splitIntoBatches(group);
    allBatches.push(...batches);
  }

  return {
    groups: allBatches,
    summary: {
      totalGroups: allBatches.length,
      totalServices: services.length,
      validGroups: allBatches.filter((g) => g.isValid).length,
      invalidGroups: allBatches.filter((g) => !g.isValid).length,
      totalBilled: services
        .reduce((sum, s) => sum + Number(s.billedAmount), 0)
        .toFixed(2),
    },
  };
}

// ── Routes ───────────────────────────────────────────

/**
 * POST /claims/group-preview
 * Preview how unsubmitted services would be grouped into claims.
 * Groups by patient + clinician + clinic. Insurance is assigned at generation time.
 */
router.post("/group-preview", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const filters: GroupingFilters = {
      serviceIds: req.body.serviceIds,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      clinicianId: req.body.clinicianId,
      clinicId: req.body.clinicId,
      dependentId: req.body.dependentId,
    };

    if (!filters.dateFrom && !filters.dateTo && !filters.serviceIds?.length) {
      throw new ValidationError(
        "Either a date range (dateFrom/dateTo) or specific serviceIds are required",
      );
    }

    const result = await groupServices(userId, filters);

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /claims/generate
 * Create draft claims from grouped services.
 * Requires insuranceAssignments: { [groupKey]: insuranceProviderId }
 * for each group. Groups without an assignment are skipped.
 */
router.post("/generate", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const filters: GroupingFilters = {
      serviceIds: req.body.serviceIds,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      clinicianId: req.body.clinicianId,
      clinicId: req.body.clinicId,
      dependentId: req.body.dependentId,
    };

    // Map of groupKey → insuranceProviderId selected by the user
    const insuranceAssignments: Record<string, string> = req.body.insuranceAssignments ?? {};

    if (!filters.dateFrom && !filters.dateTo && !filters.serviceIds?.length) {
      throw new ValidationError(
        "Either a date range (dateFrom/dateTo) or specific serviceIds are required",
      );
    }

    if (Object.keys(insuranceAssignments).length === 0) {
      throw new ValidationError(
        "insuranceAssignments is required — provide a map of groupKey to insuranceProviderId",
      );
    }

    const { groups, summary } = await groupServices(userId, filters);

    // Validate insurance assignments exist
    const assignedInsuranceIds = [...new Set(Object.values(insuranceAssignments))];
    const insuranceProviders = await prisma.insuranceProvider.findMany({
      where: { id: { in: assignedInsuranceIds }, userId, deletedAt: null },
      select: { id: true, name: true, policyNumber: true, groupNumber: true },
    });
    const insuranceMap = new Map(insuranceProviders.map((ip) => [ip.id, ip]));

    // Split groups into ready vs skipped
    const readyGroups: Array<ClaimGroup & { insuranceProviderId: string }> = [];
    const skippedGroups: ClaimGroup[] = [];

    for (const group of groups) {
      const insuranceId = insuranceAssignments[group.key];
      if (!insuranceId || !insuranceMap.has(insuranceId)) {
        group.validationIssues.push({
          field: "insuranceProviderId",
          message: "No insurance provider selected",
          entityType: "group",
          entityId: group.key,
        });
        group.isValid = false;
        skippedGroups.push(group);
        continue;
      }

      // Check insurance has required fields
      const ins = insuranceMap.get(insuranceId)!;
      if (!ins.policyNumber) {
        group.validationIssues.push({
          field: "policyNumber",
          message: `Insurance "${ins.name}" is missing policy number`,
          entityType: "insuranceProvider",
          entityId: ins.id,
          entityName: ins.name,
        });
      }
      if (!ins.groupNumber) {
        group.validationIssues.push({
          field: "groupNumber",
          message: `Insurance "${ins.name}" is missing group number`,
          entityType: "insuranceProvider",
          entityId: ins.id,
          entityName: ins.name,
        });
      }

      if (group.isValid) {
        readyGroups.push({ ...group, insuranceProviderId: insuranceId });
      } else {
        skippedGroups.push(group);
      }
    }

    if (readyGroups.length === 0) {
      throw new ValidationError(
        `No valid groups to generate claims from. ${skippedGroups.length} group(s) have validation issues that must be resolved first.`,
      );
    }

    // Determine part numbering for multi-batch groups
    const partCounters = new Map<string, number>();
    const baseKeyBatchCount = new Map<string, number>();
    for (const group of readyGroups) {
      const count = baseKeyBatchCount.get(group.key) ?? 0;
      baseKeyBatchCount.set(group.key, count + 1);
    }

    // Create claims in a transaction
    const created = await prisma.$transaction(async (tx) => {
      const results: Array<{
        claimId: string;
        claimPart: string | null;
        serviceCount: number;
        totalBilled: string;
        patient: string;
        clinician: string;
        insuranceProvider: string;
      }> = [];

      for (const group of readyGroups) {
        const batchCount = baseKeyBatchCount.get(group.key) ?? 1;
        let claimPart: string | null = null;
        if (batchCount > 1) {
          const partNum = (partCounters.get(group.key) ?? 0) + 1;
          partCounters.set(group.key, partNum);
          claimPart = String(partNum);
        }

        const allDiagnosisCodes = [
          ...new Set(group.services.flatMap((s) => s.diagnosisCodes)),
        ];

        const serviceIds = group.services.map((s) => s.id);

        const serviceRecords = await tx.serviceLineItem.findMany({
          where: { id: { in: serviceIds } },
          select: { superbillId: true },
        });
        const superbillIds = [...new Set(serviceRecords.map((s) => s.superbillId).filter(Boolean))];
        const superbillId = superbillIds.length === 1 ? superbillIds[0] : null;

        const claim = await tx.claim.create({
          data: {
            userId,
            insuranceProviderId: group.insuranceProviderId,
            clinicId: group.clinic.id,
            dependentId: group.dependent.id,
            claimPart,
            servicePeriodStart: group.servicePeriod.start,
            servicePeriodEnd: group.servicePeriod.end,
            totalBilled: group.totalBilled,
            status: "draft",
            submissionMethod: "clearinghouse",
            superbillId,
            notes: allDiagnosisCodes.length > 0
              ? `Dx: ${allDiagnosisCodes.join(", ")}`
              : null,
            claimEvents: {
              create: {
                eventType: "claim_created",
                newStatus: "draft",
                description: `Draft claim auto-generated from ${group.services.length} service line(s)`,
                source: "claim_grouping",
                metadataJson: {
                  serviceIds,
                  claimPart,
                  clinicianId: group.clinician.id,
                  clinicianName: group.clinician.name,
                  diagnosisCodes: allDiagnosisCodes,
                  insuranceProviderId: group.insuranceProviderId,
                } as unknown as Prisma.InputJsonValue,
              },
            },
          },
        });

        // Link services to the claim, set insurance, and update status
        await tx.serviceLineItem.updateMany({
          where: { id: { in: serviceIds } },
          data: {
            claimId: claim.id,
            insuranceProviderId: group.insuranceProviderId,
            status: "claim_ready",
          },
        });

        const insName = insuranceMap.get(group.insuranceProviderId)?.name ?? "";

        results.push({
          claimId: claim.id,
          claimPart,
          serviceCount: group.services.length,
          totalBilled: group.totalBilled,
          patient: `${group.dependent.firstName} ${group.dependent.lastName}`,
          clinician: group.clinician.name,
          insuranceProvider: insName,
        });
      }

      return results;
    });

    console.log(`Generated ${created.length} draft claims from ${summary.totalServices} services`);

    res.status(201).json({
      data: {
        created,
        skipped: skippedGroups.map((g) => ({
          patient: `${g.dependent.firstName} ${g.dependent.lastName}`,
          clinician: g.clinician.name,
          serviceCount: g.lineCount,
          issues: g.validationIssues,
        })),
        summary: {
          claimsCreated: created.length,
          servicesLinked: created.reduce((sum, c) => sum + c.serviceCount, 0),
          groupsSkipped: skippedGroups.length,
          totalBilled: created.reduce((sum, c) => sum + Number(c.totalBilled), 0).toFixed(2),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
