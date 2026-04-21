import { http } from "./http";

function sanitizeFilenamePart(value, fallback = "archivo") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
  return normalized || fallback;
}

function buildPdfFilename(payload, kind = "presupuesto") {
  const customerName = sanitizeFilenamePart(payload?.end_customer?.name, "cliente");
  const quoteNumber = sanitizeFilenamePart(
    payload?.quote_number ??
      payload?.quoteNumber ??
      payload?.quote_id ??
      payload?.quoteId ??
      payload?.id,
    kind
  );
  return `${customerName}_${quoteNumber}.pdf`;
}

function triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadPresupuestoPdf(payload) {
  console.log("[PDF API] POST /api/pdf/presupuesto payload", payload);
  console.log("[PDF API] POST /api/pdf/presupuesto lines", (payload?.lines || []).map((line) => ({
    product_id: line?.product_id,
    odoo_id: line?.odoo_id,
    odoo_template_id: line?.odoo_template_id,
    odoo_variant_id: line?.odoo_variant_id,
    odoo_external_id: line?.odoo_external_id,
    name: line?.name,
    raw_name: line?.raw_name,
    qty: line?.qty,
  })));
  const res = await http.post("/api/pdf/presupuesto", payload, {
    responseType: "blob",
  });
  triggerDownload(res.data, buildPdfFilename(payload, "presupuesto"));
}

export async function downloadProformaPdf(payload) {
  console.log("[PDF API] POST /api/pdf/proforma payload", payload);
  console.log("[PDF API] POST /api/pdf/proforma lines", (payload?.lines || []).map((line) => ({
    product_id: line?.product_id,
    odoo_id: line?.odoo_id,
    odoo_template_id: line?.odoo_template_id,
    odoo_variant_id: line?.odoo_variant_id,
    odoo_external_id: line?.odoo_external_id,
    name: line?.name,
    raw_name: line?.raw_name,
    qty: line?.qty,
  })));
  const res = await http.post("/api/pdf/proforma", payload, {
    responseType: "blob",
  });
  triggerDownload(res.data, buildPdfFilename(payload, "proforma"));
}

export async function downloadMedicionPdf(quoteId) {
  const blob = await fetchMedicionPdfBlob(quoteId);
  triggerDownload(blob, `medicion_${quoteId}.pdf`);
}

export async function fetchMedicionPdfBlob(quoteId) {
  const res = await http.get(`/api/pdf/medicion/${quoteId}`, { responseType: "blob" });
  return res.data;
}

export function getMedicionPublicPdfUrl(token) {
  const t = String(token || "").trim();
  if (!t || typeof window === "undefined") return null;
  return new URL(`/api/pdf/medicion/public/${encodeURIComponent(t)}`, window.location.origin).toString();
}
