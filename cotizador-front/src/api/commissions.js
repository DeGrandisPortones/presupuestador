import { http } from "./http.js";

export async function getMyCommission({ month, period, mode } = {}) {
  const params = {};
  if (month) params.month = month;
  if (period) params.period = period;
  if (mode) params.mode = mode;
  const { data } = await http.get("/api/commissions/mine", { params });
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar tu comisión");
  return data;
}
