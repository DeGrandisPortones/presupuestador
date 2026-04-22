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
import { buildClientAcceptanceRouter } from "./routes/clientAcceptance.routes.js";
import { buildDoorsRouter } from "./routes/doors.routes.js";
import { buildTechnicalConsultsRouter } from "./routes/technicalConsults.routes.js";
import { buildProductionPlanningRouter } from "./routes/productionPlanning.routes.js";
import { buildQuoteViewerRouter } from "./routes/quoteViewer.routes.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

console.log("[ODOO ENV]", {
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USERNAME,
  companyId: process.env.ODOO_COMPANY_ID || null,
});

const odoo = createOdooClient({
  url: process.env.ODOO_URL,
  db: process.env.ODOO_DB,
  username: process.env.ODOO_USERNAME,
  password: process.env.ODOO_PASSWORD,
  companyId: process.env.ODOO_COMPANY_ID || null,
});

app.use("/api/auth", buildAuthRouter());
app.use("/api/odoo", buildOdooRouter(odoo));
app.use("/api/production-planning", buildProductionPlanningRouter());
app.use("/api/quotes", buildQuotesRouter(odoo));
app.use("/api/doors", buildDoorsRouter(odoo));
app.use("/api/measurements", buildMeasurementsRouter(odoo));
app.use("/api/client-acceptance", buildClientAcceptanceRouter());
app.use("/api/catalog", buildCatalogRouter(odoo));
app.use("/api/admin", buildAdminRouter(odoo));
app.use("/api/quote-viewer", buildQuoteViewerRouter());
app.use("/api/technical-consults", buildTechnicalConsultsRouter());
app.use("/api/pdf", buildPdfRouter(odoo));
app.get("/health", (_req, res) => res.json({ ok: true }));

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
