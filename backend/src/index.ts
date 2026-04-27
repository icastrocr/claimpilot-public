import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { errorHandler } from "./utils/errors.js";

import authRoutes from "./routes/auth.js";
import claimsRoutes from "./routes/claims.js";
import servicesRoutes from "./routes/services.js";
import insuranceProvidersRoutes from "./routes/insurance-providers.js";
import clinicProvidersRoutes from "./routes/clinic-providers.js";
import dependentsRoutes from "./routes/dependents.js";
import importRoutes from "./routes/import.js";
import documentUploadRoutes from "./routes/document-upload.js";
import reconciliationReportsRoutes from "./routes/reconciliation-reports.js";
import claimGroupingRoutes from "./routes/claim-grouping.js";

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? "4000", 10);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes — all under /api/v1/
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/claims", claimsRoutes);
app.use("/api/v1/services", servicesRoutes);
app.use("/api/v1/insurance-providers", insuranceProvidersRoutes);
app.use("/api/v1/clinic-providers", clinicProvidersRoutes);
app.use("/api/v1/dependents", dependentsRoutes);
app.use("/api/v1/import", importRoutes);
app.use("/api/v1/documents", documentUploadRoutes);
app.use("/api/v1/reconciliation-reports", reconciliationReportsRoutes);
app.use("/api/v1/claims", claimGroupingRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
