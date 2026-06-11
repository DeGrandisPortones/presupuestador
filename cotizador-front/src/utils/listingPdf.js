import { getQuote, getProductionPlanningEstimate } from "../api/quotes.js";
import { getDoorQuotePdfPayload } from "../api/doors.js";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../api/pdf.js";

function safeText(value) {
  return String(value ?? "").trim();
}

function buildQuotePayload(quote, productionPlanning = null, options = {}) {
  const q = quote || {};
  const isFinal = String(q?.quote_kind || "").toLowerCase() === "copy";
  return {
    ...q,
    pdf_title: safeText(options.pdfTitle) || (isFinal ? "NV" : "PRESUPUESTO"),
    quote_number: isFinal
      ? (safeText(q.final_sale_order_name) || safeText(q.odoo_sale_order_name) || safeText(q.quote_number))
      : (safeText(q.quote_number) || safeText(q.odoo_sale_order_name) || safeText(q.id)),
    seller_name: safeText(q.created_by_full_name) || safeText(q.created_by_username) || safeText(q.seller_name),
    production_planning: productionPlanning || q.production_planning || (q.production_delivery_week ? {
      week_number: q.production_delivery_week,
      year: q.production_delivery_year,
      start_date: q.production_delivery_week_start,
      end_date: q.production_delivery_week_end,
      weeks_out: q.production_delivery_weeks_out,
      weeks_text: q.production_delivery_weeks_out === 1 ? "1 semana" : `${Number(q.production_delivery_weeks_out || 0)} semanas`,
      committed: true,
    } : null),
  };
}

async function getQuotePayloadForListingPdf(quoteId, options = {}) {
  const quote = await getQuote(quoteId);
  let productionPlanning = quote?.production_planning || null;
  if (!productionPlanning && String(quote?.quote_kind || "original").toLowerCase() === "original") {
    try {
      productionPlanning = await getProductionPlanningEstimate({ quoteId });
    } catch {
      productionPlanning = null;
    }
  }
  return buildQuotePayload(quote, productionPlanning, options);
}

export async function downloadListingQuotePdf(quoteId) {
  const payload = await getQuotePayloadForListingPdf(quoteId);
  await downloadPresupuestoPdf(payload);
  return payload;
}

export async function downloadListingQuoteProformaPdf(quoteId) {
  const payload = await getQuotePayloadForListingPdf(quoteId, { pdfTitle: "PROFORMA" });
  await downloadProformaPdf(payload);
  return payload;
}

export async function downloadListingDoorPdf(doorId) {
  const payload = await getDoorQuotePdfPayload(doorId, "presupuesto");
  await downloadPresupuestoPdf(payload);
  return payload;
}
