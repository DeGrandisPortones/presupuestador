import express from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dbQuery } from "../db.js";
import { requireAuth } from "../auth.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { buildBudgetExtraSummaryLines } from "../pdfBudgetExtras.js";

const IVA_RATE = 0.21;

function isUuid(v) {
  const s = String(v || "").trim();
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}
function isShareToken(v) {
  const s = String(v || "").trim();
  return /^[a-zA-Z0-9_-]{24,128}$/.test(s);
}
function safeStr(v) {
  return String(v ?? "").trim();
}
function n2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function textOrDash(v) {
  return safeStr(v) || "—";
}
function pick(obj, pathValue, fallback = "") {
  try {
    return pathValue.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}
function getLogoPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "../assets/logo-degrandis.png");
}
function formatMoney(value) {
  const n = n2(value);
  try {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return n.toFixed(2);
  }
}
function formatQty(value) {
  const n = n2(value);
  try {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return n.toFixed(2);
  }
}
function getMarginPct(payload) {
  return n2(payload?.payload?.margin_percent_ui ?? payload?.margin_percent_ui ?? payload?.marginPercent ?? 0);
}
function getQuoteNumber(payload) {
  return safeStr(
    payload?.quote_number ??
      payload?.quoteNumber ??
      payload?.quote_id ??
      payload?.quoteId ??
      payload?.id ??
      payload?.payload?.quote_number ??
      payload?.payload?.quote_id ??
      "",
  );
}
function getSellerName(payload) {
  return safeStr(
    payload?.seller_name ??
      payload?.sellerName ??
      payload?.created_by_full_name ??
      payload?.created_by_username ??
      payload?.payload?.seller_name ??
      "",
  );
}
function sanitizeFilenamePart(value, fallback = "archivo") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
  return normalized || fallback;
}
function buildDownloadFilename(payload, fallbackPrefix = "presupuesto") {
  const customerName = sanitizeFilenamePart(payload?.end_customer?.name, "cliente");
  const quoteNo = sanitizeFilenamePart(getQuoteNumber(payload), fallbackPrefix);
  return `${customerName}_${quoteNo}.pdf`;
}
function stripSellerLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter((line) => line && !/^vendedor\s*:/i.test(line))
    .join("\n");
}
function formatShortDate(value) {
  const raw = safeStr(value);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("es-AR");
}
function getProductionPlanningText(payload) {
  const planning = payload?.production_planning || payload?.payload?.production_planning || null;
  if (!planning || typeof planning !== "object") return "";
  const weekNumber = safeStr(planning.week_number || planning.week || "");
  const startLabel = safeStr(planning.start_date_label || formatShortDate(planning.start_date));
  const endLabel = safeStr(planning.end_date_label || formatShortDate(planning.end_date));
  if (!weekNumber && !startLabel && !endLabel) return "";
  const weekPart = weekNumber ? `Semana ${weekNumber}` : "Semana estimada";
  if (startLabel || endLabel) return `${weekPart}, entre ${startLabel || "—"} y ${endLabel || "—"}`;
  return weekPart;
}
async function resolveMeasurementForm(quote) {
  let form = quote?.measurement_form || null;
  if (!form && quote?.measurement_source_quote_id) {
    const src = quote.measurement_source_quote_id;
    const srcId = isUuid(src) ? String(src) : Number(src);
    if (srcId) {
      const r2 = await dbQuery(`select measurement_form from public.presupuestador_quotes where id=$1 limit 1`, [srcId]);
      form = r2.rows?.[0]?.measurement_form || null;
    }
  }
  if (!form && quote?.original_quote_id) {
    const src = quote.original_quote_id;
    const srcId = isUuid(src) ? String(src) : Number(src);
    if (srcId) {
      const r3 = await dbQuery(`select measurement_form from public.presupuestador_quotes where id=$1 limit 1`, [srcId]);
      form = r3.rows?.[0]?.measurement_form || null;
    }
  }
  return form;
}
function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
function collectUniquePositiveInts(values = []) {
  return [...new Set(values.map(toPositiveInt).filter(Boolean))];
}
function summarizePdfLines(rawLines = []) {
  return (Array.isArray(rawLines) ? rawLines : []).map((line) => ({
    product_id: line?.product_id,
    odoo_external_id: line?.odoo_external_id,
    odoo_id: line?.odoo_id,
    odoo_template_id: line?.odoo_template_id,
    odoo_variant_id: line?.odoo_variant_id,
    name: line?.name,
    raw_name: line?.raw_name,
    qty: line?.qty,
  }));
}
async function readProductNamesStrict(odoo, productIds = []) {
  const ids = collectUniquePositiveInts(productIds);
  const out = new Map();
  if (!odoo || !ids.length) return out;

  const rows = await odoo.executeKw("product.product", "read", [ids], { fields: ["id", "name"] });
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = toPositiveInt(row?.id);
    if (id) out.set(id, safeStr(row?.name));
  }
  return out;
}
async function buildLines(payload, { useBasePrice, odoo }) {
  const coefPct = getMarginPct(payload);
  const coefFactor = 1 + coefPct / 100;
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];

  console.log("[PDF BACK STRICT] lineas recibidas", summarizePdfLines(rawLines));

  const productIds = collectUniquePositiveInts(rawLines.map((line) => line?.odoo_external_id || line?.odoo_id));
  console.log("[PDF BACK STRICT] productIds detectados", productIds);

  if (!productIds.length) {
    throw new Error("No llegaron ids de Odoo del producto en las líneas del presupuesto para generar el PDF.");
  }

  const productNames = await readProductNamesStrict(odoo, productIds);
  console.log("[PDF BACK STRICT] nombres recibidos desde product.product", Array.from(productNames.entries()));

  const lines = rawLines
    .map((l) => {
      const qty = n2(l?.qty);
      const basePrice = n2(l?.base_price ?? l?.basePrice ?? l?.base_price_unit ?? l?.price_unit ?? l?.priceUnit ?? l?.price ?? 0);
      const unitNet = useBasePrice ? basePrice : basePrice * coefFactor;
      const unit = unitNet * (1 + IVA_RATE);
      const totalNet = unitNet * qty;
      const total = unit * qty;

      const odooExternalId = toPositiveInt(l?.odoo_external_id || l?.odoo_id);
      if (!odooExternalId) {
        throw new Error(`Falta el ID Odoo del producto en la línea ${l?.product_id || "sin product_id"}.`);
      }

      const liveOdooName = safeStr(productNames.get(odooExternalId));
      if (!liveOdooName) {
        throw new Error(`No se pudo obtener desde Odoo el nombre del producto ${odooExternalId} para la línea ${l?.product_id || "sin product_id"}.`);
      }

      console.log("[PDF BACK STRICT] linea resuelta", {
        product_id: l?.product_id,
        odoo_external_id: odooExternalId,
        incoming_name: l?.name,
        incoming_raw_name: l?.raw_name,
        resolved_name_from_odoo_product: liveOdooName,
      });

      return {
        qty,
        name: liveOdooName,
        unit,
        total,
        totalNet,
      };
    })
    .filter((l) => l.qty > 0);

  const subtotalNet = lines.reduce((acc, l) => acc + l.totalNet, 0);
  const ivaAmount = subtotalNet * IVA_RATE;
  const grandTotal = subtotalNet + ivaAmount;
  return { lines, grandTotal, subtotalNet, ivaAmount, coefPct };
}
function drawPageFrame(doc, margin, pageNo, pageCount, footerLeft = "De Grandis Portones") {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.save().lineWidth(1).strokeColor("#B7BABC").roundedRect(margin, margin, w - margin * 2, h - margin * 2, 10).stroke().restore();
  doc.save().font("Helvetica").fontSize(9).fillColor("#6B7280")
    .text(footerLeft, margin, h - margin - 16, { width: w - margin * 2, align: "left" })
    .text(`Página ${pageNo} de ${pageCount}`, margin, h - margin - 16, { width: w - margin * 2, align: "right" })
    .restore();
}
function drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr }) {
  const logoPath = getLogoPath();
  const headerH = 64;
  const quoteNo = getQuoteNumber(payload);
  doc.save().strokeColor("#111827").lineWidth(1).moveTo(margin, margin + headerH).lineTo(margin + innerW, margin + headerH).stroke().restore();
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin + 8, margin + 8, { width: 180, height: 48, fit: [180, 48] });
  }
  doc.font("Helvetica-Bold").fillColor("#111827").fontSize(16).text(title, margin, margin + 18, { width: innerW, align: "center" });
  doc.font("Helvetica-Bold").fontSize(11).text(`NÚMERO ${quoteNo || "—"}`, margin, margin + 16, { width: innerW - 10, align: "right" });

  let y = margin + headerH + 12;
  const customerName = safeStr(payload?.end_customer?.name) || "(sin nombre)";
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(customerName.toUpperCase(), margin + 8, y);
  doc.font("Helvetica").fontSize(10).fillColor("#111827")
    .text(`Fecha ${dateStr}`, margin, y + 2, { width: innerW - 8, align: "right" })
    .text(`Vigencia ${validStr}`, margin, y + 16, { width: innerW - 8, align: "right" });
  return y + 44;
}
function drawInfoTable(doc, payload, y, margin, innerW, useBasePrice) {
  const endCustomer = payload?.end_customer || {};
  const customerName = safeStr(endCustomer?.name) || "(sin nombre)";
  const customerPhone = safeStr(endCustomer?.phone) || "—";
  const customerEmail = safeStr(endCustomer?.email) || "—";
  const sellerName = getSellerName(payload) || "—";
  const destinationRaw = safeStr(payload?.fulfillment_mode);
  const destination = destinationRaw === "acopio" ? "Acopio" : destinationRaw === "produccion" ? "Producción" : (destinationRaw || "—");
  const cols = useBasePrice
    ? [
        { w: innerW * 0.35, label: "Cliente", value: customerName },
        { w: innerW * 0.18, label: "Teléfono", value: customerPhone },
        { w: innerW * 0.22, label: "Email", value: customerEmail },
        { w: innerW * 0.13, label: "Destino", value: destination },
        { w: innerW * 0.12, label: "Vendedor", value: sellerName },
      ]
    : [
        { w: innerW * 0.38, label: "Cliente", value: customerName },
        { w: innerW * 0.22, label: "Teléfono", value: customerPhone },
        { w: innerW * 0.22, label: "Email", value: customerEmail },
        { w: innerW * 0.18, label: "Vendedor", value: sellerName },
      ];
  let x = margin;
  const h = 54;
  doc.save().fillColor("#F3F4F6").rect(margin, y, innerW, h).fill().restore();
  doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, h).stroke().restore();
  for (let i = 0; i < cols.length; i += 1) {
    const c = cols[i];
    if (i > 0) doc.save().strokeColor("#D1D5DB").moveTo(x, y).lineTo(x, y + h).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6B7280").text(c.label.toUpperCase(), x + 8, y + 8, { width: c.w - 16 });
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(c.value, x + 8, y + 24, { width: c.w - 16 });
    x += c.w;
  }
  return y + h + 10;
}
async function renderPdf({ title, payload, useBasePrice, odoo }) {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  const margin = 28;
  const innerW = doc.page.width - margin * 2;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-AR");
  const validityDays = n2(payload?.payload?.validity_days ?? payload?.validity_days ?? 1);
  const validUntil = (payload?.payload?.valid_until || payload?.valid_until)
    ? new Date(payload?.payload?.valid_until || payload?.valid_until)
    : new Date(now.getTime() + validityDays * 86400000);
  const validStr = validUntil.toLocaleDateString("es-AR");
  const extraCalculatedLines = await buildBudgetExtraSummaryLines(payload);
  const paymentMethod = safeStr(payload?.payload?.payment_method ?? payload?.payment_method);
  const productionPlanningText = getProductionPlanningText(payload);
  const obs = stripSellerLines(safeStr(payload?.note));
  const { lines, grandTotal, subtotalNet, ivaAmount } = await buildLines(payload, { useBasePrice, odoo });

  let y = drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr });
  y = drawInfoTable(doc, payload, y, margin, innerW, useBasePrice);

  const extraLines = [];
  if (paymentMethod) extraLines.push(`Forma de pago: ${paymentMethod}`);
  if (productionPlanningText) extraLines.push(`Fecha estimada de entrega "${productionPlanningText}"`);
  extraLines.push(...extraCalculatedLines);
  if (obs) extraLines.push(`Obs: ${obs}`);
  if (extraLines.length) {
    const txt = extraLines.join("   ·   ");
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(txt, margin + 2, y, { width: innerW - 4, lineGap: 2 });
    y = doc.y + 10;
  }

  const colDesc = innerW * 0.54;
  const colQty = innerW * 0.10;
  const colUnit = innerW * 0.18;
  const colTot = innerW * 0.18;
  const SAFE_BOTTOM_GAP = 56;
  let tableY = y;
  function pageBottom() {
    return doc.page.height - margin - SAFE_BOTTOM_GAP;
  }
  function drawTableHeader() {
    doc.save().fillColor("#E5E7EB").rect(margin, tableY, innerW, 28).fill().restore();
    doc.save().strokeColor("#D1D5DB").rect(margin, tableY, innerW, 28).stroke().restore();
    const headers = [
      [margin + 8, colDesc - 16, "DESCRIPCIÓN", "left"],
      [margin + colDesc + 8, colQty - 16, "CANT", "right"],
      [margin + colDesc + colQty + 8, colUnit - 16, "PRECIO c/IVA", "right"],
      [margin + colDesc + colQty + colUnit + 8, colTot - 16, "TOTAL c/IVA", "right"],
    ];
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    headers.forEach(([x, w, text, align]) => doc.text(text, x, tableY + 8, { width: w, align }));
    tableY += 28;
  }
  function ensureSpace(h) {
    if (tableY + h <= pageBottom()) return;
    doc.addPage();
    tableY = margin + 20;
    drawTableHeader();
  }

  drawTableHeader();
  for (const line of lines) {
    const rowH = Math.max(28, doc.heightOfString(line.name, { width: colDesc - 16 }) + 16);
    ensureSpace(rowH);
    doc.save().strokeColor("#D1D5DB").rect(margin, tableY, innerW, rowH).stroke().restore();
    const xQty = margin + colDesc;
    const xUnit = xQty + colQty;
    const xTot = xUnit + colUnit;
    [xQty, xUnit, xTot].forEach((x) => doc.save().strokeColor("#D1D5DB").moveTo(x, tableY).lineTo(x, tableY + rowH).stroke().restore());
    doc.font("Helvetica").fontSize(9.5).fillColor("#111827")
      .text(line.name, margin + 8, tableY + 8, { width: colDesc - 16 })
      .text(formatQty(line.qty), xQty + 8, tableY + 8, { width: colQty - 16, align: "right" })
      .text(`$ ${formatMoney(line.unit)}`, xUnit + 8, tableY + 8, { width: colUnit - 16, align: "right" })
      .text(`$ ${formatMoney(line.total)}`, xTot + 8, tableY + 8, { width: colTot - 16, align: "right" });
    tableY += rowH;
  }

  ensureSpace(100);
  const summaryX = margin + innerW * 0.68;
  const summaryW = innerW * 0.32;
  const rows = [
    ["Subtotal s/IVA", subtotalNet, 28, false],
    ["IVA", ivaAmount, 28, false],
    ["TOTAL (IVA incluido)", grandTotal, 36, true],
  ];
  for (const [label, amount, h, bold] of rows) {
    if (bold) doc.save().fillColor("#F3F4F6").rect(margin, tableY, innerW, h).fill().restore();
    doc.save().strokeColor("#D1D5DB").rect(margin, tableY, innerW, h).stroke().restore();
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10).fillColor("#111827")
      .text(label, margin + 8, tableY + 8, { width: innerW * 0.68 - 16, align: "right" })
      .text(`$ ${formatMoney(amount)}`, summaryX + 8, tableY + 8, { width: summaryW - 16, align: "right" });
    tableY += h;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawPageFrame(doc, margin, i + 1, range.count);
  }

  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(buffers))));
}
function prettyMeasurementValue(key, value) {
  const raw = safeStr(value);
  const maps = {
    colocacion: { dentro_vano: "Por dentro del vano", detras_vano: "Por detrás del vano" },
    accionamiento: { manual: "Manual", automatico: "Automático" },
    levadizo: { coplanar: "Coplanar", comun: "Común" },
  };
  return maps[key]?.[raw] || textOrDash(raw);
}
async function renderMeasurementPdf({ quote, form }) {
  const doc = new PDFDocument({ size: "A4", margin: 32, bufferPages: true });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  const logoPath = getLogoPath();
  if (fs.existsSync(logoPath)) doc.image(logoPath, 32, 20, { width: 160, height: 42, fit: [160, 42] });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("PLANILLA DE MEDICIÓN", 32, 34, { width: doc.page.width - 64, align: "center" });
  doc.moveDown(2);

  const c = quote?.end_customer || {};
  const rows = [
    ["Cliente", c.name],
    ["Teléfono", c.phone],
    ["Dirección", c.address],
    ["Localidad", c.city],
    ["Maps", c.maps_url],
    ["Fecha", pick(form, "fecha")],
    ["Distribuidor", pick(form, "distribuidor")],
    ["Nota de venta", quote?.odoo_sale_order_name || quote?.quote_number],
    ["Alto final (mm)", form?.alto_final_mm],
    ["Ancho final (mm)", form?.ancho_final_mm],
    ["Accionamiento", prettyMeasurementValue("accionamiento", pick(form, "accionamiento"))],
    ["Colocación", prettyMeasurementValue("colocacion", pick(form, "colocacion"))],
  ];

  rows.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6B7280").text(String(label || "").toUpperCase());
    doc.font("Helvetica").fontSize(11).fillColor("#111827").text(textOrDash(value));
    doc.moveDown(0.4);
  });

  const altos = Array.isArray(form?.esquema?.alto) ? form.esquema.alto : [];
  const anchos = Array.isArray(form?.esquema?.ancho) ? form.esquema.ancho : [];
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(12).text("Esquema de medidas");
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(11).text(`Altos: ${(altos.filter(Boolean).join(" / ")) || "—"}`);
  doc.text(`Anchos: ${(anchos.filter(Boolean).join(" / ")) || "—"}`);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawPageFrame(doc, 20, i + 1, range.count, "Planilla de medición · De Grandis Portones");
  }

  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(buffers))));
}
export function buildPdfRouter(odoo = null) {
  const router = express.Router();

  router.post("/presupuesto", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const pdf = await renderPdf({ title: "PRESUPUESTO", payload, useBasePrice: false, odoo });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${buildDownloadFilename(payload, "presupuesto")}"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  router.post("/proforma", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const pdf = await renderPdf({ title: "PROFORMA", payload, useBasePrice: true, odoo });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${buildDownloadFilename(payload, "proforma")}"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  router.get("/medicion/public/:token", async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const token = String(req.params.token || "").trim();
      if (!isShareToken(token)) return res.status(400).json({ ok: false, error: "token inválido" });
      const r = await dbQuery(`select * from public.presupuestador_quotes where measurement_share_token = $1 and measurement_share_enabled_at is not null limit 1`, [token]);
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Planilla no encontrada" });
      const form = await resolveMeasurementForm(quote);
      if (!form) return res.status(404).json({ ok: false, error: "Planilla no disponible" });
      const pdf = await renderMeasurementPdf({ quote, form });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="medicion_${quote.id}.pdf"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  router.get("/medicion/:id", requireAuth, async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const id = String(req.params.id || "").trim();
      if (!isUuid(id)) return res.status(400).json({ ok: false, error: "id inválido" });
      const r = await dbQuery(`select * from public.presupuestador_quotes where id=$1 limit 1`, [id]);
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Presupuesto no encontrado" });
      const isOwner = String(quote.created_by_user_id) === String(req.user.user_id);
      const can = isOwner || !!req.user.is_medidor || !!req.user.is_enc_comercial || !!req.user.is_rev_tecnica;
      if (!can) return res.status(403).json({ ok: false, error: "No autorizado" });
      const form = await resolveMeasurementForm(quote);
      if (!form) return res.status(400).json({ ok: false, error: "Este presupuesto todavía no tiene medición cargada" });
      const pdf = await renderMeasurementPdf({ quote, form });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="medicion_${id}.pdf"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  return router;
}
