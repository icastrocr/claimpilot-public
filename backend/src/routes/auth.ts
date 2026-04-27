import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { generateTokens, verifyRefreshToken } from "../middleware/auth.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "../utils/validators.js";
import {
  AppError,
  ValidationError,
  UnauthorizedError,
} from "../utils/errors.js";

const router = Router();

// POST /auth/register
router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { handle, email, password } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { handle }],
        deletedAt: null,
      },
    });

    if (existing) {
      throw new AppError(
        existing.email === email
          ? "Email already registered"
          : "Handle already taken",
        409,
        "CONFLICT",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { handle, email, passwordHash },
    });

    const tokens = generateTokens({ userId: user.id, email: user.email });

    res.status(201).json({
      data: {
        user: { id: user.id, handle: user.handle, email: user.email },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const tokens = generateTokens({ userId: user.id, email: user.email });

    res.json({
      data: {
        user: { id: user.id, handle: user.handle, email: user.email },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("refreshToken is required");
    }

    const payload = verifyRefreshToken(parsed.data.refreshToken);

    const user = await prisma.user.findFirst({
      where: { id: payload.userId, deletedAt: null, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError("User not found or inactive");
    }

    const tokens = generateTokens({ userId: user.id, email: user.email });

    res.json({ data: tokens });
  } catch (err) {
    next(err);
  }
});

export default router;
