import { getQuote } from "../api/quotes.js";
import { getDoorQuotePdfPayload } from "../api/doors.js";
import { downloadPresupuestoPdf } from "../api/pdf.js";

function safeText(value) {
  return String(value ?? "").trim();
}

function buildQuotePayload(quote) {
  const q = quote || {};
  return {
    ...q,
    quote_number: safeText(q.quote_number) || safeText(q.odoo_sale_order_name) || safeText(q.id),
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
