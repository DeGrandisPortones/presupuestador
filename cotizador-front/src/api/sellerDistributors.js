import { http } from "./http.js";

export async function listMyDistributors() {
  const { data } = await http.get("/api/seller-distributors/mine");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los distribuidores");
  return data.distributors || [];
}


export async function updateMyDistributorDefaultMapsUrl(id, default_maps_url = "") {
  const { data } = await http.put(`/api/seller-distributors/${encodeURIComponent(String(id))}/default-maps-url`, { default_maps_url });
  if (!data?.ok) throw new Error(data?.error || "No se pudo guardar la URL de Google Maps");
  return data.distributor || null;
}
