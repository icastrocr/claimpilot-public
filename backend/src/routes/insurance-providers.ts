import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  insuranceProviderSchema,
  updateInsuranceProviderSchema,
} from "../utils/validators.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// GET /insurance-providers
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

    const [providers, total] = await Promise.all([
      prisma.insuranceProvider.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.insuranceProvider.count({ where }),
    ]);

    res.json({
      data: providers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /insurance-providers
router.post("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = insuranceProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const provider = await prisma.insuranceProvider.create({
      data: { userId, ...parsed.data },
    });

    res.status(201).json({ data: provider });
  } catch (err) {
    next(err);
  }
});

// GET /insurance-providers/:id
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const provider = await prisma.insuranceProvider.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!provider) throw new NotFoundError("Insurance provider not found");

    res.json({ data: provider });
  } catch (err) {
    next(err);
  }
});

// PUT /insurance-providers/:id
router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const parsed = updateInsuranceProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      );
    }

    const existing = await prisma.insuranceProvider.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Insurance provider not found");

    const provider = await prisma.insuranceProvider.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    res.json({ data: provider });
  } catch (err) {
    next(err);
  }
});

// DELETE /insurance-providers/:id (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const existing = await prisma.insuranceProvider.findFirst({
      where: { id: req.params.id, userId, deletedAt: null },
    });

    if (!existing) throw new NotFoundError("Insurance provider not found");

    await prisma.insuranceProvider.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
