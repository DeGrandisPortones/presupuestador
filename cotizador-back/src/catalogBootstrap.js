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
const TTL_MS = Number(process.env.CATALOG_BOOTSTRAP_TTL_MS || 60 * 1000);

function nowMs() { return Date.now(); }
function normTagName(x) {
  return String(x || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function cleanText(value) { return String(value || "").trim(); }
function uniqueNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}
function uniqueTexts(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}
function getProductTagIds(product) {
  return uniqueNumbers(product?.tag_ids || []);
}
function getProductTagNames(product, tagById) {
  const names = [];
  for (const tid of getProductTagIds(product)) {
    const name = tagById.get(Number(tid))?.name;
    if (name) names.push(name);
  }
  if (Array.isArray(product?.tag_names)) names.push(...product.tag_names);
  if (Array.isArray(product?.tags)) {
    for (const tag of product.tags) {
      if (typeof tag === "string") names.push(tag);
      else if (tag?.name) names.push(tag.name);
    }
  }
  return uniqueTexts(names);
}
function productHasAnyTag(product, tagIds, tagSectionByName, tagById) {
  const tids = getProductTagIds(product);
  if (tagIds instanceof Set && tids.some((tid) => tagIds.has(Number(tid)))) return true;

  if (tagSectionByName instanceof Map && tagSectionByName.size) {
    const names = getProductTagNames(product, tagById);
    return names.some((name) => tagSectionByName.has(normTagName(name)));
  }

  return false;
}
function tagIdsByNames(tags = [], names = []) {
  const wanted = new Set(names.map(normTagName));
  return new Set((Array.isArray(tags) ? tags : []).filter((t) => wanted.has(normTagName(t?.name))).map((t) => Number(t.id)).filter(Boolean));
}
function productHasTagName(product, tagById, names = []) {
  const wanted = new Set(names.map(normTagName));
  return getProductTagNames(product, tagById).some((name) => wanted.has(normTagName(name)));
}

export async function loadCatalogBootstrap(odoo, kind = "porton") {
  const k = normKind(kind);
  const now = nowMs();
  const cached = cacheByKind.get(k);
  if (cached && (now - cached.at) < TTL_MS) return cached.data;

  const odooBoot = await loadOdooBootstrap(odoo);
  const sections = await listSections(k);
  const tagSection = await getTagSectionMap(k);
  const aliasMap = await getProductAliasMap(k);
  const inheritedAliasMap = k === "porton" ? aliasMap : await getProductAliasMap("porton");
  const visibilityMap = await getProductVisibilityMap(k);
  const typeVisibility = await getTypeVisibilityMap(k);

  const tags = Array.isArray(odooBoot?.tags) ? odooBoot.tags : [];
  const productsRaw = Array.isArray(odooBoot?.products) ? odooBoot.products : [];

  const tagById = new Map(tags.map((t) => [Number(t.id), t]));
  const ipanelTagIds = tagIdsByNames(tags, ["ipanel", "ipanels"]);
  const puertaTagIds = tagIdsByNames(tags, ["puerta", "puertas"]);
  const configuredTagIds = new Set([...tagSection.keys()].map((id) => Number(id)).filter(Boolean));

  const tagSectionByName = new Map();
  for (const [rawTagId, sectionId] of tagSection.entries()) {
    const tag = tagById.get(Number(rawTagId));
    const name = normTagName(tag?.name);
    if (name && sectionId) tagSectionByName.set(name, Number(sectionId));
  }

  const productsFiltered = productsRaw.filter((p) => {
    const isIpanel = productHasAnyTag(p, ipanelTagIds, null, tagById) || productHasTagName(p, tagById, ["ipanel", "ipanels"]);
    const isPuerta = productHasAnyTag(p, puertaTagIds, null, tagById) || productHasTagName(p, tagById, ["puerta", "puertas"]);
    const belongsToConfiguredSection = productHasAnyTag(p, configuredTagIds, tagSectionByName, tagById);

    if (k === "ipanel") return isIpanel || belongsToConfiguredSection;
    if (k === "puerta") return isPuerta || belongsToConfiguredSection;
    if (k === "otros") return belongsToConfiguredSection;
    return !isIpanel && !isPuerta;
  });

  const sectionById = new Map(sections.map((s) => [Number(s.id), s]));

  const products = productsFiltered.map((p) => {
    const pid = Number(p.id);
    const ownAlias = cleanText(aliasMap.get(pid) || "");
    const inheritedAlias = cleanText(inheritedAliasMap.get(pid) || "");
    const alias = ownAlias || inheritedAlias;
    const odooName = cleanText(p?.name);
    const visibility = visibilityMap.get(pid) || { disable_for_vendedor: false, disable_for_distribuidor: false };
    const tids = getProductTagIds(p);
    const tagNames = getProductTagNames(p, tagById);

    const sectionIdsFromIds = tids
      .map((tid) => tagSection.get(Number(tid)))
      .filter(Boolean)
      .map(Number);
    const sectionIdsFromNames = tagNames
      .map((name) => tagSectionByName.get(normTagName(name)))
      .filter(Boolean)
      .map(Number);
    const sectionIds = uniqueNumbers([...sectionIdsFromIds, ...sectionIdsFromNames]);
    const sectionNames = sectionIds.map((sid) => sectionById.get(Number(sid))?.name).filter(Boolean);
    const usesSurfaceQuantity = sectionIds.some((sid) => !!sectionById.get(Number(sid))?.use_surface_qty);

    return {
      ...p,
      tag_names: tagNames,
      alias: alias || null,
      internal_alias: alias || null,
      display_name: alias || odooName,
      client_display_name: odooName,
      original_name: odooName,
      raw_name: odooName,
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
    type_sections: {},
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
