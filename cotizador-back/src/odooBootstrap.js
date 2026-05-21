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
];

const FIELD_CACHE = new Map();

function relationLooksLikeTag(fieldName, meta = {}) {
  const name = String(fieldName || "").toLowerCase();
  const relation = String(meta?.relation || "").toLowerCase();
  const label = String(meta?.string || "").toLowerCase();
  if (String(meta?.type || "") !== "many2many") return false;
  return (
    name.includes("tag") ||
    relation.includes("tag") ||
    label.includes("tag") ||
    label.includes("etiqueta")
  );
}

async function getFieldMeta(odoo, model) {
  if (FIELD_CACHE.has(model)) return FIELD_CACHE.get(model);
  const fields = await odoo.executeKw(model, "fields_get", [], {
    attributes: ["string", "type", "relation"],
  });
  const safe = fields && typeof fields === "object" ? fields : {};
  FIELD_CACHE.set(model, safe);
  return safe;
}

async function getExistingFields(odoo, model, wantedFields = []) {
  const meta = await getFieldMeta(odoo, model);
  return wantedFields.filter((field) => Object.prototype.hasOwnProperty.call(meta, field));
}

async function getTagFields(odoo, model) {
  const meta = await getFieldMeta(odoo, model);
  return TAG_FIELD_CANDIDATES.filter((field) => relationLooksLikeTag(field, meta[field]));
}

function tagStableId(model, id) {
  const numericId = Number(id || 0);
  if (!Number.isFinite(numericId) || numericId <= 0) return 0;

  const relationModel = String(model || "").trim();

  // Mantener compatibilidad con asignaciones existentes del dashboard.
  // Antes los product_tag_ids se guardaban con el ID numerico directo.
  if (relationModel === "product.tag" || relationModel === "product.template.tag") {
    return numericId;
  }

  // Otros modelos de etiquetas se separan para evitar colisionar IDs con product.tag.
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
    for (const id of normalizeMany2Many(row[field])) {
      refs.push({ field, relation, id, stable_id: tagStableId(relation, id) });
    }
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
      const rows = await odoo.executeKw(relation, "read", [ids], {
        fields: ["id", "name", "display_name"],
      });
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = Number(row?.id || 0);
        const stableId = tagStableId(relation, id);
        byStableId.set(stableId, {
          id: stableId,
          raw_id: id,
          model: relation,
          name: cleanText(row?.display_name || row?.name) || `${relation}:${id}`,
        });
      }
    } catch (_err) {
      for (const id of ids) {
        const stableId = tagStableId(relation, id);
        byStableId.set(stableId, {
          id: stableId,
          raw_id: id,
          model: relation,
          name: `${relation}:${id}`,
        });
      }
    }
  }
  return byStableId;
}

export async function inspectOdooProductTags(odoo, { productId = null, templateId = null, query = "" } = {}) {
  const variantMeta = await getFieldMeta(odoo, "product.product");
  const templateMeta = await getFieldMeta(odoo, "product.template");
  const variantTagFields = await getTagFields(odoo, "product.product");
  const templateTagFields = await getTagFields(odoo, "product.template");
  const variantFields = [
    ...new Set([
      ...BASE_VARIANT_FIELDS,
      ...variantTagFields,
      ...await getExistingFields(odoo, "product.product", ["write_date", "active"]),
    ]),
  ];
  const templateFields = [
    ...new Set([
      ...BASE_TEMPLATE_FIELDS,
      ...templateTagFields,
      ...await getExistingFields(odoo, "product.template", ["write_date", "active", "sale_ok"]),
    ]),
  ];

  let variants = [];
  const requestedProductId = Number(productId || 0) || 0;
  const requestedTemplateId = Number(templateId || 0) || 0;
  const textQuery = cleanText(query);

  if (requestedProductId) {
    variants = await odoo.executeKw("product.product", "read", [[requestedProductId]], { fields: variantFields });
  } else if (textQuery) {
    const domain = [
      ["sale_ok", "=", true],
      "|",
      "|",
      ["name", "ilike", textQuery],
      ["display_name", "ilike", textQuery],
      ["default_code", "ilike", textQuery],
    ];
    variants = await odoo.executeKw("product.product", "search_read", [domain], {
      fields: variantFields,
      limit: 20,
      order: "name asc",
    });
  }

  const templateIds = new Set();
  if (requestedTemplateId) templateIds.add(requestedTemplateId);
  for (const variant of Array.isArray(variants) ? variants : []) {
    const tid = templateIdFromVariant(variant);
    if (tid) templateIds.add(tid);
  }

  let templates = [];
  if (templateIds.size) {
    templates = await odoo.executeKw("product.template", "read", [[...templateIds]], { fields: templateFields });
  } else if (textQuery && !variants.length) {
    const domain = [
      "|",
      ["name", "ilike", textQuery],
      ["display_name", "ilike", textQuery],
    ];
    templates = await odoo.executeKw("product.template", "search_read", [domain], {
      fields: templateFields,
      limit: 20,
      order: "name asc",
    });
  }

  const allRefs = [];
  for (const variant of Array.isArray(variants) ? variants : []) {
    allRefs.push(...collectRawTagRefs(variant, variantTagFields, variantMeta));
  }
  for (const template of Array.isArray(templates) ? templates : []) {
    allRefs.push(...collectRawTagRefs(template, templateTagFields, templateMeta));
  }
  const tagNames = await readTagNames(odoo, allRefs);

  function summarize(row, model, tagFields, meta) {
    const refs = collectRawTagRefs(row, tagFields, meta);
    return {
      model,
      id: Number(row?.id || 0),
      name: cleanText(row?.display_name || row?.name),
      tag_fields_detected: tagFields,
      raw_tag_refs: refs,
      tags_resolved: refs.map((ref) => tagNames.get(ref.stable_id) || {
        id: ref.stable_id,
        raw_id: ref.id,
        model: ref.relation,
        name: `${ref.relation}:${ref.id}`,
      }),
      raw: row,
    };
  }

  return {
    ok: true,
    requested: {
      product_id: requestedProductId || null,
      template_id: requestedTemplateId || null,
      query: textQuery || null,
    },
    detected_fields: {
      product_product_tag_fields: variantTagFields.map((field) => ({ field, meta: variantMeta[field] })),
      product_template_tag_fields: templateTagFields.map((field) => ({ field, meta: templateMeta[field] })),
    },
    variants: (Array.isArray(variants) ? variants : []).map((row) => summarize(row, "product.product", variantTagFields, variantMeta)),
    templates: (Array.isArray(templates) ? templates : []).map((row) => summarize(row, "product.template", templateTagFields, templateMeta)),
  };
}

export async function loadOdooBootstrap(odoo) {
  const now = Date.now();
  if (cache && (now - cacheAt) < TTL_MS) return cache;

  const variantMeta = await getFieldMeta(odoo, "product.product");
  const templateMeta = await getFieldMeta(odoo, "product.template");
  const variantTagFields = await getTagFields(odoo, "product.product");
  const templateTagFields = await getTagFields(odoo, "product.template");

  const variantFields = [...new Set([...BASE_VARIANT_FIELDS, ...variantTagFields])];
  const products = await odoo.executeKw(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true]]],
    {
      fields: variantFields,
      limit: 5000,
      order: "name asc",
    }
  );

  const tmplIds = [
    ...new Set(
      products
        .map((p) => templateIdFromVariant(p))
        .filter(Boolean)
    ),
  ];

  let tmplRows = [];
  if (tmplIds.length) {
    const templateFields = [...new Set([...BASE_TEMPLATE_FIELDS, ...templateTagFields])];
    tmplRows = await odoo.executeKw(
      "product.template",
      "read",
      [tmplIds],
      { fields: templateFields }
    );
  }

  const tmplById = new Map((Array.isArray(tmplRows) ? tmplRows : []).map((t) => [Number(t.id), t]));
  const allRefs = [];

  for (const p of Array.isArray(products) ? products : []) {
    allRefs.push(...collectRawTagRefs(p, variantTagFields, variantMeta));
  }
  for (const t of Array.isArray(tmplRows) ? tmplRows : []) {
    allRefs.push(...collectRawTagRefs(t, templateTagFields, templateMeta));
  }

  const tagNamesByStableId = await readTagNames(odoo, allRefs);
  const tags = [...tagNamesByStableId.values()]
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es") || Number(a.id) - Number(b.id));

  const productsOut = products
    .map((p) => {
      const tmplId = templateIdFromVariant(p);
      const tmpl = tmplById.get(Number(tmplId)) || {};
      const refs = [
        ...collectRawTagRefs(p, variantTagFields, variantMeta),
        ...collectRawTagRefs(tmpl, templateTagFields, templateMeta),
      ];
      const tag_ids = [...new Set(refs.map((ref) => Number(ref.stable_id)).filter(Boolean))];
      const resolvedOdooName =
        cleanText(tmpl.display_name || tmpl.name) ||
        cleanText(p.display_name || p.name);

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
    // Regla solicitada: ningun modulo del presupuestador debe traer productos sin tags.
    .filter((p) => Array.isArray(p.tag_ids) && p.tag_ids.length > 0);

  cache = { products: productsOut, tags };
  cacheAt = now;
  return cache;
}

export function clearOdooBootstrapCache() {
  cache = null;
  cacheAt = 0;
  FIELD_CACHE.clear();
}
