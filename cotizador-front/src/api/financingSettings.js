import { http } from "./http.js";

export async function getFinancingSettings() {
  const { data } = await http.get("/api/financing-settings");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar la configuración de financiamiento");
  return data.methods || [];
}

export async function saveFinancingSettings(methods) {
  const { data } = await http.put("/api/financing-settings", { methods: methods || [] });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la configuración de financiamiento");
  return data.methods || [];
}

export async function getFinancingPreviewFromSettings(paymentMethod) {
  const method = String(paymentMethod || "").trim();
  if (!method) {
    return {
      ok: true,
      applies_financing: false,
      percent: 0,
      card_type: null,
      installments: null,
      plan_id: null,
      rate_id: null,
      payment_method: "",
      source: "none",
    };
  }

  const params = new URLSearchParams();
  params.set("payment_method", method);
  const { data } = await http.get(`/api/financing-settings/preview?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo obtener la financiación");
  return data;
}
