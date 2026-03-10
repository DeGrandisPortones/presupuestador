import { http } from "./http";

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
  triggerDownload(res.data, `presupuesto_${Date.now()}.pdf`);
}

export async function downloadProformaPdf(payload) {
  const res = await http.post("/api/pdf/proforma", payload, {
    responseType: "blob",
  });
  triggerDownload(res.data, `proforma_${Date.now()}.pdf`);
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
