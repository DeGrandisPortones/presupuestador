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
