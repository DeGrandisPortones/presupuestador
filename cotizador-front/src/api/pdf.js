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

function summarizePdfLines(payload) {
  return (payload?.lines || []).map((line) => ({
    product_id: line?.product_id,
    odoo_id: line?.odoo_id,
    odoo_template_id: line?.odoo_template_id,
    odoo_variant_id: line?.odoo_variant_id,
    odoo_external_id: line?.odoo_external_id,
    name: line?.name,
    raw_name: line?.raw_name,
    qty: line?.qty,
  }));
}

function logPdfApiRequest(kind, payload) {
  console.log(`[PDF API] POST /api/pdf/${kind} payload`, payload);
  console.log(`[PDF API] POST /api/pdf/${kind} summary`, {
    quote_id: payload?.id || payload?.quote_id || payload?.quoteId || payload?.quote_number || payload?.quoteNumber || null,
    customer: payload?.end_customer?.name || null,
    line_count: Array.isArray(payload?.lines) ? payload.lines.length : 0,
    lines: summarizePdfLines(payload),
  });
}

function logPdfApiResponse(kind, payload, res) {
  try {
    const headers = res?.headers || {};
    console.log(`[PDF API] POST /api/pdf/${kind} response`, {
      quote_id: payload?.id || payload?.quote_id || payload?.quoteId || payload?.quote_number || payload?.quoteNumber || null,
      status: res?.status,
      statusText: res?.statusText,
      contentType: headers["content-type"] || headers["Content-Type"] || null,
      contentLength: headers["content-length"] || headers["Content-Length"] || null,
      filename: buildPdfFilename(payload, kind),
      blobSize: Number(res?.data?.size || 0) || 0,
    });
  } catch (e) {
    console.log(`[PDF API] POST /api/pdf/${kind} response log error`, e?.message || e);
  }
}

export async function downloadPresupuestoPdf(payload) {
  logPdfApiRequest("presupuesto", payload);
  const res = await http.post("/api/pdf/presupuesto", payload, {
    responseType: "blob",
  });
  logPdfApiResponse("presupuesto", payload, res);
  triggerDownload(res.data, buildPdfFilename(payload, "presupuesto"));
}

export async function downloadProformaPdf(payload) {
  logPdfApiRequest("proforma", payload);
  const res = await http.post("/api/pdf/proforma", payload, {
    responseType: "blob",
  });
  logPdfApiResponse("proforma", payload, res);
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
