import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { errorHandler } from "../utils/errors.js";

// ── Mock Prisma ──────────────────────────────────────

const mockTx = vi.hoisted(() => ({
  claim: {
    update: vi.fn(),
  },
  claimEvent: {
    create: vi.fn(),
  },
}));

const mockPrisma = vi.hoisted(() => ({
  claim: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  claimEvent: {
    create: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) =>
    fn(mockTx),
  ),
}));

vi.mock("../lib/prisma.js", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

// Import routes AFTER mock setup
import claimsRoutes from "../routes/claims.js";

// ── Test App ─────────────────────────────────────────

const TEST_USER_ID = "user-uuid-1234";
const JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-do-not-use-in-production";

function makeToken(userId = TEST_USER_ID) {
  return jwt.sign({ userId, email: "test@example.com" }, JWT_SECRET, {
    expiresIn: "15m",
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/claims", claimsRoutes);
  app.use(errorHandler);
  return app;
}

// ── Helpers ──────────────────────────────────────────

const VALID_CLAIM_BODY = {
  insuranceProviderId: "00000000-0000-4000-8000-000000000001",
  clinicId: "00000000-0000-4000-8000-000000000002",
  clinicianId: "00000000-0000-4000-8000-000000000003",
  dependentId: "00000000-0000-4000-8000-000000000004",
  dateOfService: "2025-03-01",
  cptCode: "90837",
  billedAmount: "200.00",
};

const EXISTING_CLAIM = {
  id: "claim-uuid-1234",
  userId: TEST_USER_ID,
  status: "draft",
  deletedAt: null,
  ...VALID_CLAIM_BODY,
  dateOfService: new Date("2025-03-01"),
  diagnosisCodes: [],
  claimProcessingCodes: [],
};

describe("Claims Endpoints", () => {
  let app: express.Express;
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    token = makeToken();
  });

  // ── GET /claims ──────────────────────────────────

  describe("GET /claims", () => {
    it("returns paginated list", async () => {
      const claims = [EXISTING_CLAIM];
      mockPrisma.claim.findMany.mockResolvedValue(claims);
      mockPrisma.claim.count.mockResolvedValue(1);

      const res = await request(app)
        .get("/claims")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it("filters by status", async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);
      mockPrisma.claim.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/claims?status=submitted")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      // Verify prisma was called with status filter
      const whereArg = mockPrisma.claim.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe("submitted");
    });

    it("filters by date range", async () => {
      mockPrisma.claim.findMany.mockResolvedValue([]);
      mockPrisma.claim.count.mockResolvedValue(0);

      const res = await request(app)
        .get("/claims?dateFrom=2025-01-01&dateTo=2025-12-31")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      const whereArg = mockPrisma.claim.findMany.mock.calls[0][0].where;
      expect(whereArg.dateOfService).toBeDefined();
      expect(whereArg.dateOfService.gte).toEqual(new Date("2025-01-01"));
      expect(whereArg.dateOfService.lte).toEqual(new Date("2025-12-31"));
    });
  });

  // ── POST /claims ─────────────────────────────────

  describe("POST /claims", () => {
    it("creates claim with valid data", async () => {
      mockPrisma.claim.create.mockResolvedValue({
        id: "new-claim-uuid",
        ...VALID_CLAIM_BODY,
        status: "draft",
      });

      const res = await request(app)
        .post("/claims")
        .set("Authorization", `Bearer ${token}`)
        .send(VALID_CLAIM_BODY);

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty("id");
    });

    it("rejects invalid data (missing required fields)", async () => {
      const res = await request(app)
        .post("/claims")
        .set("Authorization", `Bearer ${token}`)
        .send({ billedAmount: "100.00" }); // missing most required fields

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── GET /claims/:id ──────────────────────────────

  describe("GET /claims/:id", () => {
    it("returns claim with relations", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue({
        ...EXISTING_CLAIM,
        clinician: { id: "c1", name: "Dr. Smith", credential: "PhD" },
        clinic: { id: "cl1", name: "Good Clinic" },
        insuranceProvider: { id: "ip1", name: "BlueCross" },
        dependent: {
          id: "d1",
          firstName: "Jane",
          lastName: "Doe",
          relationship: "child",
        },
      });

      const res = await request(app)
        .get(`/claims/${EXISTING_CLAIM.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.clinician).toBeDefined();
      expect(res.body.data.insuranceProvider).toBeDefined();
    });

    it("returns 404 for non-existent claim", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get("/claims/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ── PUT /claims/:id ──────────────────────────────

  describe("PUT /claims/:id", () => {
    it("updates claim fields", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(EXISTING_CLAIM);
      mockTx.claim.update.mockResolvedValue({
        ...EXISTING_CLAIM,
        notes: "updated notes",
      });

      const res = await request(app)
        .put(`/claims/${EXISTING_CLAIM.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ notes: "updated notes" });

      expect(res.status).toBe(200);
    });

    it("valid status transition creates event", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue({
        ...EXISTING_CLAIM,
        status: "draft",
      });
      mockTx.claim.update.mockResolvedValue({
        ...EXISTING_CLAIM,
        id: EXISTING_CLAIM.id,
        status: "submitted",
      });
      mockTx.claimEvent.create.mockResolvedValue({ id: "event-1" });

      const res = await request(app)
        .put(`/claims/${EXISTING_CLAIM.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "submitted" });

      expect(res.status).toBe(200);
      expect(mockTx.claimEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "status_change",
            previousStatus: "draft",
            newStatus: "submitted",
          }),
        }),
      );
    });

    it("invalid status transition returns 422", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue({
        ...EXISTING_CLAIM,
        status: "draft",
      });

      const res = await request(app)
        .put(`/claims/${EXISTING_CLAIM.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "paid" });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── DELETE /claims/:id ───────────────────────────

  describe("DELETE /claims/:id", () => {
    it("soft deletes claim", async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(EXISTING_CLAIM);
      mockPrisma.claim.update.mockResolvedValue({
        ...EXISTING_CLAIM,
        deletedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/claims/${EXISTING_CLAIM.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: EXISTING_CLAIM.id,
        deleted: true,
      });

      // Verify soft delete (sets deletedAt, not hard delete)
      expect(mockPrisma.claim.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });
  });
});
