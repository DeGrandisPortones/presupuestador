import dotenv from "dotenv";
dotenv.config();

if (process.env.ALLOW_INSECURE_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.log("TLS verification DISABLED (DEV): NODE_TLS_REJECT_UNAUTHORIZED=0");
}

import express from "express";
import cors from "cors";
import morgan from "morgan";

import { createOdooClient } from "./odoo.js";
import { buildOdooRouter } from "./routes/odoo.routes.js";
import { buildAuthRouter } from "./routes/auth.routes.js";
import { buildQuotesRouter } from "./routes/quotes.routes.js";
import { buildCatalogRouter } from "./routes/catalog.routes.js";
import { buildAdminRouter } from "./routes/admin.routes.js";
import { buildPdfRouter } from "./routes/pdf.routes.js";
import { buildMeasurementsRouter } from "./routes/measurements.routes.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const odoo = createOdooClient({
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USERNAME,
  password: process.env.ODOO_PASSWORD,
  companyId: process.env.ODOO_COMPANY_ID || null,
});

const info = odoo?._debugInfo ? odoo._debugInfo() : null;
console.log("ODOO_URL:", process.env.ODOO_URL);
console.log("ODOO_DB :", process.env.ODOO_DB);
if (info?.jsonrpcUrl) console.log("JSONRPC :", info.jsonrpcUrl);
console.log("Odoo client executeKw type:", typeof odoo?.executeKw);

// Auth
app.use("/api/auth", buildAuthRouter());

// Odoo API
app.use("/api/odoo", buildOdooRouter(odoo));

// Quotes
app.use("/api/quotes", buildQuotesRouter(odoo));

// Measurements
app.use("/api/measurements", buildMeasurementsRouter());

// Catalog
app.use("/api/catalog", buildCatalogRouter(odoo));

// Admin
app.use("/api/admin", buildAdminRouter(odoo));

// PDF
app.use("/api/pdf", buildPdfRouter());

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Error handler
app.use((err, _req, res, _next) => {
  const status = err.status || 400;
  const msg = err?.message || "Error";
  console.error("ERROR:", msg);
  if (err?.odoo) {
    console.error("Odoo error:", err.odoo?.message || "");
    if (err.debug) console.error("Odoo debug:", err.debug);
  }
  res.status(status).json({ ok: false, error: msg });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));
