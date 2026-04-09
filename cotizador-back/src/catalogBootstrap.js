import { loadOdooBootstrap, clearOdooBootstrapCache } from "./odooBootstrap.js";
import {
  normKind,
  listSections,
  getTagSectionMap,
  getProductAliasMap,
  getProductVisibilityMap,
  getTypeVisibilityMap,
} from "./catalogDb.js";

let cacheByKind = new Map();
const TTL_MS = Number(process.env.CATALOG_BOOTSTRAP_TTL_MS || 5 * 60 * 1000);

function nowMs(){ return Date.now(); }

function normTagName(x){ return (x||"").toString().trim().toLowerCase(); }

export async function loadCatalogBootstrap(odoo, kind="porton") {
  const k = normKind(kind);
  const now = nowMs();
  const cached = cacheByKind.get(k);
  if (cached && (now - cached.at) < TTL_MS) return cached.data;

  const odooBoot = await loadOdooBootstrap(odoo);
  const sections = await listSections(k);
  const tagSection = await getTagSectionMap(k);
  const aliasMap = await getProductAliasMap(k);
  const visibilityMap = await getProductVisibilityMap(k);
  const typeVisibility = await getTypeVisibilityMap(k);

  const tags = Array.isArray(odooBoot?.tags) ? odooBoot.tags : [];
  const productsRaw = Array.isArray(odooBoot?.products) ? odooBoot.products : [];

  const ipanelTagIds = new Set(
    tags
      .filter((t) => normTagName(t.name) === "ipanel")
      .map((t) => Number(t.id))
  );

  const configuredTagIds = new Set([...tagSection.keys()].map((id) => Number(id)).filter(Boolean));

  const productsFiltered = productsRaw.filter((p) => {
    const tids = Array.isArray(p.tag_ids) ? p.tag_ids.map(Number) : [];
    const isIpanel = tids.some((tid) => ipanelTagIds.has(tid));

    if (k === "ipanel") return isIpanel;
    if (k === "otros") return tids.some((tid) => configuredTagIds.has(tid));
    return !isIpanel;
  });

  const sectionById = new Map(sections.map((s) => [Number(s.id), s]));
  const tagById = new Map(tags.map((t) => [Number(t.id), t]));

  const products = productsFiltered.map((p) => {
    const pid = Number(p.id);
    const alias = aliasMap.get(pid) || null;
    const visibility = visibilityMap.get(pid) || { disable_for_vendedor: false, disable_for_distribuidor: false };
    const tids = Array.isArray(p.tag_ids) ? p.tag_ids.map(Number) : [];
    const sectionIds = [...new Set(tids.map((tid) => tagSection.get(tid)).filter(Boolean).map(Number))];
    const sectionNames = sectionIds.map((sid) => sectionById.get(Number(sid))?.name).filter(Boolean);
    const tagNames = tids.map((tid) => tagById.get(tid)?.name).filter(Boolean);
    const usesSurfaceQuantity = sectionIds.some((sid) => !!sectionById.get(Number(sid))?.use_surface_qty);

    return {
      ...p,
      alias,
      display_name: alias || p.name,
      section_ids: sectionIds,
      sections: sectionNames,
      tags: tagNames,
      uses_surface_quantity: usesSurfaceQuantity,
      disable_for_vendedor: !!visibility.disable_for_vendedor,
      disable_for_distribuidor: !!visibility.disable_for_distribuidor,
    };
  });

  const data = {
    ok: true,
    kind: k,
    generated_at: new Date().toISOString(),
    sections,
    type_visibility: typeVisibility,
    tags,
    products,
  };

  cacheByKind.set(k, { at: now, data });
  return data;
}

export function clearCatalogBootstrapCache() {
  cacheByKind = new Map();
  clearOdooBootstrapCache();
}
