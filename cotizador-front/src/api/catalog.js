import { http } from "./http.js";

export async function getCatalogBootstrap(kind = "porton") {
  const { data } = await http.get(`/api/catalog/bootstrap?kind=${encodeURIComponent(kind || "porton")}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudo cargar el catálogo");
  return data;
}
