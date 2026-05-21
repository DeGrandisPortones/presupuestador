function cleanText(value) {
  return String(value || "").trim();
}

let cache = null;
let cacheAt = 0;
const TTL_MS = Number(process.env.ODOO_BOOTSTRAP_TTL_MS || 60 * 1000);

const TEMPLATE_TAG_FIELD_CANDIDATES = [
  "product_tag_ids",
  "product_template_tag_ids",
  "website_tag_ids",
  "public_categ_ids",
  "tag_ids",
];

const PRODUCT_TAG_FIELD_CANDIDATES = [
  "product_tag_ids",
  "product_template_tag_ids",
  "website_tag_ids",
  "public_categ_ids",
  "tag_ids",
];

const RELATION_OFFSETS = {
  "product.tag": 0,
  "product.template.tag": 1000000,
  "website.tag": 2000000,
  "product.public.category": 3000000,
};

function relationOffset(relation) {
  return RELATION_OFFSETS[String(relation || "").trim()] || 9000000;
}

function makeTagId(rawId, relation) {
  const id = Number(rawId || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return relationOffset(relation) + id;
}

function normalizeMany2many(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (Array.isArray(item)) return Number(item[0] || 0);
      if (item && typeof item === "object") return Number(item.id || item.res_id || 0);
      return Number(item || 0);
    })
    .filter((item) => Number.isFinite(item) && item > 0);
}

async function getModelFields(odoo, model) {
  try {
    const fields = await odoo.executeKw(model, "fields_get", [[]], {
      attributes: ["string", "type", "relation"],
    });
    return fields && typeof fields === "object" ? fields : {};
  } catch (_err) {
    return {};
  }
}

function existingM2mFields(fieldsInfo, candidates) {
  const out = [];
  for (const name of candidates) {
    const info = fieldsInfo?.[name];
    if (!info || info.type !== "many2many") continue;
    out.push({ name, relation: String(info.relation || "").trim() });
  }
  return out;
}

async function safeSearchRead(odoo, model, domain, fields, limit) {
  try {
    return await odoo.executeKw(model, "search_read", [domain], {
      fields,
      limit,
      order: fields.includes("name") ? "name asc" : undefined,
    });
  } catch (_err) {
    return [];
  }
}

async function readTagRowsByRelation(odoo, relationIdsMap) {
  const tagRowsByKey = new Map();

  for (const [relation, idsSet] of relationIdsMap.entries()) {
    const ids = [...idsSet].map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (!relation || !ids.length) continue;

    let rows = await safeSearchRead(odoo, relation, [["id", "in", ids]], ["id", "name", "display_name"], ids.length);

    // Algunas bases antiguas usan product.template.tag aunque el campo informe product.tag, o viceversa.
    if (!rows.length && relation === "product.tag") {
      rows = await safeSearchRead(odoo, "product.template.tag", [["id", "in", ids]], ["id", "name", "display_name"], ids.length);
    } else if (!rows.length && relation === "product.template.tag") {
      rows = await safeSearchRead(odoo, "product.tag", [["id", "in", ids]], ["id", "name", "display_name"], ids.length);
    }

    for (const row of rows || []) {
      const originalId = Number(row?.id || 0);
      const syntheticId = makeTagId(originalId, relation);
      if (!syntheticId) continue;
      tagRowsByKey.set(`${relation}:${originalId}`, {
        id: syntheticId,
        original_id: originalId,
        source_model: relation,
        name: cleanText(row.display_name || row.name),
      });
    }
  }

  return tagRowsByKey;
}

function collectTagInfoFromRow(row, tagFields) {
  const idsByRelation = [];
  for (const field of tagFields) {
    const relation = String(field.relation || "").trim();
    const rawIds = normalizeMany2many(row?.[field.name]);
    for (const originalId of rawIds) {
      const syntheticId = makeTagId(originalId, relation);
      if (!syntheticId) continue;
      idsByRelation.push({ originalId, syntheticId, relation, field: field.name });
    }
  }
  return idsByRelation;
}

function uniqueNumbers(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
}

function uniqueTexts(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

export async function loadOdooBootstrap(odoo) {
  const now = Date.now();
  if (cache && (now - cacheAt) < TTL_MS) return cache;

  const productFieldsInfo = await getModelFields(odoo, "product.product");
  const templateFieldsInfo = await getModelFields(odoo, "product.template");

  const productTagFields = existingM2mFields(productFieldsInfo, PRODUCT_TAG_FIELD_CANDIDATES);
  const templateTagFields = existingM2mFields(templateFieldsInfo, TEMPLATE_TAG_FIELD_CANDIDATES);

  const productFields = [
    "id",
    "name",
    "display_name",
    "default_code",
    "product_tmpl_id",
    "list_price",
    ...productTagFields.map((field) => field.name),
  ];

  const products = await odoo.executeKw(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true]]],
    {
      fields: productFields,
      limit: 5000,
      order: "name asc",
    },
  );

  const tmplIds = [
    ...new Set(
      products
        .map((p) => (Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id))
        .filter(Boolean),
    ),
  ];

  let tmplRows = [];
  if (tmplIds.length) {
    tmplRows = await odoo.executeKw(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      {
        fields: ["id", "name", "display_name", ...templateTagFields.map((field) => field.name)],
        limit: tmplIds.length,
      },
    );
  }

  const relationIdsMap = new Map();
  const addRelationId = (relation, originalId) => {
    if (!relation || !originalId) return;
    if (!relationIdsMap.has(relation)) relationIdsMap.set(relation, new Set());
    relationIdsMap.get(relation).add(Number(originalId));
  };

  for (const row of tmplRows || []) {
    for (const item of collectTagInfoFromRow(row, templateTagFields)) addRelationId(item.relation, item.originalId);
  }
  for (const row of products || []) {
    for (const item of collectTagInfoFromRow(row, productTagFields)) addRelationId(item.relation, item.originalId);
  }

  const tagRowsByKey = await readTagRowsByRelation(odoo, relationIdsMap);

  const tmplMeta = new Map();
  for (const row of tmplRows || []) {
    const tagItems = collectTagInfoFromRow(row, templateTagFields);
    const tagIds = [];
    const tagNames = [];
    for (const item of tagItems) {
      tagIds.push(item.syntheticId);
      const tag = tagRowsByKey.get(`${item.relation}:${item.originalId}`);
      if (tag?.name) tagNames.push(tag.name);
    }
    tmplMeta.set(Number(row.id), {
      name: cleanText(row.display_name || row.name),
      tag_ids: uniqueNumbers(tagIds),
      tag_names: uniqueTexts(tagNames),
    });
  }

  const tagsById = new Map();
  for (const tag of tagRowsByKey.values()) {
    if (!tag?.id || !tag?.name) continue;
    tagsById.set(Number(tag.id), tag);
  }

  const productsOut = products.map((p) => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
    const templateMeta = tmplMeta.get(Number(tmplId)) || { name: "", tag_ids: [], tag_names: [] };
    const productTagItems = collectTagInfoFromRow(p, productTagFields);
    const productTagIds = productTagItems.map((item) => item.syntheticId);
    const productTagNames = productTagItems
      .map((item) => tagRowsByKey.get(`${item.relation}:${item.originalId}`)?.name)
      .filter(Boolean);

    const tag_ids = uniqueNumbers([...(templateMeta.tag_ids || []), ...productTagIds]);
    const tag_names = uniqueTexts([...(templateMeta.tag_names || []), ...productTagNames]);
    const resolvedOdooName = templateMeta.name || cleanText(p.display_name || p.name);

    return {
      id: p.id,
      name: resolvedOdooName,
      code: p.default_code || null,
      list_price: Number(p.list_price || 0),
      tag_ids,
      tag_names,
      odoo_id: Number(tmplId || p.id) || Number(p.id),
      odoo_template_id: Number(tmplId || p.id) || Number(p.id),
      odoo_variant_id: Number(p.id) || 0,
    };
  });

  const tags = [...tagsById.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));

  cache = { products: productsOut, tags };
  cacheAt = now;
  return cache;
}

export function clearOdooBootstrapCache() {
  cache = null;
  cacheAt = 0;
}
