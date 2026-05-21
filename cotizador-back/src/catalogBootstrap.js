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
function productTagIds(product) {
  return Array.isArray(product?.tag_ids)
    ? product.tag_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
}
function tagIdsByNames(tags = [], names = []) {
  const wanted = new Set(names.map(normTagName));
  return new Set(
    (Array.isArray(tags) ? tags : [])
      .filter((t) => wanted.has(normTagName(t?.name)))
      .map((t) => Number(t.id))
      .filter(Boolean)
  );
}
function productTagNames(product = {}, tagById = new Map()) {
  const names = [];
  for (const tid of productTagIds(product)) {
    const tag = tagById.get(Number(tid));
    if (tag?.name) names.push(tag.name);
  }
  for (const dbg of Array.isArray(product?.tag_debug) ? product.tag_debug : []) {
    if (dbg?.name) names.push(dbg.name);
  }
  return [...new Set(names.map(cleanText).filter(Boolean))];
}
function productHasTagName(product, tagById, names = []) {
  const wanted = new Set(names.map(normTagName));
  if (!wanted.size) return false;
  return productTagNames(product, tagById).some((name) => wanted.has(normTagName(name)));
}
function productHasAnyTag(product, tagIds) {
  if (!(tagIds instanceof Set) || !tagIds.size) return false;
  return productTagIds(product).some((tid) => tagIds.has(Number(tid)));
}
function countProductsByTag(products = []) {
  const counts = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const tid of productTagIds(product)) {
      counts.set(Number(tid), (counts.get(Number(tid)) || 0) + 1);
    }
  }
  return counts;
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

  const rawTags = Array.isArray(odooBoot?.tags) ? odooBoot.tags : [];
  const tagById = new Map(rawTags.map((t) => [Number(t.id), t]));

  // Regla solicitada: ningun modulo del presupuestador trae productos sin tags reales de Odoo.
  const productsRaw = (Array.isArray(odooBoot?.products) ? odooBoot.products : [])
    .filter((product) => productTagIds(product).length > 0);

  const rawProductCountsByTag = countProductsByTag(productsRaw);
  const ipanelTagIds = tagIdsByNames(rawTags, ["ipanel", "ipanels"]);
  const puertaTagIds = tagIdsByNames(rawTags, ["puerta", "puertas"]);
  const configuredTagIds = new Set([...tagSection.keys()].map((id) => Number(id)).filter(Boolean));

  const configuredSectionByTagName = new Map();
  for (const [tagId, sectionId] of tagSection.entries()) {
    const tag = tagById.get(Number(tagId));
    const name = normTagName(tag?.name);
    if (name && sectionId) configuredSectionByTagName.set(name, Number(sectionId));
  }

  function resolveSectionIdForTag(tagId) {
    const direct = Number(tagSection.get(Number(tagId)) || 0) || null;
    if (direct) return direct;
    const tagName = normTagName(tagById.get(Number(tagId))?.name);
    if (tagName && configuredSectionByTagName.has(tagName)) {
      return Number(configuredSectionByTagName.get(tagName) || 0) || null;
    }
    return null;
  }

  function productBelongsToConfiguredSection(product) {
    return productTagIds(product).some((tid) => !!resolveSectionIdForTag(tid));
  }

  const productsFiltered = productsRaw.filter((p) => {
    const tids = productTagIds(p);
    if (!tids.length) return false;

    const isIpanel = tids.some((tid) => ipanelTagIds.has(tid)) || productHasTagName(p, tagById, ["ipanel", "ipanels"]);
    const isPuerta = tids.some((tid) => puertaTagIds.has(tid)) || productHasTagName(p, tagById, ["puerta", "puertas"]);
    const belongsToConfiguredSection = productBelongsToConfiguredSection(p) || productHasAnyTag(p, configuredTagIds);

    if (k === "ipanel") return isIpanel || belongsToConfiguredSection;
    if (k === "puerta") return isPuerta || belongsToConfiguredSection;
    if (k === "otros") return belongsToConfiguredSection;

    // Portones: solo productos con tags, excluyendo tags reservados a Ipanel/Puerta.
    // Los productos sin seccion pueden verse en Data para asignar el tag a una seccion.
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
    const tids = productTagIds(p);
    const sectionIds = [...new Set(tids.map((tid) => resolveSectionIdForTag(tid)).filter(Boolean).map(Number))];
    const sectionNames = sectionIds.map((sid) => sectionById.get(Number(sid))?.name).filter(Boolean);
    const tagNames = productTagNames(p, tagById);
    const usesSurfaceQuantity = sectionIds.some((sid) => !!sectionById.get(Number(sid))?.use_surface_qty);

    return {
      ...p,
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

  const catalogProductCountsByTag = countProductsByTag(products);
  const tags = rawTags.map((tag) => ({
    ...tag,
    raw_product_count: rawProductCountsByTag.get(Number(tag.id)) || 0,
    catalog_product_count: catalogProductCountsByTag.get(Number(tag.id)) || 0,
  }));

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
