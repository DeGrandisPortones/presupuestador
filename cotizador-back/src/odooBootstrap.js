function cleanText(value) {
  return String(value || "").trim();
}

let cache = null;
let cacheAt = 0;
const TTL_MS = Number(process.env.ODOO_BOOTSTRAP_TTL_MS || 60 * 1000);

const BASE_VARIANT_FIELDS = [
  "id",
  "name",
  "display_name",
  "default_code",
  "product_tmpl_id",
  "list_price",
  "sale_ok",
];

const BASE_TEMPLATE_FIELDS = [
  "id",
  "name",
  "display_name",
];

const TAG_FIELD_CANDIDATES = [
  "product_tag_ids",
  "product_template_tag_ids",
  "tag_ids",
  "website_tag_ids",
  "public_categ_ids",
  "product_public_category_ids",
  "ecommerce_tag_ids",
  "website_product_tag_ids",
];

const FIELD_CACHE = new Map();

function relationLooksLikeTag(fieldName, meta = {}) {
  const name = String(fieldName || "").toLowerCase();
  const relation = String(meta?.relation || "").toLowerCase();
  const label = String(meta?.string || "").toLowerCase();
  if (String(meta?.type || "") !== "many2many") return false;
  return name.includes("tag") || relation.includes("tag") || label.includes("tag") || label.includes("etiqueta");
}

async function getFieldMeta(odoo, model) {
  if (FIELD_CACHE.has(model)) return FIELD_CACHE.get(model);
  try {
    const fields = await odoo.executeKw(model, "fields_get", [], {
      attributes: ["string", "type", "relation"],
    });
    const safe = fields && typeof fields === "object" ? fields : {};
    FIELD_CACHE.set(model, safe);
    return safe;
  } catch (err) {
    console.error(`[ODOO TAGS] No se pudo leer fields_get de ${model}:`, err?.message || err);
    FIELD_CACHE.set(model, {});
    return {};
  }
}

async function getExistingFields(odoo, model, wantedFields = []) {
  const meta = await getFieldMeta(odoo, model);
  return wantedFields.filter((field) => Object.prototype.hasOwnProperty.call(meta, field));
}

async function getTagFields(odoo, model) {
  const meta = await getFieldMeta(odoo, model);
  const out = new Set();
  for (const field of TAG_FIELD_CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(meta, field) && relationLooksLikeTag(field, meta[field])) out.add(field);
  }
  for (const [field, fieldMeta] of Object.entries(meta || {})) {
    if (relationLooksLikeTag(field, fieldMeta)) out.add(field);
  }
  return [...out];
}

function tagStableId(model, id) {
  const numericId = Number(id || 0);
  if (!Number.isFinite(numericId) || numericId <= 0) return 0;
  const relationModel = String(model || "").trim();
  if (relationModel === "product.tag" || relationModel === "product.template.tag") return numericId;
  let hash = 0;
  for (const char of relationModel) hash = ((hash * 31) + char.charCodeAt(0)) % 900;
  return 1000000 + (hash * 100000) + numericId;
}

function normalizeMany2Many(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (Array.isArray(item)) return Number(item[0] || 0);
      if (item && typeof item === "object") return Number(item.id || 0);
      return Number(item || 0);
    })
    .filter((id) => Number.isFinite(id) && id > 0);
}

function templateIdFromVariant(row = {}) {
  const raw = row.product_tmpl_id;
  if (Array.isArray(raw)) return Number(raw[0] || 0) || 0;
  return Number(raw || 0) || 0;
}

function collectRawTagRefs(row = {}, tagFields = [], fieldMeta = {}) {
  const refs = [];
  for (const field of tagFields) {
    const relation = String(fieldMeta?.[field]?.relation || "").trim();
    if (!relation) continue;
    for (const id of normalizeMany2Many(row[field])) refs.push({ field, relation, id, stable_id: tagStableId(relation, id) });
  }
  return refs;
}

async function readTagNames(odoo, refs = []) {
  const grouped = new Map();
  for (const ref of refs) {
    if (!ref?.relation || !ref?.id) continue;
    if (!grouped.has(ref.relation)) grouped.set(ref.relation, new Set());
    grouped.get(ref.relation).add(Number(ref.id));
  }
  const byStableId = new Map();
  for (const [relation, idsSet] of grouped.entries()) {
    const ids = [...idsSet].filter(Boolean);
    if (!ids.length) continue;
    try {
      const rows = await odoo.executeKw(relation, "read", [ids], { fields: ["id", "name", "display_name"] });
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = Number(row?.id || 0);
        const stableId = tagStableId(relation, id);
        byStableId.set(stableId, { id: stableId, raw_id: id, model: relation, name: cleanText(row?.display_name || row?.name) || `${relation}:${id}` });
      }
    } catch (err) {
      console.error(`[ODOO TAGS] No se pudieron leer nombres de tags en ${relation}:`, err?.message || err);
      for (const id of ids) {
        const stableId = tagStableId(relation, id);
        byStableId.set(stableId, { id: stableId, raw_id: id, model: relation, name: `${relation}:${id}` });
      }
    }
  }
  return byStableId;
}

async function filterReadableFields(odoo, model, baseFields = [], tagFields = [], testArgsBuilder) {
  const readable = [];
  for (const field of tagFields) {
    try {
      const args = testArgsBuilder(field);
      await odoo.executeKw(model, args.method, args.args, args.kwargs);
      readable.push(field);
    } catch (err) {
      console.error(`[ODOO TAGS] Campo descartado por error de lectura ${model}.${field}:`, err?.message || err);
    }
  }
  return [...new Set([...baseFields, ...readable])];
}

async function safeProductSearchRead(odoo, domain, baseFields, tagFields, limit = 5000) {
  const fields = await filterReadableFields(
    odoo,
    "product.product",
    baseFields,
    tagFields,
    (field) => ({
      method: "search_read",
      args: [[ ["sale_ok", "=", true] ]],
      kwargs: { fields: [...baseFields, field], limit: 1 },
    }),
  );
  try {
    return await odoo.executeKw("product.product", "search_read", [domain], { fields, limit, order: "name asc" });
  } catch (err) {
    console.error("[ODOO TAGS] Fallback product.product sin campos opcionales:", err?.message || err);
    return await odoo.executeKw("product.product", "search_read", [domain], { fields: baseFields, limit, order: "name asc" });
  }
}

async function safeTemplateRead(odoo, ids, baseFields, tagFields) {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))];
  if (!cleanIds.length) return [];
  const fields = await filterReadableFields(
    odoo,
    "product.template",
    baseFields,
    tagFields,
    (field) => ({ method: "read", args: [[cleanIds[0]]], kwargs: { fields: [...baseFields, field] } }),
  );
  try {
    return await odoo.executeKw("product.template", "read", [cleanIds], { fields });
  } catch (err) {
    console.error("[ODOO TAGS] Fallback product.template sin campos opcionales:", err?.message || err);
    return await odoo.executeKw("product.template", "read", [cleanIds], { fields: baseFields });
  }
}

function tagFieldNamesFromRow(row = {}, meta = {}) {
  return Object.keys(row || {}).filter((field) => Object.prototype.hasOwnProperty.call(meta, field) && relationLooksLikeTag(field, meta[field]));
}

export async function inspectOdooProductTags(odoo, { productId = null, templateId = null, query = "" } = {}) {
  const variantMeta = await getFieldMeta(odoo, "product.product");
  const templateMeta = await getFieldMeta(odoo, "product.template");
  const variantTagFields = await getTagFields(odoo, "product.product");
  const templateTagFields = await getTagFields(odoo, "product.template");
  const variantBaseFields = [...new Set([...BASE_VARIANT_FIELDS, ...await getExistingFields(odoo, "product.product", ["write_date", "active"])])];
  const templateBaseFields = [...new Set([...BASE_TEMPLATE_FIELDS, ...await getExistingFields(odoo, "product.template", ["write_date", "active", "sale_ok"])])];

  let variants = [];
  const requestedProductId = Number(productId || 0) || 0;
  const requestedTemplateId = Number(templateId || 0) || 0;
  const textQuery = cleanText(query);

  if (requestedProductId) {
    const rows = await safeProductSearchRead(odoo, [["id", "=", requestedProductId]], variantBaseFields, variantTagFields, 1);
    variants = rows || [];
  } else if (requestedTemplateId) {
    // Fetch ALL variants for this template (no sale_ok filter) so we can report counts
    const rows = await safeProductSearchRead(odoo, [["product_tmpl_id", "=", requestedTemplateId]], variantBaseFields, variantTagFields, 50);
    variants = rows || [];
  } else if (textQuery) {
    const domain = [["sale_ok", "=", true], "|", "|", ["name", "ilike", textQuery], ["display_name", "ilike", textQuery], ["default_code", "ilike", textQuery]];
    variants = await safeProductSearchRead(odoo, domain, variantBaseFields, variantTagFields, 20);
  }

  const templateIds = new Set();
  if (requestedTemplateId) templateIds.add(requestedTemplateId);
  for (const variant of Array.isArray(variants) ? variants : []) {
    const tid = templateIdFromVariant(variant);
    if (tid) templateIds.add(tid);
  }
  const templates = await safeTemplateRead(odoo, [...templateIds], templateBaseFields, templateTagFields);

  const realVariantTagFields = [...new Set([...
    variantTagFields,
    ...(Array.isArray(variants) ? variants : []).flatMap((row) => tagFieldNamesFromRow(row, variantMeta)),
  ])];
  const realTemplateTagFields = [...new Set([...
    templateTagFields,
    ...(Array.isArray(templates) ? templates : []).flatMap((row) => tagFieldNamesFromRow(row, templateMeta)),
  ])];

  const allRefs = [];
  for (const row of Array.isArray(variants) ? variants : []) allRefs.push(...collectRawTagRefs(row, realVariantTagFields, variantMeta));
  for (const row of Array.isArray(templates) ? templates : []) allRefs.push(...collectRawTagRefs(row, realTemplateTagFields, templateMeta));
  const tagNames = await readTagNames(odoo, allRefs);

  function summarize(row, model, tagFields, meta) {
    const refs = collectRawTagRefs(row, tagFields, meta);
    return {
      model,
      id: Number(row?.id || 0),
      name: cleanText(row?.display_name || row?.name),
      tag_fields_detected: tagFields,
      raw_tag_refs: refs,
      tags_resolved: refs.map((ref) => tagNames.get(ref.stable_id) || { id: ref.stable_id, raw_id: ref.id, model: ref.relation, name: `${ref.relation}:${ref.id}` }),
      raw: row,
    };
  }

  return {
    ok: true,
    requested: { product_id: requestedProductId || null, template_id: requestedTemplateId || null, query: textQuery || null },
    detected_fields: {
      product_product_tag_fields: realVariantTagFields.map((field) => ({ field, meta: variantMeta[field] })),
      product_template_tag_fields: realTemplateTagFields.map((field) => ({ field, meta: templateMeta[field] })),
    },
    variants: (Array.isArray(variants) ? variants : []).map((row) => summarize(row, "product.product", realVariantTagFields, variantMeta)),
    templates: (Array.isArray(templates) ? templates : []).map((row) => summarize(row, "product.template", realTemplateTagFields, templateMeta)),
  };
}

export async function loadOdooBootstrap(odoo) {
  const now = Date.now();
  if (cache && (now - cacheAt) < TTL_MS) return cache;

  const variantMeta = await getFieldMeta(odoo, "product.product");
  const templateMeta = await getFieldMeta(odoo, "product.template");
  const variantTagFields = await getTagFields(odoo, "product.product");
  const templateTagFields = await getTagFields(odoo, "product.template");

  const products = await safeProductSearchRead(odoo, [["sale_ok", "=", true]], BASE_VARIANT_FIELDS, variantTagFields, 5000);
  const tmplIds = [...new Set((Array.isArray(products) ? products : []).map((p) => templateIdFromVariant(p)).filter(Boolean))];
  const tmplRows = await safeTemplateRead(odoo, tmplIds, BASE_TEMPLATE_FIELDS, templateTagFields);

  const tmplById = new Map((Array.isArray(tmplRows) ? tmplRows : []).map((t) => [Number(t.id), t]));
  const realVariantTagFields = [...new Set([...
    variantTagFields,
    ...(Array.isArray(products) ? products : []).flatMap((row) => tagFieldNamesFromRow(row, variantMeta)),
  ])];
  const realTemplateTagFields = [...new Set([...
    templateTagFields,
    ...(Array.isArray(tmplRows) ? tmplRows : []).flatMap((row) => tagFieldNamesFromRow(row, templateMeta)),
  ])];

  const allRefs = [];
  for (const p of Array.isArray(products) ? products : []) allRefs.push(...collectRawTagRefs(p, realVariantTagFields, variantMeta));
  for (const t of Array.isArray(tmplRows) ? tmplRows : []) allRefs.push(...collectRawTagRefs(t, realTemplateTagFields, templateMeta));

  const tagNamesByStableId = await readTagNames(odoo, allRefs);
  const tags = [...tagNamesByStableId.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es") || Number(a.id) - Number(b.id));

  const productsOut = (Array.isArray(products) ? products : [])
    .map((p) => {
      const tmplId = templateIdFromVariant(p);
      const tmpl = tmplById.get(Number(tmplId)) || {};
      const refs = [
        ...collectRawTagRefs(p, realVariantTagFields, variantMeta),
        ...collectRawTagRefs(tmpl, realTemplateTagFields, templateMeta),
      ];
      const tag_ids = [...new Set(refs.map((ref) => Number(ref.stable_id)).filter(Boolean))];
      const resolvedOdooName = cleanText(tmpl.display_name || tmpl.name) || cleanText(p.display_name || p.name);
      return {
        id: p.id,
        name: resolvedOdooName,
        code: p.default_code || null,
        list_price: Number(p.list_price || 0),
        tag_ids,
        tag_debug: refs.map((ref) => ({
          field: ref.field,
          relation: ref.relation,
          raw_id: ref.id,
          stable_id: ref.stable_id,
          name: tagNamesByStableId.get(Number(ref.stable_id))?.name || "",
        })),
        odoo_id: Number(tmplId || p.id) || Number(p.id),
        odoo_template_id: Number(tmplId || p.id) || Number(p.id),
        odoo_variant_id: Number(p.id) || 0,
      };
    })
    .filter((p) => Array.isArray(p.tag_ids) && p.tag_ids.length > 0);

  cache = { products: productsOut, tags };
  cacheAt = now;
  return cache;
}

function normTagDebugName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
function productDebugHasTagName(product, tagName) {
  const wanted = normTagDebugName(tagName);
  if (!wanted) return false;
  return (Array.isArray(product?.tag_debug) ? product.tag_debug : []).some((dbg) => normTagDebugName(dbg?.name) === wanted);
}

export async function inspectOdooTagAndProducts(odoo, { tagName = "Puerta", productId = null, templateId = null, query = "SIN PUERTA" } = {}) {
  clearOdooBootstrapCache();
  const requestedTagName = cleanText(tagName) || "Puerta";
  const requestedProductId = Number(productId || 0) || null;
  const requestedTemplateId = Number(templateId || 0) || null;
  const requestedQuery = cleanText(query) || "SIN PUERTA";
  const boot = await loadOdooBootstrap(odoo);
  const tags = Array.isArray(boot?.tags) ? boot.tags : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];
  const matchingTags = tags.filter((tag) => normTagDebugName(tag?.name) === normTagDebugName(requestedTagName));
  const matchingTagIds = new Set(matchingTags.map((tag) => Number(tag?.id || 0)).filter(Boolean));
  const productsWithTagById = products.filter((product) => (Array.isArray(product?.tag_ids) ? product.tag_ids.map(Number) : []).some((id) => matchingTagIds.has(Number(id))));
  const productsWithTagByName = products.filter((product) => productDebugHasTagName(product, requestedTagName));
  const productDebugByQuery = requestedQuery ? await inspectOdooProductTags(odoo, { query: requestedQuery }) : null;
  const productDebugByTemplate = requestedTemplateId ? await inspectOdooProductTags(odoo, { templateId: requestedTemplateId }) : null;
  const productDebugByVariant = requestedProductId ? await inspectOdooProductTags(odoo, { productId: requestedProductId }) : null;

  return {
    ok: true,
    requested: { tag_name: requestedTagName, product_id: requestedProductId, template_id: requestedTemplateId, query: requestedQuery || null },
    bootstrap_summary: {
      total_tags: tags.length,
      total_products_with_any_tag: products.length,
      matching_tags: matchingTags,
      matching_tag_ids: [...matchingTagIds],
      products_with_tag_by_id_count: productsWithTagById.length,
      products_with_tag_by_name_count: productsWithTagByName.length,
      products_with_tag_by_id: productsWithTagById.slice(0, 100),
      products_with_tag_by_name: productsWithTagByName.slice(0, 100),
    },
    product_debug_by_query: productDebugByQuery,
    product_debug_by_template: productDebugByTemplate,
    product_debug_by_variant: productDebugByVariant,
  };
}

export function clearOdooBootstrapCache() {
  cache = null;
  cacheAt = 0;
  FIELD_CACHE.clear();
}
