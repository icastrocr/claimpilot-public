import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  createClaimSchema,
  updateClaimSchema,
  claimEventSchema,
  isValidStatusTransition,
  type ClaimStatus,
} from "../utils/validators.js";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// GET /claims
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20),
    );
    const skip = (page - 1) * limit;

    const {
      status,
      insuranceProviderId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query as Record<string, string | undefined>;

    const where: Prisma.ClaimWhereInput = {
      userId,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (insuranceProviderId) where.insuranceProviderId = insuranceProviderId;

    if (search) {
      where.OR = [
        { claimNumber: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const allowedSortFields = [
      "createdAt",
      "updatedAt",
      "totalBilled",
      "status",
      "claimNumber",
      "servicePeriodStart",
    ];
    const orderField = allowedSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : "createdAt";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: orderDir },
        include: {
          clinic: { select: { id: true, name: true } },
          insuranceProvider: { select: { id: true, name: true } },
          dependent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              relationship: true,
            },
          },
          _count: { select: { serviceLineItems: true } },
          serviceLineItems: {
            where: { deletedAt: null },
            select: {
              clinician: { select: { id: true, name: true, credential: true } },
            },
            take: 1,
            orderBy: { dateOfService: "asc" },
          },
        },
      }),
      prisma.claim.count({ where }),
    ]);

    res.json({
      data: claims,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /claims
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = createClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const data = parsed.data;

    const claim = await prisma.claim.create({
      data: {
        userId,
        insuranceProviderId: data.insuranceProviderId,
        clinicId: data.clinicId,
        dependentId: data.dependentId,
        claimNumber: data.claimNumber ?? null,
        claimPart: data.claimPart ?? null,
        dateSubmitted: data.dateSubmitted
          ? new Date(data.dateSubmitted)
          : null,
        servicePeriodStart: data.servicePeriodStart
          ? new Date(data.servicePeriodStart)
          : null,
        servicePeriodEnd: data.servicePeriodEnd
          ? new Date(data.servicePeriodEnd)
          : null,
        totalBilled: data.totalBilled ?? null,
        allowedAmount: data.allowedAmount ?? null,
        amountSaved: data.amountSaved ?? null,
        insurancePaid: data.insurancePaid ?? null,
        patientResponsibility: data.patientResponsibility ?? null,
        deductibleApplied: data.deductibleApplied ?? null,
        copay: data.copay ?? null,
        coinsurance: data.coinsurance ?? null,
        planDoesNotCover: data.planDoesNotCover ?? null,
        claimProcessingCodes: data.claimProcessingCodes,
        status: data.status,
        statusDetail: data.statusDetail ?? null,
        submissionMethod: data.submissionMethod ?? null,
        superbillId: data.superbillId ?? null,
        advocateAction: data.advocateAction ?? null,
        advocateComments: data.advocateComments ?? null,
        notes: data.notes ?? null,
        claimEvents: {
          create: {
            eventType: "claim_created",
            newStatus: data.status,
            description: "Claim created",
            source: "system",
          },
        },
      },
    });

    // Log only claim ID, never PHI
    console.log(`Claim created: ${claim.id}`);

    res.status(201).json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// GET /claims/:id
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const claim = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      include: {
        clinic: true,
        insuranceProvider: true,
        dependent: true,
        serviceLineItems: {
          where: { deletedAt: null },
          include: {
            clinician: { select: { id: true, name: true, credential: true } },
          },
          orderBy: { dateOfService: "asc" },
        },
      },
    });

    if (!claim) throw new NotFoundError("Claim not found");

    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// PUT /claims/:id
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Claim not found");

    const data = parsed.data;

    // Validate status transition if status is changing
    if (data.status && data.status !== existing.status) {
      if (
        !isValidStatusTransition(
          existing.status as ClaimStatus,
          data.status as ClaimStatus,
        )
      ) {
        throw new ValidationError(
          `Invalid status transition from '${existing.status}' to '${data.status}'`,
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.insuranceProviderId !== undefined)
      updateData.insuranceProviderId = data.insuranceProviderId;
    if (data.clinicId !== undefined) updateData.clinicId = data.clinicId;
    if (data.dependentId !== undefined)
      updateData.dependentId = data.dependentId;
    if (data.claimNumber !== undefined)
      updateData.claimNumber = data.claimNumber;
    if (data.claimPart !== undefined) updateData.claimPart = data.claimPart;
    if (data.dateSubmitted !== undefined)
      updateData.dateSubmitted = data.dateSubmitted
        ? new Date(data.dateSubmitted)
        : null;
    if (data.servicePeriodStart !== undefined)
      updateData.servicePeriodStart = data.servicePeriodStart
        ? new Date(data.servicePeriodStart)
        : null;
    if (data.servicePeriodEnd !== undefined)
      updateData.servicePeriodEnd = data.servicePeriodEnd
        ? new Date(data.servicePeriodEnd)
        : null;
    if (data.totalBilled !== undefined)
      updateData.totalBilled = data.totalBilled;
    if (data.allowedAmount !== undefined)
      updateData.allowedAmount = data.allowedAmount;
    if (data.amountSaved !== undefined)
      updateData.amountSaved = data.amountSaved;
    if (data.insurancePaid !== undefined)
      updateData.insurancePaid = data.insurancePaid;
    if (data.patientResponsibility !== undefined)
      updateData.patientResponsibility = data.patientResponsibility;
    if (data.deductibleApplied !== undefined)
      updateData.deductibleApplied = data.deductibleApplied;
    if (data.copay !== undefined) updateData.copay = data.copay;
    if (data.coinsurance !== undefined)
      updateData.coinsurance = data.coinsurance;
    if (data.planDoesNotCover !== undefined)
      updateData.planDoesNotCover = data.planDoesNotCover;
    if (data.claimProcessingCodes !== undefined)
      updateData.claimProcessingCodes = data.claimProcessingCodes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.statusDetail !== undefined)
      updateData.statusDetail = data.statusDetail;
    if (data.submissionMethod !== undefined)
      updateData.submissionMethod = data.submissionMethod;
    if (data.superbillId !== undefined)
      updateData.superbillId = data.superbillId;
    if (data.advocateAction !== undefined)
      updateData.advocateAction = data.advocateAction;
    if (data.advocateComments !== undefined)
      updateData.advocateComments = data.advocateComments;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const claim = await prisma.$transaction(async (tx) => {
      const updated = await tx.claim.update({
        where: { id: req.params.id },
        data: updateData,
      });

      // Create status change event
      if (data.status && data.status !== existing.status) {
        await tx.claimEvent.create({
          data: {
            claimId: updated.id,
            eventType: "status_change",
            previousStatus: existing.status,
            newStatus: data.status,
            description: `Status changed from '${existing.status}' to '${data.status}'`,
            source: "system",
          },
        });
      }

      return updated;
    });

    console.log(`Claim updated: ${claim.id}`);

    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// DELETE /claims/:id (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Claim not found");

    await prisma.claim.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    console.log(`Claim soft-deleted: ${req.params.id}`);

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// GET /claims/:id/events
router.get("/:id/events", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const claim = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      select: { id: true },
    });

    if (!claim) throw new NotFoundError("Claim not found");

    const events = await prisma.claimEvent.findMany({
      where: { claimId: req.params.id },
      orderBy: { eventDate: "desc" },
    });

    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

// POST /claims/:id/events
router.post("/:id/events", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const claim = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      select: { id: true },
    });

    if (!claim) throw new NotFoundError("Claim not found");

    const parsed = claimEventSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const data = parsed.data;

    const event = await prisma.claimEvent.create({
      data: {
        claimId: req.params.id,
        eventType: data.eventType,
        eventDate: data.eventDate ? new Date(data.eventDate) : new Date(),
        description: data.description ?? null,
        metadataJson: data.metadataJson
          ? (data.metadataJson as Prisma.InputJsonValue)
          : undefined,
        source: data.source,
      },
    });

    res.status(201).json({ data: event });
  } catch (err) {
    next(err);
  }
});

// PUT /claims/:id/payment — Record payment info on a claim
router.put("/:id/payment", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.claim.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Claim not found");

    const { paymentDate, paymentCheckNumber, paymentAmount } = req.body;

    const claim = await prisma.$transaction(async (tx) => {
      const previousStatus = existing.status;

      const updated = await tx.claim.update({
        where: { id: req.params.id },
        data: {
          paymentDate: paymentDate ? new Date(paymentDate) : null,
          paymentCheckNumber: paymentCheckNumber || null,
          paymentAmount: paymentAmount != null ? String(paymentAmount) : null,
          status: "paid",
        },
      });

      await tx.claimEvent.create({
        data: {
          claimId: updated.id,
          eventType: "status_change",
          previousStatus,
          newStatus: "paid",
          description: `Payment recorded: $${paymentAmount || 0}${paymentCheckNumber ? ` (CK# ${paymentCheckNumber})` : ""}`,
          source: "manual",
          metadataJson: {
            paymentDate,
            paymentCheckNumber,
            paymentAmount,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

export default router;
