import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { errorHandler } from "../utils/errors.js";
import { generateTokens } from "../middleware/auth.js";

// ── Mock Prisma ──────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../lib/prisma.js", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

// Import routes AFTER mock setup
import authRoutes from "../routes/auth.js";
import claimsRoutes from "../routes/claims.js";
import { authMiddleware } from "../middleware/auth.js";

// ── Test app ─────────────────────────────────────────
function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);

  // A protected route to test auth middleware
  app.get("/protected", authMiddleware, (_req, res) => {
    res.json({ data: "ok" });
  });

  app.use(errorHandler);
  return app;
}

// ── Helpers ──────────────────────────────────────────
const TEST_USER = {
  id: "user-uuid-1234",
  handle: "testuser",
  email: "test@example.com",
  passwordHash: "", // set in beforeEach
  isActive: true,
  deletedAt: null,
};

describe("Auth Endpoints", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    TEST_USER.passwordHash = await bcrypt.hash("validPass1!", 4); // low rounds for speed
    app = createApp();
  });

  // ── Register ─────────────────────────────────────

  describe("POST /auth/register", () => {
    it("successful registration returns tokens", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: TEST_USER.id,
        handle: TEST_USER.handle,
        email: TEST_USER.email,
      });

      const res = await request(app).post("/auth/register").send({
        handle: "testuser",
        email: "test@example.com",
        password: "validPass1!",
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
      expect(res.body.data.user.email).toBe("test@example.com");
    });

    it("duplicate email returns 409", async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...TEST_USER,
        email: "test@example.com",
      });

      const res = await request(app).post("/auth/register").send({
        handle: "anotherhandle",
        email: "test@example.com",
        password: "validPass1!",
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("invalid email returns 422", async () => {
      const res = await request(app).post("/auth/register").send({
        handle: "testuser",
        email: "not-an-email",
        password: "validPass1!",
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("short password returns 422", async () => {
      const res = await request(app).post("/auth/register").send({
        handle: "testuser",
        email: "test@example.com",
        password: "short",
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── Login ────────────────────────────────────────

  describe("POST /auth/login", () => {
    it("successful login returns tokens", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(TEST_USER);

      const res = await request(app).post("/auth/login").send({
        email: "test@example.com",
        password: "validPass1!",
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
      expect(res.body.data.user.id).toBe(TEST_USER.id);
    });

    it("wrong password returns 401", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(TEST_USER);

      const res = await request(app).post("/auth/login").send({
        email: "test@example.com",
        password: "wrongpassword",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("non-existent user returns 401", async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const res = await request(app).post("/auth/login").send({
        email: "nobody@example.com",
        password: "somepassword",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ── Refresh ──────────────────────────────────────

  describe("POST /auth/refresh", () => {
    it("valid refresh token returns new access token", async () => {
      const tokens = generateTokens({
        userId: TEST_USER.id,
        email: TEST_USER.email,
      });

      mockPrisma.user.findFirst.mockResolvedValue(TEST_USER);

      const res = await request(app).post("/auth/refresh").send({
        refreshToken: tokens.refreshToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
    });

    it("invalid refresh token returns 401", async () => {
      const res = await request(app).post("/auth/refresh").send({
        refreshToken: "totally-invalid-token",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ── Protected Routes ─────────────────────────────

  describe("Protected route", () => {
    it("without token returns 401", async () => {
      const res = await request(app).get("/protected");

      expect(res.status).toBe(401);
    });

    it("with invalid token returns 401", async () => {
      const res = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer invalid-jwt-token");

      expect(res.status).toBe(401);
    });
  });
});
