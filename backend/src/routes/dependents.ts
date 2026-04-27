import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  dependentSchema,
  updateDependentSchema,
} from "../utils/validators.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// GET /dependents
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

    const [dependents, total] = await Promise.all([
      prisma.dependent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { firstName: "asc" },
      }),
      prisma.dependent.count({ where }),
    ]);

    res.json({
      data: dependents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /dependents
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = dependentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const dependent = await prisma.dependent.create({
      data: {
        userId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        dateOfBirth: new Date(parsed.data.dateOfBirth),
        relationship: parsed.data.relationship,
        memberId: parsed.data.memberId ?? null,
      },
    });

    res.status(201).json({ data: dependent });
  } catch (err) {
    next(err);
  }
});

// GET /dependents/:id
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const dependent = await prisma.dependent.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!dependent) throw new NotFoundError("Dependent not found");

    res.json({ data: dependent });
  } catch (err) {
    next(err);
  }
});

// PUT /dependents/:id
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateDependentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.dependent.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Dependent not found");

    const data: Record<string, unknown> = { ...parsed.data };
    if (data.dateOfBirth) {
      data.dateOfBirth = new Date(data.dateOfBirth as string);
    }

    const dependent = await prisma.dependent.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: dependent });
  } catch (err) {
    next(err);
  }
});

// DELETE /dependents/:id (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.dependent.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Dependent not found");

    await prisma.dependent.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
