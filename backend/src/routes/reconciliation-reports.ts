import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { NotFoundError } from "../utils/errors.js";

const router = Router();
router.use(authMiddleware);

// GET /reconciliation-reports — list all reports for the user
router.get("/", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 20),
    );
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      prisma.reconciliationReport.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          clinic: true,
          patient: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          fileName: true,
          summaryJson: true,
          createdAt: true,
        },
      }),
      prisma.reconciliationReport.count({ where: { userId } }),
    ]);

    res.json({
      data: reports.map((r) => ({
        id: r.id,
        clinic: r.clinic,
        patient: r.patient,
        billingPeriodStart: r.billingPeriodStart,
        billingPeriodEnd: r.billingPeriodEnd,
        fileName: r.fileName,
        summary: r.summaryJson,
        createdAt: r.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /reconciliation-reports/:id — get full report with items
router.get("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const report = await prisma.reconciliationReport.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!report) {
      throw new NotFoundError("Reconciliation report not found");
    }

    res.json({
      data: {
        id: report.id,
        clinic: report.clinic,
        patient: report.patient,
        billingPeriodStart: report.billingPeriodStart,
        billingPeriodEnd: report.billingPeriodEnd,
        fileName: report.fileName,
        summary: report.summaryJson,
        items: report.itemsJson,
        createdAt: report.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /reconciliation-reports/:id — delete a report
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const report = await prisma.reconciliationReport.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!report) {
      throw new NotFoundError("Reconciliation report not found");
    }

    await prisma.reconciliationReport.delete({
      where: { id: report.id },
    });

    res.json({ message: "Report deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
