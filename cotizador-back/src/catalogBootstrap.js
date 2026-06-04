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
function normTagName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function cleanText(value) { return String(value || "").trim(); }
function productTagIds(product) {
  return Array.isArray(product?.tag_ids)
    ? product.tag_ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    : [];
}
function tagIdsByNames(tags = [], names = []) {
  const wanted = new Set(names.map(normTagName));
  return new Set((Array.isArray(tags) ? tags : [])
    .filter((tag) => wanted.has(normTagName(tag?.name)))
    .map((tag) => Number(tag.id))
    .filter(Boolean));
}
function productTagNames(product = {}, tagById = new Map()) {
  const names = [];
  for (const id of productTagIds(product)) {
    const tag = tagById.get(Number(id));
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
function countProductsByTag(products = []) {
  const counts = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const tagId of productTagIds(product)) counts.set(Number(tagId), (counts.get(Number(tagId)) || 0) + 1);
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
  const inheritedAliasKind = k === "plegados" ? "ipanel" : "porton";
  const inheritedAliasMap = k === "porton" ? aliasMap : await getProductAliasMap(inheritedAliasKind);
  const visibilityMap = await getProductVisibilityMap(k);
  const typeVisibility = await getTypeVisibilityMap(k);

  const rawTags = Array.isArray(odooBoot?.tags) ? odooBoot.tags : [];
  const tagById = new Map(rawTags.map((tag) => [Number(tag.id), tag]));
  const productsRaw = (Array.isArray(odooBoot?.products) ? odooBoot.products : []).filter((product) => productTagIds(product).length > 0);

  const rawProductCountsByTag = countProductsByTag(productsRaw);
  const ipanelTagIds = tagIdsByNames(rawTags, ["ipanel", "ipanels"]);
  const plegadosTagIds = tagIdsByNames(rawTags, ["plegado", "plegados"]);
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
    if (tagName && configuredSectionByTagName.has(tagName)) return Number(configuredSectionByTagName.get(tagName) || 0) || null;
    return null;
  }
  function belongsToConfiguredSection(product) {
    return productTagIds(product).some((tagId) => !!resolveSectionIdForTag(tagId) || configuredTagIds.has(Number(tagId)));
  }

  const productsFiltered = productsRaw.filter((product) => {
    const tagIds = productTagIds(product);
    if (!tagIds.length) return false;
    const isIpanel = tagIds.some((tagId) => ipanelTagIds.has(tagId)) || productHasTagName(product, tagById, ["ipanel", "ipanels"]);
    const isPlegados = tagIds.some((tagId) => plegadosTagIds.has(tagId)) || productHasTagName(product, tagById, ["plegado", "plegados"]);
    const configured = belongsToConfiguredSection(product);

    if (k === "ipanel") return isIpanel || configured;
    if (k === "plegados") return isPlegados || isIpanel || configured;
    if (k === "puerta") return configured;
    if (k === "otros") return configured;

    // Portones: trae todos los productos con tag, salvo los reservados a Ipanel.
    // El tag Puerta queda en Portones como puerta de escape, no como presupuestador Puertas.
    return !isIpanel && !isPlegados;
  });

  const sectionById = new Map(sections.map((section) => [Number(section.id), section]));
  const products = productsFiltered.map((product) => {
    const productId = Number(product.id);
    const ownAlias = cleanText(aliasMap.get(productId) || "");
    const inheritedAlias = cleanText(inheritedAliasMap.get(productId) || "");
    const alias = ownAlias || inheritedAlias;
    const odooName = cleanText(product?.name);
    const visibility = visibilityMap.get(productId) || { disable_for_vendedor: false, disable_for_distribuidor: false };
    const tagIds = productTagIds(product);
    const sectionIds = [...new Set(tagIds.map((tagId) => resolveSectionIdForTag(tagId)).filter(Boolean).map(Number))];
    const sectionNames = sectionIds.map((sectionId) => sectionById.get(Number(sectionId))?.name).filter(Boolean);
    const tagNames = productTagNames(product, tagById);
    const usesSurfaceQuantity = sectionIds.some((sectionId) => !!sectionById.get(Number(sectionId))?.use_surface_qty);

    return {
      ...product,
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
