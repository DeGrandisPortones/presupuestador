import express from "express";
import PDFDocument from "pdfkit";

function formatMoneyARS(value) {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return n.toFixed(2);
  }
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function buildLines(payload, { useBasePrice }) {
  const coefPct = Number(payload?.margin_percent_ui ?? 0);
  const coefFactor = 1 + coefPct / 100;

  const rawLines = Array.isArray(payload?.lines) ? payload.lines : [];

  const lines = rawLines
    .map((l) => {
      const qty = Number(l?.qty ?? 0) || 0;
      const basePrice =
        Number(
          l?.base_price ??
            l?.basePrice ??
            l?.base_price_unit ??
            l?.price_unit ??
            l?.priceUnit ??
            0
        ) || 0;
      const unit = useBasePrice ? basePrice : basePrice * coefFactor;
      const subtotal = unit * qty;
      return {
        qty,
        // En PDF mostramos el nombre REAL del producto (no alias)
        name: safeStr(l?.raw_name || l?.rawName || l?.name || ""),
        uom: safeStr(l?.uom || ""),
        unit,
        subtotal,
      };
    })
    .filter((l) => l.qty > 0);

  const total = lines.reduce((acc, l) => acc + l.subtotal, 0);
  return { lines, total };
}

function renderPdf({ title, payload, useBasePrice }) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-AR");

  const endCustomer = payload?.end_customer || {};
  const customerName = safeStr(endCustomer?.name);
  const customerPhone = safeStr(endCustomer?.phone);
  const customerEmail = safeStr(endCustomer?.email);
  const customerAddress = safeStr(endCustomer?.address);
  const obs = safeStr(payload?.note);
  const destination = safeStr(payload?.fulfillment_mode);

  const { lines, total } = buildLines(payload, { useBasePrice });

  // Header
  doc
    .fontSize(18)
    .text(title, { align: "right" })
    .moveDown(0.2);
  doc.fontSize(10).text(`Fecha: ${dateStr}`, { align: "right" });
  doc.moveDown(0.5);
  doc
    .fontSize(14)
    .text("DFLEX ARGENTINA S.A.S.")
    .fontSize(10)
    .text("Presupuestador")
    .moveDown(0.8);

  // Customer block
  doc
    .fontSize(11)
    .text("Datos del cliente", { underline: true })
    .moveDown(0.3);

  doc.fontSize(10);
  if (customerName) doc.text(`Nombre: ${customerName}`);
  if (customerPhone) doc.text(`Teléfono: ${customerPhone}`);
  if (customerEmail) doc.text(`Email: ${customerEmail}`);
  if (customerAddress) doc.text(`Dirección: ${customerAddress}`);
  if (destination) doc.text(`Destino: ${destination}`);
  if (obs) {
    doc.moveDown(0.2);
    doc.text(`Observaciones: ${obs}`);
  }

  doc.moveDown(0.8);

  // Lines table
  doc.fontSize(11).text("Detalle", { underline: true }).moveDown(0.4);

  const startX = doc.x;
  const tableTop = doc.y;

  const colQty = 45;
  const colDesc = 300;
  const colUnit = 80;
  const colSub = 80;

  doc.fontSize(9).text("Cant.", startX, tableTop, { width: colQty });
  doc.text("Descripción", startX + colQty, tableTop, { width: colDesc });
  doc.text("P.Unit", startX + colQty + colDesc, tableTop, {
    width: colUnit,
    align: "right",
  });
  doc.text("Subtotal", startX + colQty + colDesc + colUnit, tableTop, {
    width: colSub,
    align: "right",
  });

  doc.moveDown(0.6);
  let y = doc.y;
  doc.moveTo(startX, y).lineTo(startX + colQty + colDesc + colUnit + colSub, y).stroke();
  doc.moveDown(0.3);

  doc.fontSize(9);
  for (const l of lines) {
    const rowY = doc.y;
    doc.text(String(l.qty), startX, rowY, { width: colQty });
    doc.text(l.name, startX + colQty, rowY, { width: colDesc });
    doc.text(formatMoneyARS(l.unit), startX + colQty + colDesc, rowY, {
      width: colUnit,
      align: "right",
    });
    doc.text(formatMoneyARS(l.subtotal), startX + colQty + colDesc + colUnit, rowY, {
      width: colSub,
      align: "right",
    });
    doc.moveDown(0.4);
  }

  doc.moveDown(0.4);
  doc
    .fontSize(11)
    .text(`TOTAL: $ ${formatMoneyARS(total)}`, {
      align: "right",
    });

  // Page 2 (términos)
  doc.addPage();
  doc.fontSize(12).text("Condiciones", { underline: true }).moveDown(0.6);
  doc
    .fontSize(10)
    .text(
      "• Los precios pueden estar sujetos a variaciones según disponibilidad y costos de insumos.\n" +
        "• La validez de este documento es de 7 días salvo indicación en contrario.\n" +
        "• Plazos de entrega a coordinar.\n" +
        "• Ante cualquier consulta, contactanos.",
      { lineGap: 3 }
    );

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
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="presupuesto_${Date.now()}.pdf"`
      );
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
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="proforma_${Date.now()}.pdf"`
      );
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
