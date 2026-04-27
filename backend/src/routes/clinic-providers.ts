import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  clinicOrganizationSchema,
  updateClinicOrganizationSchema,
  clinicianSchema,
  updateClinicianSchema,
} from "../utils/validators.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// ── Clinic Organizations ──────────────────────────────

// GET /clinic-providers
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20),
    );
    const skip = (page - 1) * limit;

    const where = { userId, deletedAt: null };

    const [organizations, total] = await Promise.all([
      prisma.clinicOrganization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          clinicians: {
            where: { deletedAt: null },
            select: { id: true, name: true, credential: true, isActive: true },
          },
        },
      }),
      prisma.clinicOrganization.count({ where }),
    ]);

    res.json({
      data: organizations,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /clinic-providers
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = clinicOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const org = await prisma.clinicOrganization.create({
      data: { userId, ...parsed.data },
    });

    res.status(201).json({ data: org });
  } catch (err) {
    next(err);
  }
});

// GET /clinic-providers/:id
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const org = await prisma.clinicOrganization.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      include: {
        clinicians: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!org) throw new NotFoundError("Clinic organization not found");

    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

// PUT /clinic-providers/:id
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateClinicOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.clinicOrganization.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Clinic organization not found");

    const org = await prisma.clinicOrganization.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    res.json({ data: org });
  } catch (err) {
    next(err);
  }
});

// DELETE /clinic-providers/:id (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.clinicOrganization.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Clinic organization not found");

    await prisma.clinicOrganization.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ── Clinicians ────────────────────────────────────────

// GET /clinic-providers/:id/clinicians
router.get("/:id/clinicians", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const org = await prisma.clinicOrganization.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      select: { id: true },
    });

    if (!org) throw new NotFoundError("Clinic organization not found");

    const clinicians = await prisma.clinician.findMany({
      where: { clinicId: req.params.id, userId, deletedAt: null },
      orderBy: { name: "asc" },
    });

    res.json({ data: clinicians });
  } catch (err) {
    next(err);
  }
});

// POST /clinic-providers/:id/clinicians
router.post("/:id/clinicians", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const org = await prisma.clinicOrganization.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
      select: { id: true },
    });

    if (!org) throw new NotFoundError("Clinic organization not found");

    const parsed = clinicianSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const clinician = await prisma.clinician.create({
      data: {
        userId,
        clinicId: req.params.id,
        ...parsed.data,
      },
    });

    res.status(201).json({ data: clinician });
  } catch (err) {
    next(err);
  }
});

// PUT /clinic-providers/clinicians/:id
router.put("/clinicians/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateClinicianSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.clinician.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Clinician not found");

    const clinician = await prisma.clinician.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    res.json({ data: clinician });
  } catch (err) {
    next(err);
  }
});

// DELETE /clinic-providers/clinicians/:id (soft delete)
router.delete("/clinicians/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.clinician.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Clinician not found");

    await prisma.clinician.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
