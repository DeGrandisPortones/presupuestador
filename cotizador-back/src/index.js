import "dotenv/config";

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

try {
  const info = odoo._debugInfo?.();
  console.log("ODOO_URL env:", process.env.ODOO_URL);
  console.log("ODOO_DB env:", process.env.ODOO_DB);
  console.log("Computed JSON-RPC:", info?.jsonrpcUrl);
} catch (_e) {
  // ignore
}

console.log("Odoo client executeKw type:", typeof odoo?.executeKw);

// Auth
app.use("/api/auth", buildAuthRouter(odoo));

// Odoo API
app.use("/api/odoo", buildOdooRouter(odoo));

app.use("/api/quotes", buildQuotesRouter(odoo));

// Catálogo enriquecido (secciones/tags/alias)
app.use("/api/catalog", buildCatalogRouter(odoo));

// Dashboard admin
app.use("/api/admin", buildAdminRouter(odoo));


// Error handler
app.use((err, _req, res, _next) => {
  console.error("ERROR:", err?.message || err);

  if (err?.response) {
    console.error("Odoo status:", err.response.status);
    console.error("Odoo data:", err.response.data);
  }

  res.status(400).json({
    ok: false,
    error: err?.message || "Error",
    odoo_status: err?.response?.status,
    odoo_data: err?.response?.data,
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API en http://localhost:${port}`));
