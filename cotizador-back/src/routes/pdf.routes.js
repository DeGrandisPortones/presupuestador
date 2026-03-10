import express from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dbQuery } from "../db.js";
import { requireAuth } from "../auth.js";
import { ensureQuotesMeasurementColumns } from "../quotesSchema.js";

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

function yn(v) {
  return v ? "Sí" : "No";
}

function pick(obj, pathValue, fallback = "") {
  try {
    return pathValue.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj) ?? fallback;
  } catch {
    return fallback;
  }
}

function textOrDash(v) {
  return safeStr(v) || "—";
}

function prettyMeasurementValue(key, value) {
  const raw = safeStr(value);
  const maps = {
    colocacion: {
      dentro_vano: "Por dentro del vano",
      detras_vano: "Por detrás del vano",
    },
    accionamiento: {
      manual: "Manual",
      automatico: "Automático",
    },
    levadizo: {
      coplanar: "Coplanar",
      comun: "Común",
    },
    anclaje: {
      lateral: "Lateral",
      frontal: "Frontal",
      sin: "Sin anclajes",
    },
    orientacion_revestimiento: {
      lamas_horizontales: "Lamas horizontales",
      lamas_verticales: "Lamas verticales",
      varillado_vertical: "Varillado vertical",
    },
    tipo_revestimiento: {
      lamas: "Lamas",
      varillado_inyectado: "Varillado inyectado",
      varillado_simple: "Varillado simple",
    },
  };
  return maps[key]?.[raw] || textOrDash(raw);
}

function getLogoPath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, "../assets/logo-degrandis.png");
}

function drawFrame(doc, { margin }) {
  const w = doc.page.width;
  const h = doc.page.height;

  doc
    .save()
    .lineWidth(1)
    .strokeColor("#B7BABC")
    .roundedRect(margin, margin, w - margin * 2, h - margin * 2, 10)
    .stroke()
    .restore();
}

function drawFooter(doc, { margin, pageNo, pageCount, footerLeft = "De Grandis Portones" }) {
  const w = doc.page.width;
  const h = doc.page.height;

  doc
    .save()
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#6B7280")
    .text(footerLeft, margin, h - margin - 16, {
      width: w - margin * 2,
      align: "left",
    })
    .text(`Página ${pageNo} de ${pageCount}`, margin, h - margin - 16, {
      width: w - margin * 2,
      align: "right",
    })
    .restore();
}

function drawRow(doc, { x, y, w, h, cols, borderColor = "#D1D5DB", fill = null, textStyle = {} }) {
  const pad = textStyle?.pad ?? 6;

  if (fill) {
    doc.save().fillColor(fill).rect(x, y, w, h).fill().restore();
  }

  doc.save().strokeColor(borderColor).lineWidth(1).rect(x, y, w, h).stroke().restore();

  let cx = x;
  for (let i = 0; i < cols.length - 1; i++) {
    cx += cols[i].w;
    doc.save().strokeColor(borderColor).moveTo(cx, y).lineTo(cx, y + h).stroke().restore();
  }

  doc.save();
  doc.fillColor(textStyle?.color || "#111827");
  doc.font(textStyle?.font || "Helvetica");
  doc.fontSize(textStyle?.size || 10);

  cx = x;
  for (const c of cols) {
    const tx = cx + pad;
    const tw = c.w - pad * 2;
    const ty = y + pad;

    doc.text(c.text ?? "", tx, ty, {
      width: tw,
      height: h - pad * 2,
      align: c.align || "left",
    });

    cx += c.w;
  }
  doc.restore();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
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
      ""
  );
}

function buildLines(payload, { useBasePrice }) {
  const coefPct = getMarginPct(payload);
  const coefFactor = 1 + coefPct / 100;

  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];

  const lines = rawLines
    .map((l) => {
      const qty = n2(l?.qty);
      const basePrice = n2(
        l?.base_price ??
          l?.basePrice ??
          l?.base_price_unit ??
          l?.price_unit ??
          l?.priceUnit ??
          l?.price ??
          0
      );

      const unit = useBasePrice ? basePrice : basePrice * coefFactor;
      const total = unit * qty;

      return {
        qty,
        name: safeStr(l?.raw_name || l?.rawName || l?.raw || l?.name || ""),
        unit,
        total,
      };
    })
    .filter((l) => l.qty > 0);

  const grandTotal = lines.reduce((acc, l) => acc + l.total, 0);
  return { lines, grandTotal, coefPct };
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

function drawMeasurementHeader(doc, { quote, form, margin, innerW, compact = false }) {
  const logoPath = getLogoPath();
  const title = "PLANILLA DE MEDICIÓN";
  const c = quote?.end_customer || {};
  const quoteNo = safeStr(quote?.odoo_sale_order_name || quote?.id || "—");

  const headerH = compact ? 56 : 66;
  doc.save().strokeColor("#111827").lineWidth(1).moveTo(margin, margin + headerH).lineTo(margin + innerW, margin + headerH).stroke().restore();

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin + 8, margin + 8, { width: compact ? 148 : 172, height: compact ? 38 : 46, fit: [compact ? 148 : 172, compact ? 38 : 46] });
  } else {
    doc.save().fillColor("#0EA5A4").roundedRect(margin + 8, margin + 10, 54, 44, 8).fill().restore();
    doc.font("Helvetica-Bold").fontSize(18).fillColor("white").text("DG", margin + 18, margin + 22);
  }

  doc
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .fontSize(compact ? 14 : 16)
    .text(title, margin, margin + (compact ? 18 : 20), { width: innerW, align: "center" });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111827")
    .text(`NÚMERO ${quoteNo}`, margin, margin + 18, { width: innerW - 10, align: "right" });

  let y = margin + headerH + 12;
  if (compact) return y;

  const clientName = textOrDash(c.name).toUpperCase();
  const dateStr = textOrDash(pick(form, "fecha"));
  const phone = textOrDash(c.phone);
  const address = textOrDash(c.address);
  const mapsUrl = textOrDash(c.maps_url);
  const distribuidor = textOrDash(pick(form, "distribuidor"));

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(clientName, margin + 8, y);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(`Fecha ${dateStr}`, margin, y + 2, { width: innerW - 8, align: "right" })
    .text(`Distribuidor ${distribuidor}`, margin, y + 16, { width: innerW - 8, align: "right" });

  y += 46;

  drawRow(doc, {
    x: margin,
    y,
    w: innerW,
    h: 54,
    cols: [
      { w: innerW * 0.42, text: `Cliente\n${textOrDash(c.name)}` },
      { w: innerW * 0.22, text: `Teléfono\n${phone}` },
      { w: innerW * 0.36, text: `Odoo\n${textOrDash(quote?.odoo_sale_order_name || (quote?.odoo_sale_order_id ? `SO#${quote?.odoo_sale_order_id}` : ""))}` },
    ],
    fill: "#F3F4F6",
    textStyle: { font: "Helvetica", size: 10, color: "#111827", pad: 8 },
  });
  y += 64;

  const extras = [`Dirección: ${address}`];
  if (mapsUrl !== "—") extras.push(`Maps: ${mapsUrl}`);
  const extraText = extras.join("   ·   ");
  const extraH = Math.max(24, doc.heightOfString(extraText, { width: innerW - 20 }) + 12);

  doc.save().fillColor("#FAFAFA").roundedRect(margin, y, innerW, extraH, 8).fill().restore();
  doc.save().strokeColor("#E5E7EB").roundedRect(margin, y, innerW, extraH, 8).stroke().restore();
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(extraText, margin + 10, y + 7, { width: innerW - 20 });

  return y + extraH + 16;
}

function ensureMeasurementSpace(doc, y, needed, ctx) {
  const pageBottom = doc.page.height - ctx.margin - 34;
  if (y + needed <= pageBottom) return y;
  doc.addPage();
  return drawMeasurementHeader(doc, { ...ctx, compact: true });
}

function drawSectionBanner(doc, y, title, ctx) {
  y = ensureMeasurementSpace(doc, y, 34, ctx);
  doc.save().fillColor("#E6FFFB").roundedRect(ctx.margin, y, ctx.innerW, 26, 8).fill().restore();
  doc.save().strokeColor("#99F6E4").roundedRect(ctx.margin, y, ctx.innerW, 26, 8).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text(title, ctx.margin + 10, y + 7, { width: ctx.innerW - 20 });
  return y + 34;
}

function drawInfoCell(doc, { x, y, w, h, label, value }) {
  doc.save().fillColor("white").roundedRect(x, y, w, h, 8).fill().restore();
  doc.save().strokeColor("#E5E7EB").roundedRect(x, y, w, h, 8).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#6B7280").text(label.toUpperCase(), x + 10, y + 8, { width: w - 20 });
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(textOrDash(value), x + 10, y + 22, { width: w - 20 });
}

function drawInfoGrid(doc, y, items, ctx, columns = 2) {
  const gap = 10;
  const colW = (ctx.innerW - gap * (columns - 1)) / columns;

  for (let i = 0; i < items.length; i += columns) {
    const rowItems = items.slice(i, i + columns);
    const rowH = Math.max(
      42,
      ...rowItems.map((it) => {
        const valueH = doc.heightOfString(textOrDash(it.value), { width: colW - 20, align: "left" });
        return 26 + valueH + 10;
      })
    );

    y = ensureMeasurementSpace(doc, y, rowH + 8, ctx);

    rowItems.forEach((it, idx) => {
      const x = ctx.margin + idx * (colW + gap);
      drawInfoCell(doc, { x, y, w: colW, h: rowH, label: it.label, value: it.value });
    });

    y += rowH + 8;
  }

  return y;
}

function drawWideTextBox(doc, y, { title, value }, ctx) {
  const valueText = textOrDash(value);
  const valueH = doc.heightOfString(valueText, { width: ctx.innerW - 20 });
  const boxH = Math.max(64, valueH + 34);
  y = ensureMeasurementSpace(doc, y, boxH + 8, ctx);

  doc.save().fillColor("white").roundedRect(ctx.margin, y, ctx.innerW, boxH, 8).fill().restore();
  doc.save().strokeColor("#E5E7EB").roundedRect(ctx.margin, y, ctx.innerW, boxH, 8).stroke().restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#6B7280").text(title.toUpperCase(), ctx.margin + 10, y + 8, { width: ctx.innerW - 20 });
  doc.font("Helvetica").fontSize(10).fillColor("#111827").text(valueText, ctx.margin + 10, y + 24, { width: ctx.innerW - 20 });

  return y + boxH + 8;
}

async function renderMeasurementPdf({ quote, form }) {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  const ctx = {
    margin: 28,
    innerW: doc.page.width - 56,
    quote,
    form,
  };

  let y = drawMeasurementHeader(doc, ctx);

  y = drawSectionBanner(doc, y, "Datos generales", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Fecha", value: pick(form, "fecha") },
    { label: "Distribuidor", value: pick(form, "distribuidor") },
    { label: "Cliente", value: quote?.end_customer?.name },
    { label: "N° de portón", value: pick(form, "nro_porton") },
  ], ctx, 2);

  y = drawSectionBanner(doc, y, "Parantes / Laterales", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Parantes (cant)", value: pick(form, "parantes.cant") },
    { label: "Lado de la puerta", value: pick(form, "lado_puerta") },
    { label: "Lado de motor o soporte", value: pick(form, "lado_motor") },
    { label: "Toma corriente", value: pick(form, "toma_corriente") },
  ], ctx, 2);

  const alto = Array.isArray(pick(form, "esquema.alto", [])) ? pick(form, "esquema.alto", []) : [];
  const ancho = Array.isArray(pick(form, "esquema.ancho", [])) ? pick(form, "esquema.ancho", []) : [];
  y = drawSectionBanner(doc, y, "Esquema (medidas)", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Alto 1 (mm)", value: alto[0] },
    { label: "Ancho 1 (mm)", value: ancho[0] },
    { label: "Alto 2 (mm)", value: alto[1] },
    { label: "Ancho 2 (mm)", value: ancho[1] },
    { label: "Alto 3 (mm)", value: alto[2] },
    { label: "Ancho 3 (mm)", value: ancho[2] },
  ], ctx, 2);

  y = drawSectionBanner(doc, y, "Instalación / Sistema", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Tipo de colocación", value: prettyMeasurementValue("colocacion", pick(form, "colocacion")) },
    { label: "Portón en acopio", value: yn(!!pick(form, "en_acopio")) },
    { label: "Tipo de accionamiento", value: prettyMeasurementValue("accionamiento", pick(form, "accionamiento")) },
    { label: "Sistema levadizo", value: prettyMeasurementValue("levadizo", pick(form, "levadizo")) },
    { label: "Estructura metálica", value: yn(!!pick(form, "estructura_metalica")) },
    { label: "Anclaje de fijación", value: prettyMeasurementValue("anclaje", pick(form, "anclaje")) },
    { label: "Rebaje lateral (mm)", value: pick(form, "rebaje_lateral_mm") },
    { label: "Rebaje inferior (mm)", value: pick(form, "rebaje_inferior_mm") },
    { label: "Color de sistema", value: pick(form, "color_sistema") },
  ], ctx, 2);

  const colorRev = safeStr(pick(form, "color_revestimiento"));
  const colorRevOtro = safeStr(pick(form, "color_revestimiento_otro"));
  y = drawSectionBanner(doc, y, "Revestimiento", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Tipo de revestimiento", value: prettyMeasurementValue("tipo_revestimiento", pick(form, "tipo_revestimiento")) },
    { label: "Medida (varillado)", value: pick(form, "varillado_medida") },
    { label: "Orientación", value: prettyMeasurementValue("orientacion_revestimiento", pick(form, "orientacion_revestimiento")) },
    { label: "Revestimiento", value: pick(form, "revestimiento") },
    { label: "Color de revestimiento", value: colorRev === "Otros" && colorRevOtro ? `${colorRev} (${colorRevOtro})` : colorRev },
    { label: "Lucera con vidrios", value: yn(!!pick(form, "lucera")) },
    { label: "Cantidad lucera", value: pick(form, "lucera") ? pick(form, "lucera_cantidad") : "—" },
    { label: "Peso de revestimiento", value: pick(form, "peso_revestimiento") },
  ], ctx, 2);

  y = drawSectionBanner(doc, y, "Servicios / Contacto", ctx);
  y = drawInfoGrid(doc, y, [
    { label: "Servicio de traslado", value: yn(!!pick(form, "traslado")) },
    { label: "Servicio de relevamiento", value: yn(!!pick(form, "relevamiento")) },
    { label: "Contacto en obra", value: pick(form, "contacto_obra_nombre") },
    { label: "Teléfono contacto obra", value: pick(form, "contacto_obra_tel") },
  ], ctx, 2);

  y = drawSectionBanner(doc, y, "Observaciones", ctx);
  y = drawWideTextBox(doc, y, { title: "Observaciones", value: pick(form, "observaciones") }, ctx);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFrame(doc, { margin: ctx.margin });
    drawFooter(doc, { margin: ctx.margin, pageNo: i + 1, pageCount: range.count, footerLeft: "Planilla de medición · De Grandis Portones" });
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

function renderPdf({ title, payload, useBasePrice }) {
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
    : addDays(now, validityDays);
  const validStr = validUntil.toLocaleDateString("es-AR");

  const endCustomer = payload?.end_customer || {};
  const customerName = safeStr(endCustomer?.name) || "(sin nombre)";
  const customerPhone = safeStr(endCustomer?.phone);
  const customerEmail = safeStr(endCustomer?.email);
  const customerAddress = safeStr(endCustomer?.address);
  const customerMaps = safeStr(endCustomer?.maps_url);

  const destinationRaw = safeStr(payload?.fulfillment_mode);
  const destination = destinationRaw === "acopio" ? "Acopio" : destinationRaw === "produccion" ? "Producción" : (destinationRaw || "—");
  const conditionRaw = safeStr(payload?.payload?.condition_mode ?? payload?.condition_mode);
  const conditionText = safeStr(payload?.payload?.condition_text ?? payload?.condition_text);
  const conditionMode = conditionRaw === "cond2" ? "Condición 2" : conditionRaw === "cond1" ? "Condición 1" : conditionRaw === "special" ? "Especial" : (conditionRaw || "");
  const paymentMethod = safeStr(payload?.payload?.payment_method ?? payload?.payment_method);
  const showDestination = !!useBasePrice;
  const obs = safeStr(payload?.note);

  const quoteNo = getQuoteNumber(payload);
  const { lines, grandTotal, coefPct } = buildLines(payload, { useBasePrice });

  doc.x = margin;
  doc.y = margin;

  const headerH = 64;
  const logoPath = getLogoPath();
  const logoW = 180;
  const logoH = 48;

  doc.save().strokeColor("#111827").lineWidth(1).moveTo(margin, margin + headerH).lineTo(margin + innerW, margin + headerH).stroke().restore();

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin + 8, margin + 8, { width: logoW, height: logoH, fit: [logoW, logoH] });
  } else {
    doc.save().fillColor("#0EA5A4").roundedRect(margin + 8, margin + 10, 54, 44, 8).fill().restore();
    doc.font("Helvetica-Bold").fontSize(18).fillColor("white").text("DG", margin + 18, margin + 22);
  }

  doc
    .font("Helvetica-Bold")
    .fillColor("#111827")
    .fontSize(16)
    .text(title, margin, margin + 18, { width: innerW, align: "center" });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`NÚMERO ${quoteNo || "—"}`, margin, margin + 16, { width: innerW - 10, align: "right" });

  let y = margin + headerH + 12;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(customerName.toUpperCase(), margin + 8, y);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(`Fecha ${dateStr}`, margin, y + 2, { width: innerW - 8, align: "right" })
    .text(`Vigencia ${validStr}`, margin, y + 16, { width: innerW - 8, align: "right" });

  y += 44;

  const infoH = 54;
  const rowW = innerW;

  const cols1 = showDestination
    ? [
        { w: rowW * 0.40, text: `Cliente\n${customerName}` },
        { w: rowW * 0.22, text: `Teléfono\n${customerPhone || "—"}` },
        { w: rowW * 0.24, text: `Email\n${customerEmail || "—"}` },
        { w: rowW * 0.14, text: `Destino\n${destination || "—"}` },
      ]
    : [
        { w: rowW * 0.45, text: `Cliente\n${customerName}` },
        { w: rowW * 0.25, text: `Teléfono\n${customerPhone || "—"}` },
        { w: rowW * 0.30, text: `Email\n${customerEmail || "—"}` },
      ];

  drawRow(doc, {
    x: margin,
    y,
    w: rowW,
    h: infoH,
    cols: cols1,
    fill: "#F3F4F6",
    textStyle: { font: "Helvetica", size: 10, color: "#111827", pad: 8 },
  });

  y += infoH + 10;

  const extraLines = [];
  if (customerAddress) extraLines.push(`Dirección: ${customerAddress}`);
  if (customerMaps) extraLines.push(`Maps: ${customerMaps}`);
  if (paymentMethod) extraLines.push(`Forma de Pago: ${paymentMethod}`);
  if (conditionMode) {
    extraLines.push(`Condición: ${conditionMode}${conditionRaw === "special" && conditionText ? ` (${conditionText})` : ""}`);
  }
  if (!useBasePrice) extraLines.push(`Coeficiente: ${formatQty(coefPct)}%`);
  if (obs) extraLines.push(`Obs: ${obs}`);

  if (extraLines.length) {
    const txt = extraLines.join("   ·   ");
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(txt, margin + 2, y, { width: innerW - 4 });
    y += 22;
  } else {
    y += 6;
  }

  const tableX = margin;
  let tableY = y;

  const colDesc = innerW * 0.58;
  const colQty = innerW * 0.12;
  const colUnit = innerW * 0.15;
  const colTot = innerW * 0.15;

  function drawTableHeader() {
    drawRow(doc, {
      x: tableX,
      y: tableY,
      w: innerW,
      h: 28,
      cols: [
        { w: colDesc, text: "DESCRIPCIÓN", align: "left" },
        { w: colQty, text: "CANT", align: "right" },
        { w: colUnit, text: "PRECIO", align: "right" },
        { w: colTot, text: "TOTAL", align: "right" },
      ],
      fill: "#E5E7EB",
      textStyle: { font: "Helvetica-Bold", size: 10, color: "#111827", pad: 8 },
    });
    tableY += 28;
  }

  function pageBottom() {
    return doc.page.height - margin - 30;
  }

  function ensureSpace(h) {
    if (tableY + h <= pageBottom()) return;

    doc.addPage();
    tableY = margin + 20;
    drawTableHeader();
  }

  drawTableHeader();

  doc.font("Helvetica").fontSize(10).fillColor("#111827");
  const pad = 8;

  for (const l of lines) {
    const descHeight = doc.heightOfString(l.name, { width: colDesc - pad * 2 });
    const rowH = Math.max(26, descHeight + pad * 2);

    ensureSpace(rowH);

    drawRow(doc, {
      x: tableX,
      y: tableY,
      w: innerW,
      h: rowH,
      cols: [
        { w: colDesc, text: l.name, align: "left" },
        { w: colQty, text: formatQty(l.qty), align: "right" },
        { w: colUnit, text: `$ ${formatMoney(l.unit)}`, align: "right" },
        { w: colTot, text: `$ ${formatMoney(l.total)}`, align: "right" },
      ],
      fill: null,
      textStyle: { font: "Helvetica", size: 10, color: "#111827", pad },
    });

    tableY += rowH;
  }

  ensureSpace(32);
  drawRow(doc, {
    x: tableX,
    y: tableY,
    w: innerW,
    h: 32,
    cols: [
      { w: colDesc + colQty + colUnit, text: "TOTAL", align: "right" },
      { w: colTot, text: `$ ${formatMoney(grandTotal)}`, align: "right" },
    ],
    fill: "#F3F4F6",
    textStyle: { font: "Helvetica-Bold", size: 11, color: "#111827", pad: 8 },
  });

  doc.addPage();
  doc.x = margin;
  doc.y = margin + 10;

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111827").text("Términos y Condiciones de Venta:", { underline: false });
  doc.moveDown(0.8);

  const terms = [
    "1. Formas de Pago: Aceptamos pagos en efectivo (pesos o dólares billete), transferencia bancaria, cheques o tarjeta de crédito (consultar por planes vigentes). Para confirmar el pedido se requiere una seña del 70% del valor total. El saldo restante deberá abonarse en su totalidad antes de la entrega del producto.",
    "2. Plazos de Entrega: El plazo estimado de entrega es de 40 días para portones en lamas, y 60 días para portones en paneles, y puede estar sujeto a variaciones debido a la disponibilidad de materiales o condiciones externas. Los plazos comienzan a contar a partir de la recepción de la seña.",
    "3. Condiciones de Envío: El envío puede ser coordinado por el cliente o gestionado por la empresa, con costos adicionales según el destino. Los productos deben ser revisados al momento de la entrega; no se aceptarán reclamos posteriores por daños durante el transporte.",
    "4. Garantía: Ofrecemos una garantía de 3 años por defectos de fabricación. La garantía no cubre daños causados por instalación incorrecta, falta de mantenimiento, uso indebido o condiciones climáticas extremas.",
    "5. Instalación: La instalación no está incluida en el presupuesto, salvo que se indique explícitamente. La empresa puede ofrecer el servicio de instalación con un costo adicional.",
    "6. Cancelación y Devoluciones: No se aceptan devoluciones una vez confirmado el pedido, ya que los productos son fabricados a medida. En caso de cancelación, la seña no será reembolsada.",
  ];

  doc.font("Helvetica").fontSize(10).fillColor("#111827");
  for (const t of terms) {
    doc.text(t, { width: innerW, lineGap: 3 });
    doc.moveDown(0.5);
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFrame(doc, { margin });
    drawFooter(doc, { margin, pageNo: i + 1, pageCount: range.count });
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

export function buildPdfRouter() {
  const router = express.Router();

  router.post("/presupuesto", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const pdf = await renderPdf({
        title: "PRESUPUESTO",
        payload,
        useBasePrice: false,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="presupuesto_${Date.now()}.pdf"`);
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  });

  router.get("/medicion/public/:token", async (req, res, next) => {
    try {
      await ensureQuotesMeasurementColumns();
      const token = String(req.params.token || "").trim();
      if (!isShareToken(token)) return res.status(400).json({ ok: false, error: "token inválido" });

      const r = await dbQuery(
        `
        select *
        from public.presupuestador_quotes
        where measurement_share_token = $1
          and measurement_share_enabled_at is not null
        limit 1
        `,
        [token]
      );
      const quote = r.rows?.[0];
      if (!quote) return res.status(404).json({ ok: false, error: "Planilla no encontrada" });

      const form = await resolveMeasurementForm(quote);
      if (!form) return res.status(404).json({ ok: false, error: "Planilla no disponible" });

      const pdf = await renderMeasurementPdf({ quote, form });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="medicion_${quote.id}.pdf"`);
      res.send(pdf);
    } catch (e) {
      next(e);
    }
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
      if (!form) {
        return res.status(400).json({ ok: false, error: "Este presupuesto todavía no tiene medición cargada" });
      }

      const pdf = await renderMeasurementPdf({ quote, form });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="medicion_${id}.pdf"`);
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  });

  router.post("/proforma", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const pdf = await renderPdf({
        title: "PROFORMA",
        payload,
        useBasePrice: true,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="proforma_${Date.now()}.pdf"`);
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
