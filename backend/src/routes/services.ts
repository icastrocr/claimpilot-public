import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  createServiceSchema,
  updateServiceSchema,
} from "../utils/validators.js";
import {
  ValidationError,
  NotFoundError,
} from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// GET /services
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
      clinicianId,
      insuranceProviderId,
      dateFrom,
      dateTo,
      search,
      sortBy = "dateOfService",
      sortOrder = "desc",
    } = req.query as Record<string, string | undefined>;

    const where: Prisma.ServiceLineItemWhereInput = {
      userId,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (clinicianId) where.clinicianId = clinicianId;
    if (insuranceProviderId) where.insuranceProviderId = insuranceProviderId;

    if (dateFrom || dateTo) {
      where.dateOfService = {};
      if (dateFrom)
        (where.dateOfService as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo)
        (where.dateOfService as Prisma.DateTimeFilter).lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { cptCode: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const allowedSortFields = [
      "dateOfService",
      "createdAt",
      "updatedAt",
      "billedAmount",
      "status",
      "cptCode",
    ];
    const orderField = allowedSortFields.includes(sortBy as string)
      ? (sortBy as string)
      : "dateOfService";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    const [services, total] = await Promise.all([
      prisma.serviceLineItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderField]: orderDir },
        include: {
          clinician: { select: { id: true, name: true, credential: true } },
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
        },
      }),
      prisma.serviceLineItem.count({ where }),
    ]);

    res.json({
      data: services,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /services/:id
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const service = await prisma.serviceLineItem.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      include: {
        clinician: true,
        clinic: true,
        insuranceProvider: true,
        dependent: true,
        claim: { select: { id: true, claimNumber: true, status: true } },
      },
    });

    if (!service) throw new NotFoundError("Service not found");

    res.json({ data: service });
  } catch (err) {
    next(err);
  }
});

// POST /services
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = createServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const data = parsed.data;

    const service = await prisma.serviceLineItem.create({
      data: {
        userId,
        clinicId: data.clinicId,
        dependentId: data.dependentId,
        insuranceProviderId: data.insuranceProviderId ?? null,
        clinicianId: data.clinicianId,
        dateOfService: new Date(data.dateOfService),
        cptCode: data.cptCode,
        cptModifier: data.cptModifier ?? null,
        units: data.units,
        placeOfService: data.placeOfService ?? null,
        diagnosisCodes: data.diagnosisCodes,
        billedAmount: data.billedAmount,
        description: data.description ?? null,
        status: "unsubmitted",
      },
    });

    console.log(`Service created: ${service.id}`);

    res.status(201).json({ data: service });
  } catch (err) {
    next(err);
  }
});

// PUT /services/:id
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.serviceLineItem.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Service not found");

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.clinicianId !== undefined) updateData.clinicianId = data.clinicianId;
    if (data.clinicId !== undefined) updateData.clinicId = data.clinicId;
    if (data.dependentId !== undefined) updateData.dependentId = data.dependentId;
    if (data.insuranceProviderId !== undefined)
      updateData.insuranceProviderId = data.insuranceProviderId;
    if (data.dateOfService !== undefined)
      updateData.dateOfService = new Date(data.dateOfService);
    if (data.cptCode !== undefined) updateData.cptCode = data.cptCode;
    if (data.cptModifier !== undefined) updateData.cptModifier = data.cptModifier;
    if (data.units !== undefined) updateData.units = data.units;
    if (data.placeOfService !== undefined) updateData.placeOfService = data.placeOfService;
    if (data.diagnosisCodes !== undefined) updateData.diagnosisCodes = data.diagnosisCodes;
    if (data.billedAmount !== undefined) updateData.billedAmount = data.billedAmount;
    if (data.description !== undefined) updateData.description = data.description;

    const service = await prisma.serviceLineItem.update({
      where: { id: req.params.id },
      data: updateData,
    });

    console.log(`Service updated: ${service.id}`);

    res.json({ data: service });
  } catch (err) {
    next(err);
  }
});

// DELETE /services/:id (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.serviceLineItem.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Service not found");

    await prisma.serviceLineItem.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    console.log(`Service soft-deleted: ${req.params.id}`);

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// POST /services/mark-submitted
router.post("/mark-submitted", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { serviceIds } = req.body;

    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      throw new ValidationError("serviceIds array is required and must not be empty");
    }

    const result = await prisma.serviceLineItem.updateMany({
      where: {
        id: { in: serviceIds },
        userId,
        deletedAt: null,
        status: "unsubmitted",
      },
      data: { status: "submitted" },
    });

    console.log(`${result.count} services marked as submitted`);

    res.json({ data: { updatedCount: result.count } });
  } catch (err) {
    next(err);
  }
});

export default router;
