import express from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dbQuery } from "../db.js";
import { requireAuth } from "../auth.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";
import { buildBudgetExtraSummaryLines, buildBudgetVanoTechnicalLines } from "../pdfBudgetExtras.js";
import { getProductPdfNameMap, normKind } from "../catalogDb.js";
import { resolveBudgetSectorSummary } from "../pdfBudgetSectorSummary.js";
import { addDaysUtc, formatDateAr } from "../productionPlanningUtils.js";

const IVA_RATE = 0.21;
// 4230 = "Servicio de Traslado a destino" de Puertas (duplicado dedicado, antes
// compartia el 2842 con Portones).
const SHIPPING_PRODUCT_IDS = new Set([2842, 4230]);
const DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS = new Set([2842, 4230, 3956, 3957, 3961, 3962, 3963, 3966, 4037, 3991, 3992, 3993, 3994, 3995, 3996, 3485, 3486, 3490, 3491, 3492, 3495, 3566, 3520, 3521, 3522, 3523, 3524, 3525]);
const IPANEL_DIVIDER_LINE_MM = 10;
const DOOR_PANEL_DIVIDER_LINE_MM = 10;
const DOOR_PANEL_CONFIGS = [
  {
    key: "exterior",
    title: "Panel Exterior",
    prefix: "puerta_panel_exterior_lamas",
    productIds: new Set([4108, 3637]),
  },
  {
    key: "interior",
    title: "Panel Interior",
    prefix: "puerta_panel_interior_lamas",
    // 4061/3590 = "Panel en Lamas 22mm" viejo (discontinuado en Odoo, se deja por
    // compatibilidad con presupuestos ya guardados con ese producto). 4227/3756 = su
    // reemplazo, mismo nombre "Panel en Lamas 22mm".
    productIds: new Set([4061, 3590, 4227, 3756]),
  },
];

const TERMS_AND_CONDITIONS = [
  "1. Formas de Pago: Aceptamos pagos en efectivo (pesos o dólares billete), transferencia bancaria, cheques o tarjeta de crédito (consultar por planes vigentes). Para confirmar el pedido se requiere una seña del 70% del valor total. El saldo restante deberá abonarse en su totalidad antes de la fecha del despacho del mismo. Los productos con saldos pendientes o deuda no serán liberados para su retiro.",
  "2. Plazos de Entrega: La fecha estimada de producción será la estipulada una vez que el cliente confirme las medidas, especificaciones y demás características del pedido. El plazo de producción comenzará a computarse a partir de la confirmación técnica del pedido y de la recepción del pago de la seña correspondiente.",
  "Los plazos indicados son estimativos y podrán variar por causas ajenas al proveedor, tales como demoras en el suministro de materiales, inconvenientes logísticos, fuerza mayor u otras circunstancias imprevistas, las cuales serán comunicadas oportunamente al cliente.",
  "3. Garantía: Nuestros productos cuentan con una garantía de 60 meses contra defectos de fabricación. Esta garantía no cubre daños causados por uso inadecuado o negligencia del cliente.",
  "4. Responsabilidad del Cliente: El cliente es responsable de proporcionar información completa y precisa al momento de realizar el pedido. Cualquier error u omisión en los datos brindados será responsabilidad exclusiva del cliente, pudiendo afectar la correcta producción y entrega del portón. Asimismo, el cliente deberá garantizar que el lugar de instalación se encuentre limpio, ordenado y con libre acceso. No deben existir escombros, montículos de arena u otros obstáculos que dificulten el ingreso del personal o la manipulación del producto. En caso de ser necesario se deberá contar con personas disponibles al momento de la entrega para colaborar con la descarga del portón, desde el área de logística se dispondrá esta información.",
  "5. Derechos de Propiedad: Todos los derechos de propiedad intelectual y derechos de autor de los productos y diseños son propiedad de DE GRANDIS PORTONES. Está prohibida la reproducción o distribución no autorizada.",
  "6. Ajustes y Variaciones: En caso de existir diferencias entre el presupuesto confirmado y las características finales del pedido (como medidas, diseño, materiales, entre otros), que generen costos adicionales, nos reservamos el derecho de facturar dichos montos sin previo aviso. El cliente deberá abonar estos importes adicionales antes de que se inicie la producción del portón.",
];

function isDistributorPayload(payload = {}) {
  return String(payload?.created_by_role || payload?.payload?.created_by_role || "").trim().toLowerCase() === "distribuidor";
}
// Precio de Envío: se lee el valor ya congelado en envio_odoo_price_snapshot
// (armado al crear el presupuesto, o al apretar "Actualizar presupuesto" en uno
// viejo). Si no existe (presupuesto viejo nunca actualizado) no se inventa nada
// y se mantiene el comportamiento historico ($0), para no cambiarlo solo.
function getEnvioOdooPriceSnapshot(payload = {}) {
  const raw = payload?.envio_odoo_price_snapshot ?? payload?.payload?.envio_odoo_price_snapshot;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function lineMatchesProductSet(line = {}, productSet) {
  const ids = [line?.product_id, line?.id, line?.odoo_id, line?.odoo_template_id, line?.odoo_variant_id, line?.odoo_external_id, line?.odoo_product_id];
  return ids.some((value) => productSet.has(Number(value || 0)));
}
function isShippingLine(line = {}) {
  return lineMatchesProductSet(line, SHIPPING_PRODUCT_IDS);
}
function isDistributorOwnSupplyLine(line = {}) {
  return lineMatchesProductSet(line, DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS);
}
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
  return safeStr(v) || "-";
}
function pick(obj, pathValue, fallback = "") {
  try {
    return pathValue.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}
function getCatalogKindFromPayload(payload) {
  return safeStr(payload?.catalog_kind || payload?.payload?.catalog_kind || "porton").toLowerCase();
}
function getPayloadObject(payload) {
  return payload?.payload && typeof payload.payload === "object" ? payload.payload : {};
}
function getDimensions(payload) {
  const p = getPayloadObject(payload);
  return p?.dimensions && typeof p.dimensions === "object" ? p.dimensions : {};
}
function getLogoPath(payload = null) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const catalogKind = getCatalogKindFromPayload(payload);
  if (catalogKind === "ipanel") {
    const ipanelLogo = path.join(__dirname, "../assets/logo-ipanel.png");
    if (fs.existsSync(ipanelLogo)) return ipanelLogo;
  }
  return path.join(__dirname, "../assets/logo-degrandis.png");
}
function getLogoDrawOptions(payload = null) {
  const catalogKind = getCatalogKindFromPayload(payload);
  if (catalogKind === "ipanel") return { fit: [142, 48], align: "left", valign: "center" };
  return { width: 180, height: 48, fit: [180, 48] };
}
function getPdfFooterLeft(payload = null, fallback = "De Grandis Portones") {
  const catalogKind = getCatalogKindFromPayload(payload);
  if (catalogKind === "ipanel") return "Ipanel";
  return fallback;
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
function isCondition2(payload) {
  return safeStr(payload?.payload?.condition_mode ?? payload?.condition_mode).toLowerCase() === "cond2";
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
function resolveLoggedUserSellerName(user, payload) {
  return safeStr(
    user?.full_name ??
      user?.username ??
      payload?.seller_name ??
      payload?.sellerName ??
      payload?.created_by_full_name ??
      payload?.created_by_username ??
      payload?.payload?.seller_name ??
      ""
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
function buildDownloadFilename(payload, fallbackPrefix = "presupuesto", namePrefix = "") {
  const customerName = sanitizeFilenamePart(payload?.end_customer?.name, "cliente");
  const quoteNo = sanitizeFilenamePart(getQuoteNumber(payload), fallbackPrefix);
  return `${namePrefix}${customerName}_${quoteNo}.pdf`;
}
function stripSellerLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter((line) => line && !/^vendedor\s*:/i.test(line) && !/^PRESUPUESTADOR_PUERTA_ORDER_REF\s*:/i.test(line))
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
  // Siempre en vivo: cada vez que se regenera el presupuesto/proforma tiene que mostrar
  // la estimación de producción ACTUAL según la disponibilidad de hoy, no una fecha
  // congelada. El snapshot inmutable (quoted_delivery_*, ver captureQuotedProductionEstimate)
  // existe aparte solo para poder consultar despues "qué le dijimos cuando confirmó" — no
  // se usa acá.
  // Se informa la semana estimada MAS la siguiente (pedido explicito: en todo lo que no sea
  // la pantalla de aceptacion del cliente se da un margen de una semana extra). No cambia la
  // semana realmente reservada (production_delivery_*), solo el texto.
  // Dos fuentes posibles: el boton "PDF presupuesto" del front pide una
  // estimacion en vivo (getProductionPlanningEstimate) y la manda como
  // payload.production_planning ({week_number, start_date_label, end_date_label, ...}).
  // Si el PDF se genera de otra forma (ej. regenerar desde la fila cruda de la
  // base, sin pasar por ese boton), esa estimacion en vivo no viene - ahi se
  // cae a las columnas ya persistidas en la quote (production_delivery_*).
  const planning = payload?.production_planning || payload?.payload?.production_planning || null;
  if (planning && typeof planning === "object") {
    const weekNumber = safeStr(planning.week_number || planning.week || "");
    const startLabel = safeStr(planning.start_date_label || formatShortDate(planning.start_date));
    // range_end_date_label ya viene calculado si el objeto lo trae buildDisplay() (estimacion
    // en vivo); si viene de un objeto armado a mano sin ese campo (ver listingPdf.js en el
    // front), se calcula acá mismo a partir de end_date + 7 dias.
    const endLabel = safeStr(planning.range_end_date_label)
      || (planning.end_date ? formatDateAr(addDaysUtc(planning.end_date, 7)) : "");
    const weekEndNumber = safeStr(planning.week_number_end) || (weekNumber ? String(Number(weekNumber) + 1) : "");
    if (weekNumber || startLabel || endLabel) {
      const weekPart = weekNumber ? `Semana ${weekNumber}${weekEndNumber ? ` - ${weekEndNumber}` : ""}` : "Semana estimada";
      if (startLabel || endLabel) return `${weekPart} (desde ${startLabel || "-"} hasta ${endLabel || "-"})`;
      return weekPart;
    }
  }

  const weekNumber = safeStr(payload?.production_delivery_week ?? payload?.payload?.production_delivery_week ?? "");
  const startLabel = formatShortDate(payload?.production_delivery_week_start ?? payload?.payload?.production_delivery_week_start);
  const rawEndDate = payload?.production_delivery_week_end ?? payload?.payload?.production_delivery_week_end;
  const endLabel = rawEndDate ? formatDateAr(addDaysUtc(rawEndDate, 7)) : "";
  if (!weekNumber && !startLabel && !endLabel) return "";
  const weekEndNumber = weekNumber ? String(Number(weekNumber) + 1) : "";
  const weekPart = weekNumber ? `Semana ${weekNumber}${weekEndNumber ? ` - ${weekEndNumber}` : ""}` : "Semana estimada";
  if (startLabel || endLabel) return `${weekPart} (desde ${startLabel || "-"} hasta ${endLabel || "-"})`;
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
function resolveProductTemplateId(line = {}) {
  return toPositiveInt(line?.odoo_id || line?.odoo_template_id || 0);
}
function resolveVariantId(line = {}) {
  return toPositiveInt(line?.odoo_variant_id || line?.product_id || line?.odoo_external_id || 0);
}
async function readOdooNamesFlexible(odoo, rawLines = []) {
  const out = { templateNameById: new Map(), variantNameById: new Map(), templateIdByVariantId: new Map() };
  if (!odoo) return out;

  const explicitTemplateIds = collectUniquePositiveInts(rawLines.map((line) => resolveProductTemplateId(line)));
  const variantIds = collectUniquePositiveInts(rawLines.map((line) => resolveVariantId(line)));
  let variantRows = [];
  if (variantIds.length) {
    try {
      variantRows = await odoo.executeKw("product.product", "read", [variantIds], { fields: ["id", "name", "display_name", "product_tmpl_id"] });
    } catch {
      variantRows = [];
    }
  }

  const templateIdsFromVariants = [];
  for (const row of Array.isArray(variantRows) ? variantRows : []) {
    const variantId = toPositiveInt(row?.id);
    const variantName = safeStr(row?.display_name || row?.name);
    const templateId = Array.isArray(row?.product_tmpl_id) ? toPositiveInt(row.product_tmpl_id[0]) : toPositiveInt(row?.product_tmpl_id);
    if (variantId && variantName) out.variantNameById.set(variantId, variantName);
    if (variantId && templateId) out.templateIdByVariantId.set(variantId, templateId);
    if (templateId) templateIdsFromVariants.push(templateId);
  }

  const templateIds = collectUniquePositiveInts([...explicitTemplateIds, ...templateIdsFromVariants]);
  let templateRows = [];
  if (templateIds.length) {
    try {
      templateRows = await odoo.executeKw("product.template", "read", [templateIds], { fields: ["id", "name", "display_name"] });
    } catch {
      templateRows = [];
    }
  }
  for (const row of Array.isArray(templateRows) ? templateRows : []) {
    const templateId = toPositiveInt(row?.id);
    const templateName = safeStr(row?.display_name || row?.name);
    if (templateId && templateName) out.templateNameById.set(templateId, templateName);
  }
  return out;
}
async function buildLines(payload, { useBasePrice, odoo, displayNetPrices = false, taxRate = IVA_RATE }) {
  const effectiveTaxRate = Number.isFinite(Number(taxRate)) ? Number(taxRate) : IVA_RATE;
  const coefPct = getMarginPct(payload);
  const coefFactor = 1 + coefPct / 100;
  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];
  const catalogKind = (() => {
    try { return normKind(payload?.catalog_kind || "porton"); } catch { return "porton"; }
  })();
  const productIds = collectUniquePositiveInts(rawLines.map((line) => line?.product_id));
  const pdfNameMap = await getProductPdfNameMap(catalogKind, productIds);
  const odooNames = await readOdooNamesFlexible(odoo, rawLines);
  const distributorPayload = isDistributorPayload(payload);
  // El envío lo sigue cobrando De Grandis aunque sea "provisión propia" del
  // distribuidor: en la proforma va al precio de la lista de precios del
  // distribuidor en Odoo, congelado en envio_odoo_price_snapshot (ver
  // computeEnvioOdooPriceSnapshot en quotes.routes.js - misma fuente que usa
  // calcOdooUnitPrice para lo que realmente se manda a Odoo, así la proforma y
  // la NV real nunca quedan desalineadas). Si por lo que sea todavía no se
  // pudo calcular (quote muy vieja, o Odoo no respondió ni una vez), se cae al
  // precio base de la línea - nunca a $0 silencioso.
  const envioOdooPriceSnapshot = getEnvioOdooPriceSnapshot(payload);

  const lines = rawLines
    .map((l) => {
      const qty = n2(l?.qty);
      const rawBasePrice = n2(l?.base_price ?? l?.basePrice ?? l?.base_price_unit ?? l?.price_unit ?? l?.priceUnit ?? l?.price ?? 0);
      const variantId = resolveVariantId(l);
      const isDistOwnSupply = distributorPayload && isDistributorOwnSupplyLine(l);
      const basePrice = useBasePrice && isDistOwnSupply
        ? (isShippingLine(l) && envioOdooPriceSnapshot != null ? envioOdooPriceSnapshot : (isShippingLine(l) ? rawBasePrice : 0))
        : rawBasePrice;
      // "Facturado previamente" (deposito ya cobrado): dato duro, no se le aplica
      // coeficiente/margen ni recargo por forma de pago. Si lleva IVA si depende de la
      // condicion con la que se envio a Odoo (calcOdooUnitPrice/getOdooConditionPriceFactor
      // en quotes.routes.js): Condicion 1 manda el neto sin IVA, asi que hay que sumarle el
      // 21% aca para que reste correctamente contra el total con IVA del presupuesto nuevo.
      // Condicion 2 ya manda neto+10,5%, pasa tal cual.
      const isPreviouslyBilled = !!l?.previously_billed_line;
      const previouslyBilledUnit = isCondition2(payload) ? basePrice : basePrice * (1 + IVA_RATE);
      const unitNet = isPreviouslyBilled ? basePrice : (useBasePrice ? basePrice : basePrice * coefFactor);
      const unit = isPreviouslyBilled ? previouslyBilledUnit : (displayNetPrices ? unitNet : unitNet * (1 + effectiveTaxRate));
      const totalNet = unitNet * qty;
      const total = unit * qty;
      const productId = toPositiveInt(l?.product_id);
      const explicitTemplateId = resolveProductTemplateId(l);
      const derivedTemplateId = odooNames.templateIdByVariantId.get(variantId) || 0;
      const templateId = explicitTemplateId || derivedTemplateId;
      const overrideName = safeStr(pdfNameMap.get(productId));
      const liveTemplateName = safeStr(odooNames.templateNameById.get(templateId));
      const liveVariantName = safeStr(odooNames.variantNameById.get(variantId));
      const payloadName = safeStr(l?.name || l?.raw_name || l?.display_name || l?.alias);
      const resolvedName = overrideName || liveTemplateName || liveVariantName || payloadName;
      if (!resolvedName) throw new Error(`No se pudo resolver el nombre para la línea ${productId || variantId || "sin id"}.`);
      return { qty, name: resolvedName, unit, total, totalNet, productId, previouslyBilledLine: isPreviouslyBilled };
    })
    .filter((l) => l.qty > 0);

  const rawExtraLines = Array.isArray(payload?.payload?.proforma_extra_lines)
    ? payload.payload.proforma_extra_lines
    : Array.isArray(payload?.proforma_extra_lines) ? payload.proforma_extra_lines : [];
  const extraLines = rawExtraLines
    .filter((l) => l && l.name && Number.isFinite(Number(l.base_price)))
    .map((l) => {
      const qty = n2(l?.qty ?? 1);
      const unitNet = Number(l.base_price);
      const unit = displayNetPrices ? unitNet : unitNet * (1 + effectiveTaxRate);
      return { qty, name: String(l.name), unit, total: unit * qty, totalNet: unitNet * qty };
    });

  const allLines = [...lines, ...extraLines];
  const subtotalNet = allLines.reduce((acc, l) => acc + l.totalNet, 0);
  const ivaAmount = subtotalNet * effectiveTaxRate;
  const grandTotal = subtotalNet + ivaAmount;
  return { lines: allLines, grandTotal, subtotalNet, ivaAmount, coefPct, taxRate: effectiveTaxRate, displayNetPrices, catalogKind };
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
function drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr, hideValidity = false }) {
  const logoPath = getLogoPath(payload);
  const headerH = 64;
  const quoteNo = getQuoteNumber(payload);
  doc.save().strokeColor("#111827").lineWidth(1.2).roundedRect(margin, margin, innerW, headerH, 10).stroke().restore();
  if (fs.existsSync(logoPath)) doc.image(logoPath, margin + 14, margin + 9, getLogoDrawOptions(payload));
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(title, margin + 205, margin + 12, { width: innerW - 360, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#374151").text(`Fecha: ${dateStr}`, margin + innerW - 135, margin + 14, { width: 120, align: "right" });
  if (!hideValidity) doc.text(`Válido hasta: ${validStr}`, margin + innerW - 135, margin + 28, { width: 120, align: "right" });
  if (quoteNo) doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(`#${quoteNo}`, margin + 205, margin + 38, { width: innerW - 360, align: "center" });
  return margin + headerH + 10;
}
function drawInfoTable(doc, payload, y, margin, innerW, useBasePrice) {
  const c = payload?.end_customer || {};
  const customerName = c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "-";
  const customerPhone = c.phone || "-";
  const customerEmail = c.email || "-";
  const sellerName = resolveLoggedUserSellerName(null, payload) || "-";
  const address = [c.address, c.city].filter(Boolean).join(" - ");
  const cols = useBasePrice
    ? [
        { w: innerW * 0.36, label: "Cliente", value: customerName },
        { w: innerW * 0.22, label: "Teléfono", value: customerPhone },
        { w: innerW * 0.22, label: "Dirección", value: address || "-" },
        { w: innerW * 0.20, label: "Vendedor", value: sellerName },
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
    const cInfo = cols[i];
    if (i > 0) doc.save().strokeColor("#D1D5DB").moveTo(x, y).lineTo(x, y + h).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6B7280").text(cInfo.label.toUpperCase(), x + 8, y + 8, { width: cInfo.w - 16 });
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(cInfo.value, x + 8, y + 24, { width: cInfo.w - 16 });
    x += cInfo.w;
  }
  return y + h + 10;
}
// Observación cargada por el vendedor/distribuidor al confirmar el presupuesto
// (budget_observation). Va en su propio recuadro destacado, separado del resto
// de la info tecnica/comercial, para que quede claramente identificable en el
// documento (a diferencia de "Obs:" mas abajo, que es metadata tecnica auto-generada).
function drawObservationBand(doc, { y, margin, innerW, text }) {
  const clean = safeStr(text);
  if (!clean) return y;
  const padX = 10;
  const padY = 8;
  const labelH = 14;
  const textW = innerW - padX * 2;
  doc.font("Helvetica").fontSize(10);
  const textH = doc.heightOfString(clean, { width: textW, lineGap: 2 });
  const h = Math.max(28, Math.ceil(labelH + textH + padY * 2));
  doc.save().fillColor("#FFF8E1").rect(margin, y, innerW, h).fill().restore();
  doc.save().strokeColor("#F2D08A").rect(margin, y, innerW, h).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("OBSERVACIÓN", margin + padX, y + padY);
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(clean, margin + padX, y + padY + labelH, { width: textW, lineGap: 2 });
  return y + h + 4;
}
function drawInfoBand(doc, { y, margin, innerW, items, fillColor = "#FFFFFF" }) {
  const cleanItems = (Array.isArray(items) ? items : []).map((item) => safeStr(item)).filter(Boolean);
  if (!cleanItems.length) return y;
  const text = cleanItems.join("   -   ");
  const padX = 8;
  const padY = 6;
  const textW = innerW - padX * 2;
  doc.font("Helvetica").fontSize(10);
  const textH = doc.heightOfString(text, { width: textW, lineGap: 2 });
  const h = Math.max(28, Math.ceil(textH + padY * 2));
  doc.save().fillColor(fillColor).rect(margin, y, innerW, h).fill().restore();
  doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, h).stroke().restore();
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(text, margin + padX, y + padY, { width: textW, lineGap: 2 });
  return y + h + 4;
}

// Igual que drawInfoBand, pero cada item va en su propio renglon (en vez de
// unirse todo con guiones en un solo parrafo).
function drawLinesBand(doc, { y, margin, innerW, items }) {
  const cleanItems = (Array.isArray(items) ? items : []).map((item) => safeStr(item)).filter(Boolean);
  if (!cleanItems.length) return y;
  const padX = 10;
  const padY = 8;
  const lineGapPx = 4;
  const textW = innerW - padX * 2;
  doc.font("Helvetica").fontSize(10);
  const lineHeights = cleanItems.map((text) => doc.heightOfString(text, { width: textW, lineGap: 2 }));
  const contentH = lineHeights.reduce((acc, h) => acc + h + lineGapPx, -lineGapPx);
  const h = Math.max(28, Math.ceil(contentH + padY * 2));
  doc.save().fillColor("#FFFFFF").rect(margin, y, innerW, h).fill().restore();
  doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, h).stroke().restore();
  let cy = y + padY;
  cleanItems.forEach((text, i) => {
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(text, margin + padX, cy, { width: textW, lineGap: 2 });
    cy += lineHeights[i] + lineGapPx;
  });
  return y + h;
}

// Igual que drawLinesBand, pero en dos columnas lado a lado (para el
// membrete tecnico: sistema/dimensiones a la izquierda, paso/peso/piernas a
// la derecha). Cada columna se calcula y dibuja de forma independiente.
function drawTwoColumnLinesBand(doc, { y, margin, innerW, left, right }) {
  const cleanLeft = (Array.isArray(left) ? left : []).map((item) => safeStr(item)).filter(Boolean);
  const cleanRight = (Array.isArray(right) ? right : []).map((item) => safeStr(item)).filter(Boolean);
  if (!cleanLeft.length && !cleanRight.length) return y;
  const padX = 10;
  const padY = 8;
  const lineGapPx = 4;
  const colGap = 20;
  const colW = (innerW - padX * 2 - colGap) / 2;
  doc.font("Helvetica").fontSize(10);
  const measure = (arr) => arr.map((text) => doc.heightOfString(text, { width: colW, lineGap: 2 }));
  const leftHeights = measure(cleanLeft);
  const rightHeights = measure(cleanRight);
  const sumH = (heights) => heights.reduce((acc, h) => acc + h + lineGapPx, -lineGapPx);
  const contentH = Math.max(sumH(leftHeights), sumH(rightHeights), 0);
  const h = Math.max(28, Math.ceil(contentH + padY * 2));
  doc.save().fillColor("#FFFFFF").rect(margin, y, innerW, h).fill().restore();
  doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, h).stroke().restore();
  doc.save().strokeColor("#E5E7EB").moveTo(margin + padX + colW + colGap / 2, y + padY).lineTo(margin + padX + colW + colGap / 2, y + h - padY).stroke().restore();
  let cy = y + padY;
  cleanLeft.forEach((text, i) => {
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(text, margin + padX, cy, { width: colW, lineGap: 2 });
    cy += leftHeights[i] + lineGapPx;
  });
  const xRight = margin + padX + colW + colGap;
  cy = y + padY;
  cleanRight.forEach((text, i) => {
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(text, xRight, cy, { width: colW, lineGap: 2 });
    cy += rightHeights[i] + lineGapPx;
  });
  return y + h;
}

// Envuelve el contenido dibujado por drawContent en un recuadro con borde
// redondeado marcado (mismo estilo que los bloques de sector), con una barra
// de titulo opcional arriba.
function drawFramedBox(doc, { y, margin, innerW, headerLabel, drawContent }) {
  const blockStartY = y;
  const startPageCount = doc.bufferedPageRange().count;
  if (headerLabel) {
    doc.save().fillColor("#E5E7EB").rect(margin, y, innerW, 22).fill().restore();
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111827").text(headerLabel.toUpperCase(), margin + 10, y + 6, { width: innerW - 20, align: "center" });
    y += 22;
  }
  y = drawContent(y);
  if (doc.bufferedPageRange().count === startPageCount) {
    doc.save().strokeColor("#111827").lineWidth(1.5).roundedRect(margin, blockStartY, innerW, y - blockStartY, 10).stroke().restore();
  }
  return y + 12;
}

function parsePositiveNumber(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function formatNumberCompact(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 100) / 100).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}
function formatMeters(value) {
  const n = parsePositiveNumber(value);
  if (!n) return "-";
  return `${formatNumberCompact(n)} m`;
}
function formatMmValue(value) {
  const n = parsePositiveNumber(value);
  if (!n) return "-";
  return `${formatNumberCompact(n)} mm`;
}
function normalizeIpanelLamasOrientation(value) {
  const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (raw.includes("vert")) return "vertical";
  return "horizontal";
}
function ipanelOrientationLabel(value) {
  return normalizeIpanelLamasOrientation(value) === "vertical" ? "Vertical" : "Horizontal";
}
function getIpanelDimensionsForPdf(payload) {
  const dims = getDimensions(payload);
  const orientation = normalizeIpanelLamasOrientation(
    dims?.ipanel_lamas_orientacion ?? dims?.orientacion_ipanel_lamas ?? dims?.ipanel_orientacion_lamas ?? dims?.ipanel_lamas_orientation ?? "horizontal",
  );
  const divisionsRaw = dims?.ipanel_divisiones ?? dims?.cantidad_divisiones_ipanel ?? "";
  const divisions = Math.max(0, Math.trunc(Number(divisionsRaw || 0)));
  const sectionSizes = (Array.isArray(dims?.ipanel_divisiones_medidas_mm)
    ? dims.ipanel_divisiones_medidas_mm
    : Array.isArray(dims?.medidas_divisiones_ipanel_mm)
      ? dims.medidas_divisiones_ipanel_mm
      : Array.isArray(dims?.ipanel_section_sizes_mm)
        ? dims.ipanel_section_sizes_mm
        : [])
    .slice(0, divisions || undefined)
    .map((item) => parsePositiveNumber(item))
    .filter((item) => item > 0);
  const widthM = parsePositiveNumber(dims?.width);
  const heightM = parsePositiveNumber(dims?.height);
  const dividersIncluded = dims?.ipanel_divisiones_incluyen_liston === true || String(dims?.ipanel_divisiones_incluyen_liston || "").trim().toLowerCase() === "true" || String(dims?.ipanel_distribucion_divisiones || dims?.ipanel_divisiones_distribucion || "").trim().toLowerCase() === "clasica";
  return { widthM, heightM, orientation, divisions, sectionSizes, dividersIncluded, title: "Ipanel" };
}
function buildIpanelInfoLines(payload) {
  if (getCatalogKindFromPayload(payload) !== "ipanel") return [];
  const info = getIpanelDimensionsForPdf(payload);
  const rows = [];
  if (info.widthM || info.heightM) rows.push(`Medidas Ipanel: ancho ${formatMeters(info.widthM)} x alto ${formatMeters(info.heightM)}`);
  return rows;
}
function buildPuertaInfoLines(payload) {
  if (getCatalogKindFromPayload(payload) !== "puerta") return [];
  const p = getPayloadObject(payload);
  const dims = getDimensions(payload);
  const rows = [];
  const linkedPortonRef = safeStr(p?.linked_porton_reference);
  if (linkedPortonRef) rows.push(`Vinculado a portón: ${linkedPortonRef}`);
  const widthMm = parsePositiveNumber(dims?.width) * 1000;
  const heightMm = parsePositiveNumber(dims?.height) * 1000;
  if (widthMm || heightMm) rows.push(`Ancho: ${formatMmValue(widthMm)} - Alto: ${formatMmValue(heightMm)}`);
  return rows;
}
function drawPanelScheme(doc, { x, y, width, info, title = "Esquema" }) {
  if (!info.widthM || !info.heightM || !info.sectionSizes.length) return y;
  const maxW = Math.min(300, width - 200);
  const maxH = 160;
  const panelRatio = info.widthM / info.heightM;
  let panelW = maxW;
  let panelH = panelW / panelRatio;
  if (panelH > maxH) {
    panelH = maxH;
    panelW = panelH * panelRatio;
  }
  panelW = Math.max(160, Math.min(maxW, panelW));
  panelH = Math.max(90, Math.min(maxH, panelH));
  const panelX = x + 20;
  const panelY = y + 48;
  const sideX = panelX + panelW + 30;
  const isVertical = info.orientation === "vertical";
  const axisMm = isVertical ? info.widthM * 1000 : info.heightM * 1000;
  const axisPx = isVertical ? panelW : panelH;
  const dividerMm = info.dividersIncluded ? 0 : (Number(info.dividerMm || 0) || IPANEL_DIVIDER_LINE_MM);
  const totalMm = info.sectionSizes.reduce((acc, n) => acc + n, 0) + Math.max(0, info.sectionSizes.length - 1) * dividerMm;
  const scaleCorrection = totalMm > 0 ? axisMm / totalMm : 1;

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(title, x + 8, y + 12, { width: width - 16 });
  doc.font("Helvetica").fontSize(9).fillColor("#374151").text(`Ancho ${formatMeters(info.widthM)} · Alto ${formatMeters(info.heightM)} · Lamas ${ipanelOrientationLabel(info.orientation).toLowerCase()}`, x + 8, y + 28, { width: width - 16 });
  doc.save().roundedRect(panelX, panelY, panelW, panelH, 8).fillAndStroke("#FFFFFF", "#111827").restore();

  let cursorMm = 0;
  for (let index = 0; index < info.sectionSizes.length; index += 1) {
    const sectionMm = info.sectionSizes[index] * scaleCorrection;
    const startPx = axisMm > 0 ? (cursorMm / axisMm) * axisPx : 0;
    const sizePx = axisMm > 0 ? (sectionMm / axisMm) * axisPx : 0;
    const fill = index % 2 === 0 ? "#DFF3F6" : "#EEF2F7";
    if (isVertical) {
      doc.save().rect(panelX + startPx, panelY, Math.max(1, sizePx), panelH).fill(fill).restore();
      if (index > 0) doc.save().strokeColor("#EF2323").lineWidth(1.4).moveTo(panelX + startPx, panelY).lineTo(panelX + startPx, panelY + panelH).stroke().restore();
    } else {
      doc.save().rect(panelX, panelY + startPx, panelW, Math.max(1, sizePx)).fill(fill).restore();
      if (index > 0) doc.save().strokeColor("#EF2323").lineWidth(1.4).moveTo(panelX, panelY + startPx).lineTo(panelX + panelW, panelY + startPx).stroke().restore();
    }
    cursorMm += sectionMm + dividerMm * scaleCorrection;
  }
  doc.save().roundedRect(panelX, panelY, panelW, panelH, 8).strokeColor("#111827").lineWidth(1.8).stroke().restore();

  const detailRows = [
    ["Orientación", ipanelOrientationLabel(info.orientation)],
    ["Divisiones", String(info.divisions || info.sectionSizes.length)],
    ["Secciones", info.sectionSizes.map(formatMmValue).join(" / ")],
    ["Distribución", info.dividersIncluded ? "Clásica" : "Repartida / manual"],
  ];
  let detailY = panelY;
  for (const [label, value] of detailRows) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#6B7280").text(label.toUpperCase(), sideX, detailY, { width: width - (sideX - x) - 12 });
    doc.font("Helvetica").fontSize(9.5).fillColor("#111827").text(value || "-", sideX, detailY + 12, { width: width - (sideX - x) - 12, lineGap: 1 });
    detailY = doc.y + 8;
  }
  return y + Math.max(220, panelH + 82);
}
function drawIpanelPdfBlock(doc, { y, margin, innerW, pageBottom }) {
  const payload = this.payload || {};
  const info = getIpanelDimensionsForPdf(payload);
  if (getCatalogKindFromPayload(payload) !== "ipanel") return y;
  const hasAnything = info.widthM || info.heightM || info.sectionSizes.length || info.divisions;
  if (!hasAnything) return y;
  const blockH = info.sectionSizes.length && info.widthM && info.heightM ? 235 : 70;
  if (y + blockH > pageBottom()) {
    doc.addPage();
    y = margin + 20;
  }
  doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, blockH).stroke().restore();
  if (info.sectionSizes.length && info.widthM && info.heightM) return drawPanelScheme(doc, { x: margin, y, width: innerW, info, title: "Esquema del Ipanel" });
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Medidas del Ipanel", margin + 8, y + 10, { width: innerW - 16 });
  doc.font("Helvetica").fontSize(9.5).fillColor("#111827").text(buildIpanelInfoLines(payload).join(" · "), margin + 8, y + 28, { width: innerW - 16, lineGap: 2 });
  return y + blockH + 8;
}

function panelField(config, name) {
  return `${config.prefix}_${name}`;
}
function payloadHasProduct(payload, productSet) {
  return (Array.isArray(payload?.lines) ? payload.lines : []).some((line) => lineMatchesProductSet(line, productSet));
}
function getDoorPanelInfo(payload, config) {
  if (getCatalogKindFromPayload(payload) !== "puerta") return null;
  if (!payloadHasProduct(payload, config.productIds)) return null;
  const dims = getDimensions(payload);
  const completed = dims?.[panelField(config, "setup_completed")] === true || dims?.[panelField(config, "popup_completed")] === true;
  if (!completed) return null;
  const orientation = normalizeIpanelLamasOrientation(
    dims?.[panelField(config, "orientacion")] ?? dims?.[panelField(config, "orientation")] ?? "horizontal",
  );
  const divisions = Math.max(0, Math.trunc(Number(dims?.[panelField(config, "divisiones")] ?? dims?.[panelField(config, "cantidad_divisiones")] ?? 0)));
  const sectionSizes = (Array.isArray(dims?.[panelField(config, "divisiones_medidas_mm")])
    ? dims[panelField(config, "divisiones_medidas_mm")]
    : Array.isArray(dims?.[panelField(config, "section_sizes_mm")])
      ? dims[panelField(config, "section_sizes_mm")]
      : [])
    .slice(0, divisions || undefined)
    .map((item) => parsePositiveNumber(item))
    .filter((item) => item > 0);
  if (!sectionSizes.length) return null;
  const widthM = parsePositiveNumber(dims?.[panelField(config, "width")] ?? dims?.width);
  const heightM = parsePositiveNumber(dims?.[panelField(config, "height")] ?? dims?.height);
  const distribution = safeStr(dims?.[panelField(config, "distribucion_divisiones")] ?? dims?.[panelField(config, "divisiones_distribucion")]).toLowerCase();
  const dividersIncluded = dims?.[panelField(config, "divisiones_incluyen_liston")] === true || String(dims?.[panelField(config, "divisiones_incluyen_liston")] || "").trim().toLowerCase() === "true" || distribution === "clasica";
  const dividerMm = parsePositiveNumber(dims?.[panelField(config, "divisor_mm")] ?? dims?.[panelField(config, "linea_division_mm")] ?? DOOR_PANEL_DIVIDER_LINE_MM) || DOOR_PANEL_DIVIDER_LINE_MM;
  if (!widthM || !heightM) return null;
  return { widthM, heightM, orientation, divisions, sectionSizes, dividersIncluded, dividerMm, title: config.title };
}
function drawDoorPanelSchemesPdfBlock(doc, { y, margin, innerW, pageBottom, payload }) {
  if (getCatalogKindFromPayload(payload) !== "puerta") return y;
  const infos = DOOR_PANEL_CONFIGS
    .map((config) => ({ config, info: getDoorPanelInfo(payload, config) }))
    .filter((item) => item.info);
  if (!infos.length) return y;

  for (const { info } of infos) {
    const blockH = 235;
    if (y + blockH > pageBottom()) {
      doc.addPage();
      y = margin + 20;
    }
    doc.save().strokeColor("#D1D5DB").rect(margin, y, innerW, blockH).stroke().restore();
    y = drawPanelScheme(doc, { x: margin, y, width: innerW, info, title: `Esquema ${info.title}` });
  }
  return y;
}

function drawTermsAndConditionsPage(doc, { title, payload, margin, innerW, dateStr, validStr }) {
  doc.addPage();
  const titleY = drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr });
  const x = margin + 14;
  const width = innerW - 28;
  let y = titleY + 14;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Términos y Condiciones de Venta:", x, y, { width });
  y = doc.y + 10;
  doc.font("Helvetica").fontSize(8.8).fillColor("#111827");
  for (const paragraph of TERMS_AND_CONDITIONS) {
    doc.text(paragraph, x, y, { width, lineGap: 2, align: "left" });
    y = doc.y + 7;
  }
}

// Configs candidatas para que los 3 sectores entren en una sola hoja: se
// prueban de mas espaciosa a mas compacta (ver pickSectorBlockCfg) y solo se
// achica letra/espaciado si con la espaciosa no alcanza.
const SECTOR_BLOCK_CFGS = [
  { headerH: 24, itemFontSize: 9.5, rowPad: 12, rowMinH: 22, subtotalH: 26, blockGap: 12 },
  { headerH: 21, itemFontSize: 9, rowPad: 9, rowMinH: 19, subtotalH: 22, blockGap: 8 },
  { headerH: 18, itemFontSize: 8.3, rowPad: 7, rowMinH: 16, subtotalH: 20, blockGap: 6 },
  { headerH: 16, itemFontSize: 7.6, rowPad: 5, rowMinH: 14, subtotalH: 18, blockGap: 4 },
];

function measureSectorBlockHeight(doc, { innerW, items, cfg }) {
  const textWidth = innerW - 32;
  let h = cfg.headerH;
  doc.font("Helvetica").fontSize(cfg.itemFontSize);
  for (const item of items) {
    const bulletText = `•  ${item.productName}`;
    const textH = doc.heightOfString(bulletText, { width: textWidth });
    h += Math.max(cfg.rowMinH, textH + cfg.rowPad);
  }
  h += cfg.subtotalH + cfg.blockGap;
  return h;
}

// Elige, entre SECTOR_BLOCK_CFGS, la mas espaciosa que hace entrar los 3
// sectores en el alto disponible; si ninguna alcanza, usa la mas compacta
// (el ensureSpace de drawSectorItemsBlock queda como red de seguridad).
function pickSectorBlockCfg(doc, { innerW, sectors, availableH }) {
  for (const cfg of SECTOR_BLOCK_CFGS) {
    const neededH = sectors.reduce((acc, s) => acc + measureSectorBlockHeight(doc, { innerW, items: s.items, cfg }), 0);
    if (neededH <= availableH) return cfg;
  }
  return SECTOR_BLOCK_CFGS[SECTOR_BLOCK_CFGS.length - 1];
}

function drawSectorItemsBlock(doc, { y, margin, innerW, pageBottom, headerLabel, headerFill, subtotalLabel, items, total, cfg = SECTOR_BLOCK_CFGS[0] }) {
  const { headerH, itemFontSize, rowPad, rowMinH, subtotalH, blockGap } = cfg;
  const blockStartY = y;
  const startPageCount = doc.bufferedPageRange().count;

  function ensureSpace(h) {
    if (y + h <= pageBottom()) return;
    doc.addPage();
    y = margin + 20;
  }

  ensureSpace(headerH);
  doc.save().fillColor(headerFill).rect(margin, y, innerW, headerH).fill().restore();
  doc.font("Helvetica-Bold").fontSize(Math.min(10.5, itemFontSize + 1)).fillColor("#111827")
    .text(headerLabel.toUpperCase(), margin + 10, y + Math.max(4, (headerH - 11) / 2), { width: innerW - 20, align: "center" });
  y += headerH;

  const textWidth = innerW - 32;
  for (const item of items) {
    const bulletText = `•  ${item.productName}`;
    doc.font("Helvetica").fontSize(itemFontSize);
    const textH = doc.heightOfString(bulletText, { width: textWidth });
    const rowH = Math.max(rowMinH, textH + rowPad);
    ensureSpace(rowH);
    doc.save().strokeColor("#E5E7EB").rect(margin, y, innerW, rowH).stroke().restore();
    doc.font("Helvetica").fontSize(itemFontSize).fillColor("#111827").text(bulletText, margin + 16, y + Math.max(3, (rowPad - 2) / 2), { width: textWidth });
    y += rowH;
  }

  ensureSpace(subtotalH);
  doc.save().fillColor("#F3F4F6").rect(margin, y, innerW, subtotalH).fill().restore();
  doc.font("Helvetica-Bold").fontSize(Math.min(10, itemFontSize + 0.5)).fillColor("#111827")
    .text(subtotalLabel, margin + 10, y + Math.max(4, (subtotalH - 11) / 2), { width: innerW * 0.68 - 10 })
    .text(`$ ${formatMoney(total)}`, margin + innerW * 0.68, y + Math.max(4, (subtotalH - 11) / 2), { width: innerW * 0.32 - 10, align: "right" });
  y += subtotalH;

  if (doc.bufferedPageRange().count === startPageCount) {
    doc.save().strokeColor("#111827").lineWidth(1.5).roundedRect(margin, blockStartY, innerW, y - blockStartY, 10).stroke().restore();
  }
  y += blockGap;

  return y;
}

// Primera hoja del presupuesto/proforma: agrupa las lineas por sector
// (Producto/Automatizacion/Servicios) segun la seccion de catalogo de cada
// producto. Solo se llama cuando resolveBudgetSectorSummary encontro al
// menos una seccion con sector asignado; la hoja de detalle de siempre sigue
// exactamente igual, arrancando en la pagina siguiente.
function drawBudgetSectorSummaryPage(doc, { title, payload, margin, innerW, dateStr, validStr, hideValidity, summary, useBasePrice, technicalLines, paymentLines }) {
  const SAFE_BOTTOM_GAP = 56;
  function pageBottom() {
    return doc.page.height - margin - SAFE_BOTTOM_GAP;
  }

  let y = drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr, hideValidity });
  y = drawFramedBox(doc, { y, margin, innerW, drawContent: (yy) => drawInfoTable(doc, payload, yy, margin, innerW, useBasePrice) });
  if (technicalLines?.left?.length || technicalLines?.right?.length) {
    y = drawFramedBox(doc, { y, margin, innerW, headerLabel: "Datos técnicos", drawContent: (yy) => drawTwoColumnLinesBand(doc, { y: yy, margin, innerW, left: technicalLines.left, right: technicalLines.right }) });
  }
  if (paymentLines?.length) {
    y = drawFramedBox(doc, { y, margin, innerW, headerLabel: "Forma de pago y producción estimada", drawContent: (yy) => drawLinesBand(doc, { y: yy, margin, innerW, items: paymentLines }) });
  }
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text("Presupuesto", margin, y, { width: innerW, align: "center" });
  y = doc.y + 12;

  // Los 3 sectores (y su TOTAL/SUBTOTAL) tienen que entrar en esta misma hoja: se mide
  // el alto disponible y se elige la config mas espaciosa que alcance. Si hay "Facturado
  // previamente" hay que reservar tambien el espacio de esa fila y del TOTAL real de abajo,
  // sino esas dos filas terminan solas en la hoja siguiente.
  const totalBoxH = 36 + 16;
  const previouslyBilledExtraH = summary.previouslyBilled ? (24 + 12) + totalBoxH : 0;
  const availableForSectors = pageBottom() - y - totalBoxH - previouslyBilledExtraH;
  const sectorCfg = pickSectorBlockCfg(doc, { innerW, sectors: summary.sectors, availableH: availableForSectors });

  for (const sector of summary.sectors) {
    y = drawSectorItemsBlock(doc, {
      y, margin, innerW, pageBottom,
      headerLabel: sector.label,
      headerFill: "#E5E7EB",
      subtotalLabel: `Subtotal ${sector.label}`,
      items: sector.items,
      total: sector.total,
      cfg: sectorCfg,
    });
  }

  // Si hay "Facturado previamente" (presupuesto editado tras generar la NP), el total de
  // los 3 sectores pasa a ser un subtotal: se muestra la resta en rojo debajo y despues el
  // TOTAL real (subtotal - facturado previamente). Todo este bloque final tiene que quedar
  // junto: si no entra completo en lo que resta de la hoja, se manda entero a una hoja nueva
  // (nunca se parte a la mitad). Antes de resignarse a saltar de hoja, se prueba una version
  // mas compacta del bloque (presupuestos con muchos items, con los 3 sectores ya al maximo
  // de compactos, pueden dejar poco lugar) - misma logica que SECTOR_BLOCK_CFGS.
  const hasPreviouslyBilled = !!summary.previouslyBilled;
  const TOTALS_BLOCK_SIZES = {
    normal: { boxH: 36, boxGap: 16, lineH: 24, lineGap: 12, boxFont: 12, lineFont: 11 },
    compact: { boxH: 20, boxGap: 4, lineH: 13, lineGap: 3, boxFont: 9, lineFont: 8.5 },
  };
  function totalsBlockH(size) {
    return hasPreviouslyBilled
      ? (size.boxH + size.boxGap) * 2 + (size.lineH + size.lineGap)
      : (size.boxH + size.boxGap);
  }
  const remainingH = pageBottom() - y;
  const totalsSize = totalsBlockH(TOTALS_BLOCK_SIZES.normal) <= remainingH
    ? TOTALS_BLOCK_SIZES.normal
    : (totalsBlockH(TOTALS_BLOCK_SIZES.compact) <= remainingH ? TOTALS_BLOCK_SIZES.compact : TOTALS_BLOCK_SIZES.normal);
  if (totalsBlockH(totalsSize) > remainingH) {
    doc.addPage();
    y = margin + 20;
  }
  doc.save().fillColor("#F3F4F6").rect(margin, y, innerW, totalsSize.boxH).fill().restore();
  doc.save().strokeColor("#111827").lineWidth(1.6).rect(margin, y, innerW, totalsSize.boxH).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(totalsSize.boxFont).fillColor("#111827")
    .text(hasPreviouslyBilled ? "SUBTOTAL" : "TOTAL", margin + 10, y + (totalsSize.boxH - totalsSize.boxFont) / 2, { width: innerW * 0.68 - 10 })
    .text(`$ ${formatMoney(summary.grandTotal)}`, margin + innerW * 0.68, y + (totalsSize.boxH - totalsSize.boxFont) / 2, { width: innerW * 0.32 - 10, align: "right" });
  y += totalsSize.boxH + totalsSize.boxGap;

  if (hasPreviouslyBilled) {
    doc.font("Helvetica-Bold").fontSize(totalsSize.lineFont).fillColor("#B91C1C")
      .text(summary.previouslyBilled.productName, margin + 10, y, { width: innerW * 0.68 - 10 })
      .text(`- $ ${formatMoney(Math.abs(summary.previouslyBilled.amount))}`, margin + innerW * 0.68, y, { width: innerW * 0.32 - 10, align: "right" });
    y += totalsSize.lineH + totalsSize.lineGap;

    doc.save().fillColor("#F3F4F6").rect(margin, y, innerW, totalsSize.boxH).fill().restore();
    doc.save().strokeColor("#111827").lineWidth(1.6).rect(margin, y, innerW, totalsSize.boxH).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(totalsSize.boxFont).fillColor("#111827")
      .text("TOTAL", margin + 10, y + (totalsSize.boxH - totalsSize.boxFont) / 2, { width: innerW * 0.68 - 10 })
      .text(`$ ${formatMoney(summary.finalTotal)}`, margin + innerW * 0.68, y + (totalsSize.boxH - totalsSize.boxFont) / 2, { width: innerW * 0.32 - 10, align: "right" });
    y += totalsSize.boxH + totalsSize.boxGap;
  }

  if (summary.unassigned) {
    drawSectorItemsBlock(doc, {
      y, margin, innerW, pageBottom,
      headerLabel: "Secciones sin asignar",
      headerFill: "#FEF3C7",
      subtotalLabel: "Subtotal sin asignar",
      items: summary.unassigned.items,
      total: summary.unassigned.total,
    });
  }
}

// Corte pedido explicitamente: los presupuestos creados hasta el 14/7/2026
// (inclusive) tienen que seguir saliendo exactamente igual que en main hoy -
// el formato nuevo (resumen por sector, membrete, sin cantidades en el
// detalle) solo aplica a presupuestos creados desde el 15/7/2026. Un
// presupuesto sin created_at todavia (borrador nuevo, sin guardar) usa la
// fecha actual, que es la que terminara siendo su created_at real al guardarlo.
const NEW_BUDGET_FORMAT_CUTOFF_MS = new Date("2026-07-15T00:00:00-03:00").getTime();
function quoteUsesNewBudgetFormat(payload) {
  const createdAtRaw = payload?.created_at || payload?.payload?.created_at || new Date().toISOString();
  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) return true;
  return createdAt.getTime() >= NEW_BUDGET_FORMAT_CUTOFF_MS;
}

async function renderPdf({ title, payload, useBasePrice, odoo, includeTerms = false, hideIvaBreakdown = false, displayNetPrices = false, taxRate = IVA_RATE, hideAllPrices = false, hideDetailPrices = false, allowNewBudgetFormat = true }) {
  // La proforma nunca debe tocarse por el corte de fecha - pasa allowNewBudgetFormat:false
  // explicitamente para que jamas le aparezca el resumen por sector/membrete, sin importar
  // la fecha de creacion del presupuesto.
  const usesNewBudgetFormat = allowNewBudgetFormat && quoteUsesNewBudgetFormat(payload);
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
  const vanoTechnicalLines = (hideAllPrices || !usesNewBudgetFormat) ? { left: [], right: [] } : await buildBudgetVanoTechnicalLines(payload);
  const paymentMethod = safeStr(payload?.payload?.payment_method ?? payload?.payment_method);
  const productionPlanningText = getProductionPlanningText(payload);
  const obs = stripSellerLines(safeStr(payload?.note));
  // Observación cargada por vendedor/distribuidor (campo separado de "note": ver
  // budget_observation en quotes.routes.js / CotizadorPage). Se muestra en un
  // recuadro propio, no mezclada con la metadata tecnica de "Obs:" de arriba.
  const budgetObservationText = safeStr(
    payload?.payload?.budget_observation ??
      payload?.budget_observation ??
      payload?.payload?.presupuesto_observacion ??
      payload?.presupuesto_observacion
  );
  const { lines, grandTotal, subtotalNet, ivaAmount, taxRate: effectiveTaxRate, catalogKind } = await buildLines(payload, { useBasePrice, odoo, displayNetPrices, taxRate });

  const commercialInfoLines = [];
  if (paymentMethod) commercialInfoLines.push(`Forma de pago: ${paymentMethod}`);
  if (productionPlanningText && getCatalogKindFromPayload(payload) !== "puerta") commercialInfoLines.push(`Fecha estimada de producción "${productionPlanningText}"`);

  const sectorSummary = (hideAllPrices || !usesNewBudgetFormat) ? null : await resolveBudgetSectorSummary({ catalogKind, lines, odoo });
  if (sectorSummary) {
    drawBudgetSectorSummaryPage(doc, { title, payload, margin, innerW, dateStr, validStr, hideValidity: hideAllPrices, summary: sectorSummary, useBasePrice, technicalLines: vanoTechnicalLines, paymentLines: commercialInfoLines });
    doc.addPage();
  }

  let y = drawHeader(doc, { title, payload, margin, innerW, dateStr, validStr, hideValidity: hideAllPrices });
  y = drawInfoTable(doc, payload, y, margin, innerW, useBasePrice);

  const technicalInfoLines = [];
  technicalInfoLines.push(...extraCalculatedLines);
  technicalInfoLines.push(...buildIpanelInfoLines(payload));
  technicalInfoLines.push(...buildPuertaInfoLines(payload));
  if (obs) technicalInfoLines.push(`Obs: ${obs}`);

  const beforeInfoY = y;
  y = drawInfoBand(doc, { y, margin, innerW, items: commercialInfoLines, fillColor: "#FFFFFF" });
  y = drawInfoBand(doc, { y, margin, innerW, items: technicalInfoLines, fillColor: "#FFFFFF" });
  y = drawObservationBand(doc, { y, margin, innerW, text: budgetObservationText });
  if (y !== beforeInfoY) y += 6;

  // hideDetailPrices: variante pedida para "PRESUPUESTO" - saca el precio SOLO de la
  // tabla de detalle linea por linea (misma grilla que hideAllPrices), pero a diferencia
  // de hideAllPrices deja el resumen por sector y el total final intactos. Junto con la
  // cantidad, es parte del "formato nuevo" y por lo tanto tambien respeta el corte de fecha.
  const hideRowPrices = hideAllPrices || (hideDetailPrices && usesNewBudgetFormat);
  const colDesc = hideRowPrices ? innerW : innerW * 0.54;
  const colQty = hideRowPrices ? 0 : innerW * 0.10;
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
    const headers = hideRowPrices
      ? [
          [margin + 8, colDesc - 16, "DESCRIPCIÓN", "left"],
        ]
      : [
          [margin + 8, colDesc - 16, "DESCRIPCIÓN", "left"],
          [margin + colDesc + 8, colQty - 16, "CANT", "right"],
          [margin + colDesc + colQty + 8, colUnit - 16, displayNetPrices ? "PRECIO s/IVA" : (hideIvaBreakdown ? "PRECIO" : "PRECIO c/IVA"), "right"],
          [margin + colDesc + colQty + colUnit + 8, colTot - 16, displayNetPrices ? "TOTAL s/IVA" : (hideIvaBreakdown ? "TOTAL" : "TOTAL c/IVA"), "right"],
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
    if (hideRowPrices) {
      doc.font("Helvetica").fontSize(9.5).fillColor("#111827")
        .text(line.name, margin + 8, tableY + 8, { width: colDesc - 16 });
    } else {
      const xUnit = xQty + colQty;
      const xTot = xUnit + colUnit;
      [xQty, xUnit, xTot].forEach((x) => doc.save().strokeColor("#D1D5DB").moveTo(x, tableY).lineTo(x, tableY + rowH).stroke().restore());
      doc.font("Helvetica").fontSize(9.5).fillColor("#111827")
        .text(line.name, margin + 8, tableY + 8, { width: colDesc - 16 })
        .text(formatQty(line.qty), xQty + 8, tableY + 8, { width: colQty - 16, align: "right" })
        .text(`$ ${formatMoney(line.unit)}`, xUnit + 8, tableY + 8, { width: colUnit - 16, align: "right" })
        .text(`$ ${formatMoney(line.total)}`, xTot + 8, tableY + 8, { width: colTot - 16, align: "right" });
    }
    tableY += rowH;
  }

  if (!hideAllPrices) {
    ensureSpace(hideIvaBreakdown ? 48 : 100);
    const summaryX = margin + innerW * 0.68;
    const summaryW = innerW * 0.32;
    const rows = hideIvaBreakdown
      ? [["TOTAL", grandTotal, 36, true]]
      : [
          ["Subtotal s/IVA", subtotalNet, 28, false],
          ["IVA", ivaAmount, 28, false],
          ["TOTAL", grandTotal, 36, true],
        ];
    for (const [label, amount, h, bold] of rows) {
      if (bold) doc.save().fillColor("#F3F4F6").rect(margin, tableY, innerW, h).fill().restore();
      doc.save().strokeColor("#D1D5DB").rect(margin, tableY, innerW, h).stroke().restore();
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10).fillColor("#111827")
        .text(label, margin + 8, tableY + 8, { width: innerW * 0.68 - 16, align: "right" })
        .text(`$ ${formatMoney(amount)}`, summaryX + 8, tableY + 8, { width: summaryW - 16, align: "right" });
      tableY += h;
    }
  }

  tableY += 12;
  tableY = drawIpanelPdfBlock.call({ payload }, doc, { y: tableY, margin, innerW, pageBottom });
  tableY = drawDoorPanelSchemesPdfBlock(doc, { y: tableY, margin, innerW, pageBottom, payload });

  if (includeTerms) drawTermsAndConditionsPage(doc, { title, payload, margin, innerW, dateStr, validStr });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawPageFrame(doc, margin, i + 1, range.count, getPdfFooterLeft(payload));
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
    ["Cliente", c.name], ["Teléfono", c.phone], ["Dirección", c.address], ["Localidad", c.city], ["Maps", c.maps_url],
    ["Fecha", pick(form, "fecha")], ["Distribuidor", pick(form, "distribuidor")], ["Nota de venta", quote?.odoo_sale_order_name || quote?.quote_number],
    ["Alto final (mm)", form?.alto_final_mm], ["Ancho final (mm)", form?.ancho_final_mm], ["Accionamiento", prettyMeasurementValue("accionamiento", pick(form, "accionamiento"))], ["Colocación", prettyMeasurementValue("colocacion", pick(form, "colocacion"))],
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
  doc.font("Helvetica").fontSize(11).text(`Altos: ${(altos.filter(Boolean).join(" / ")) || "-"}`);
  doc.text(`Anchos: ${(anchos.filter(Boolean).join(" / ")) || "-"}`);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    drawPageFrame(doc, 20, i + 1, range.count, "Planilla de medición - De Grandis Portones");
  }
  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(buffers))));
}

export function buildPdfRouter(odoo = null) {
  const router = express.Router();

  router.get("/remito/nv/:nv", async (req, res, next) => {
    try {
      const nvParam = String(req.params.nv || "").trim();
      if (!nvParam || !/^\d+$/.test(nvParam)) return res.status(400).json({ ok: false, error: "NV inválido" });
      const nvStr = "NV" + nvParam;
      const r = await dbQuery(
        `SELECT * FROM public.presupuestador_quotes
         WHERE final_sale_order_name = $1 AND quote_kind = 'copy'
         ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`,
        [nvStr],
      );
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "NV no encontrada" });
      const remitoPayload = { ...quote, quote_number: nvParam };
      const pdf = await renderPdf({
        title: "REMITO",
        payload: remitoPayload,
        useBasePrice: false,
        odoo: null,
        includeTerms: false,
        hideAllPrices: true,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="remito_${nvStr}.pdf"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  router.post("/presupuesto", requireAuth, async (req, res, next) => {
    try {
      const rawPayload = req.body || {};
      const payload = { ...rawPayload, seller_name: resolveLoggedUserSellerName(req.user, rawPayload) };
      const pdf = await renderPdf({ title: "PRESUPUESTO", payload, useBasePrice: false, odoo, includeTerms: true, hideIvaBreakdown: true, taxRate: isCondition2(payload) ? 0.105 : IVA_RATE, hideDetailPrices: true });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${buildDownloadFilename(payload, "presupuesto")}"`);
      res.send(pdf);
    } catch (e) { next(e); }
  });

  router.post("/proforma", requireAuth, async (req, res, next) => {
    try {
      const rawPayload = req.body || {};
      const payload = { ...rawPayload, seller_name: resolveLoggedUserSellerName(req.user, rawPayload) };
      const pdf = await renderPdf({ title: "PROFORMA", payload, useBasePrice: true, odoo, displayNetPrices: true, taxRate: isCondition2(payload) ? 0.105 : IVA_RATE, allowNewBudgetFormat: false });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${buildDownloadFilename(payload, "proforma", "Proforma_")}"`);
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
