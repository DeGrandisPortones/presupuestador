import { http } from "./http.js";

export async function listMyDistributors() {
  const { data } = await http.get("/api/seller-distributors/mine");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los distribuidores");
  return data.distributors || [];
}
