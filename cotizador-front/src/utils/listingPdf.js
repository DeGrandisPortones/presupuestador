
import { getQuote } from "../api/quotes.js";
import { getDoorQuotePdfPayload } from "../api/doors.js";
import { downloadPresupuestoPdf } from "../api/pdf.js";

function safeText(value) {
  return String(value ?? "").trim();
}

function buildQuotePayload(quote) {
  const q = quote || {};
  const isFinal = String(q?.quote_kind || "").toLowerCase() === "copy";
  return {
    ...q,
    pdf_title: isFinal ? "NV" : "PRESUPUESTO",
    quote_number: isFinal
      ? (safeText(q.final_sale_order_name) || safeText(q.odoo_sale_order_name) || safeText(q.quote_number))
      : (safeText(q.quote_number) || safeText(q.odoo_sale_order_name) || safeText(q.id)),
    seller_name: safeText(q.created_by_full_name) || safeText(q.created_by_username) || safeText(q.seller_name),
  };
}

export async function downloadListingQuotePdf(quoteId) {
  const quote = await getQuote(quoteId);
  const payload = buildQuotePayload(quote);
  await downloadPresupuestoPdf(payload);
  return payload;
}

export async function downloadListingDoorPdf(doorId) {
  const payload = await getDoorQuotePdfPayload(doorId, "presupuesto");
  await downloadPresupuestoPdf(payload);
  return payload;
}
