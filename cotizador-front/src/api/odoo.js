import { http } from "./http.js";
import { getOdooBootstrap } from "../domain/odoo/bootstrap.js";

export async function getPricelists() {
  const boot = getOdooBootstrap();
  if (boot?.pricelists?.length) return boot.pricelists;
  const { data } = await http.get("/api/odoo/pricelists");
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar la lista de precios");
  return data.pricelists || [];
}

export async function searchProducts({ query = "", limit = 10 }) {
  const boot = getOdooBootstrap();
  const q = (query || "").toString().trim().toLowerCase();

  if (boot?.products?.length) {
    const items = boot.products;
    const filtered = !q
      ? items
      : items.filter((p) => {
          const name = (p.display_name || p.name || "").toString().toLowerCase();
          const raw = (p.name || "").toString().toLowerCase();
          const code = (p.code || "").toString().toLowerCase();
          return name.includes(q) || raw.includes(q) || code.includes(q);
        });
    return filtered.slice(0, Number(limit || 10));
  }

  const params = new URLSearchParams();
  params.set("query", query);
  params.set("limit", String(limit));

  const { data } = await http.get(`/api/odoo/products?${params.toString()}`);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron cargar los productos");
  return data.products || [];
}

export async function getPrices({ pricelist_id, partner_id = null, lines }) {
  const payload = {
    pricelist_id: pricelist_id ?? null,
    partner_id: partner_id ?? null,
    lines: lines || [],
  };

  const { data } = await http.post("/api/odoo/prices", payload);
  if (!data?.ok) throw new Error(data?.error || "No se pudieron calcular los precios");
  return data;
}
