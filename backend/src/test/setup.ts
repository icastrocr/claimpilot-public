process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "7d";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/claimpilot_test";
