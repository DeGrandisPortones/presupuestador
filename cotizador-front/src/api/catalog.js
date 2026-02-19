import { http } from "./http.js";

export async function getCatalogBootstrap() {
  const { data } = await http.get("/api/catalog/bootstrap");
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}
