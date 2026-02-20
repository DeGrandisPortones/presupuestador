import express from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function safeStr(v) {
  return String(v ?? "").trim();
}

function n2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// El PDF “modelo” usa coma para miles y punto para decimales (estilo en-US).
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function getMarginPct(payload) {
  // Front manda margin dentro de payload.margin_percent_ui (legacy) o payload.payload.margin_percent_ui (nuevo)
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
        // Preferimos nombre REAL (raw_name) para el PDF.
        name: safeStr(l?.raw_name || l?.rawName || l?.raw || l?.name || ""),
        unit,
        total,
      };
    })
    .filter((l) => l.qty > 0);

  const grandTotal = lines.reduce((acc, l) => acc + l.total, 0);
  return { lines, grandTotal, coefPct };
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

function drawFooter(doc, { margin, pageNo, pageCount }) {
  const w = doc.page.width;
  const h = doc.page.height;

  doc
    .save()
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#6B7280")
    .text(`Página ${pageNo} de ${pageCount}`, margin, h - margin - 16, {
      width: w - margin * 2,
      align: "right",
    })
    .restore();
}

function drawRow(doc, { x, y, w, h, cols, borderColor = "#D1D5DB", fill = null, textStyle = {} }) {
  const pad = textStyle?.pad ?? 6;

  // fondo
  if (fill) {
    doc.save().fillColor(fill).rect(x, y, w, h).fill().restore();
  }

  // borde exterior
  doc.save().strokeColor(borderColor).lineWidth(1).rect(x, y, w, h).stroke().restore();

  // separadores
  let cx = x;
  for (let i = 0; i < cols.length - 1; i++) {
    cx += cols[i].w;
    doc.save().strokeColor(borderColor).moveTo(cx, y).lineTo(cx, y + h).stroke().restore();
  }

  // texto
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

function renderPdf({ title, payload, useBasePrice }) {
  // bufferPages => después agregamos borde + footer y sabemos el total de páginas
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });

  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  const margin = 28;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const innerW = pageW - margin * 2;

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

  const destination = safeStr(payload?.fulfillment_mode);
  const obs = safeStr(payload?.note);

  const quoteNo = getQuoteNumber(payload);
  const { lines, grandTotal, coefPct } = buildLines(payload, { useBasePrice });

  // --------------------------
  // PAGE 1: Presupuesto
  // --------------------------
  doc.x = margin;
  doc.y = margin;

  // Header row (logo + title + numero)
  const headerH = 64;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const logoPath = path.join(__dirname, "../assets/logo-degrandis.png");

  const logoW = 180;
  const logoH = 48;

  // top separator line
  doc.save().strokeColor("#111827").lineWidth(1).moveTo(margin, margin + headerH).lineTo(margin + innerW, margin + headerH).stroke().restore();

  // Logo (si existe)
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, margin + 8, margin + 8, { width: logoW, height: logoH, fit: [logoW, logoH] });
  } else {
    // fallback simple si falta asset
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

  // Customer block
  let y = margin + headerH + 12;

  // Left big name
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text(customerName.toUpperCase(), margin + 8, y);

  // Right dates
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(`Fecha ${dateStr}`, margin, y + 2, { width: innerW - 8, align: "right" })
    .text(`Vigencia ${validStr}`, margin, y + 16, { width: innerW - 8, align: "right" });

  y += 44;

  // info row (Cliente / teléfono / email / destino / coeficiente)
  const infoH = 54;
  const x0 = margin;
  const rowW = innerW;

  const cols1 = [
    { w: rowW * 0.40, text: `Cliente\n${customerName}` },
    { w: rowW * 0.22, text: `Teléfono\n${customerPhone || "—"}` },
    { w: rowW * 0.24, text: `Email\n${customerEmail || "—"}` },
    { w: rowW * 0.14, text: `Destino\n${destination || "—"}` },
  ];

  drawRow(doc, {
    x: x0,
    y,
    w: rowW,
    h: infoH,
    cols: cols1,
    fill: "#F3F4F6",
    textStyle: { font: "Helvetica", size: 10, color: "#111827", pad: 8 },
  });

  y += infoH + 10;

  // Observaciones / dirección (si hay)
  const extraLines = [];
  if (customerAddress) extraLines.push(`Dirección: ${customerAddress}`);
  if (!useBasePrice) extraLines.push(`Coeficiente: ${formatQty(coefPct)}%`);
  if (obs) extraLines.push(`Obs: ${obs}`);

  if (extraLines.length) {
    const txt = extraLines.join("   ·   ");
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#111827")
      .text(txt, margin + 2, y, { width: innerW - 4 });
    y += 22;
  } else {
    y += 6;
  }

  // Table
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
    return doc.page.height - margin - 30; // deja espacio al footer
  }

  function ensureSpace(h) {
    if (tableY + h <= pageBottom()) return;

    doc.addPage();
    tableY = margin + 20; // arriba en páginas siguientes
    // repetimos header de tabla
    drawTableHeader();
  }

  drawTableHeader();

  doc.font("Helvetica").fontSize(10).fillColor("#111827");

  const pad = 8;

  for (const l of lines) {
    // altura dinámica por descripción
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

  // Total row
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

  // --------------------------
  // PAGE 2+: Términos
  // --------------------------
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

  // --------------------------
  // Frame + Footer (todas las páginas)
  // --------------------------
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
