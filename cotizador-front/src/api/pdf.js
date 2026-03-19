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
  const res = await http.post("/api/pdf/presupuesto", payload, {
    responseType: "blob",
  });
  triggerDownload(res.data, buildPdfFilename(payload, "presupuesto"));
}

export async function downloadProformaPdf(payload) {
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
