import express from "express";
import { getPriceUpdaterCategoryMap, setPriceUpdaterCategoryMap } from "../settingsDb.js";

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function m2oId(value) {
  if (Array.isArray(value)) return toId(value[0]);
  return toId(value);
}

function m2oName(value) {
  if (Array.isArray(value)) return String(value[1] || "");
  return "";
}

function uniqNumbers(values) {
  return Array.from(new Set(asArray(values).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
}

function cleanText(value) {
  return String(value || "").trim();
}

function roundMoney(value) {
  const n = Number(value || 0);
  return Math.round(n * 100) / 100;
}

function low(value) {
  return cleanText(value).toLowerCase();
}

function isDefaultPricelistName(name) {
  const n = low(name);
  return n === "predeterminada" || n === "predeterminado" || n.includes("predeterminad") || n === "default";
}

function companyContext(companyId, extra = {}) {
  const id = toId(companyId);
  if (!id) {
    return { active_test: false, __skip_default_company_context: true, ...extra };
  }
  return { active_test: false, company_id: id, force_company: id, allowed_company_ids: [id], ...extra };
}

async function searchRead(odoo, model, domain, fields, extra = {}) {
  return odoo.executeKw(model, "search_read", [domain], {
    fields,
    ...extra,
  });
}

async function readRecords(odoo, model, ids, fields, context = {}) {
  const cleanIds = uniqNumbers(ids);
  if (!cleanIds.length) return [];
  return odoo.executeKw(model, "read", [cleanIds], { fields, context });
}

function parseRef(value, defaultType = "item") {
  const raw = String(value || "").trim();
  const match = raw.match(/^([a-z_]+):(\d+)$/i);
  if (match) return { type: match[1].toLowerCase(), id: toId(match[2]) };
  const id = toId(raw);
  return id ? { type: defaultType, id } : { type: "", id: null };
}

function normalizeCompanyFromM2o(company) {
  const id = m2oId(company);
  if (!id) return null;
  return { id, name: m2oName(company) || `Empresa #${id}` };
}

function normalizePricelist(pl, fallbackCompanyId = null) {
  const id = toId(pl?.id);
  const company = normalizeCompanyFromM2o(pl?.company_id);
  return {
    ...pl,
    id,
    name: cleanText(pl?.name || pl?.display_name || `Lista #${id}`),
    company_resolved_id: company?.id || fallbackCompanyId || null,
    company_resolved_name: company?.name || "",
    is_default_pricelist: isDefaultPricelistName(pl?.name || pl?.display_name),
  };
}


function rowName(row) {
  const id = toId(row?.id);
  return cleanText(row?.name || row?.display_name || `Lista #${id}`);
}

function scorePricelistNameRows(rows, expectedCount = 0) {
  const names = asArray(rows).map(rowName).filter(Boolean);
  const lowered = names.map((n) => low(n));
  const uniqueCount = new Set(lowered).size;
  const duplicateCount = Math.max(0, names.length - uniqueCount);
  const missingCount = Math.max(0, Number(expectedCount || 0) - names.length);
  const defaultLikeCount = lowered.filter((n) => isDefaultPricelistName(n)).length;
  const genericDistributorCount = lowered.filter((n) => n === "distribuidor mayorista").length;

  // En Vert se estaban leyendo nombres viejos/de base, con duplicados como
  // "Distribuidor Mayorista" y un "Predeterminado" que en Odoo se ve como
  // "Tarjeta de crédito". Preferimos el idioma/contexto que tenga nombres
  // más específicos y menos repetidos.
  return (
    missingCount * 10000 +
    duplicateCount * 1000 +
    Math.max(0, genericDistributorCount - 1) * 200 +
    Math.max(0, defaultLikeCount - 1) * 50
  );
}

function mergePricelistRowsWithNames(baseRows, nameRows, fallbackCompanyId = null) {
  const namesById = new Map();
  for (const row of asArray(nameRows)) {
    const id = toId(row?.id);
    if (!id) continue;
    namesById.set(id, rowName(row));
  }

  return asArray(baseRows).map((row) => {
    const id = toId(row?.id);
    const name = cleanText(namesById.get(id) || row?.name || row?.display_name || `Lista #${id}`);
    return normalizePricelist({ ...row, name, display_name: name }, fallbackCompanyId);
  });
}

async function activeLangCodes(odoo) {
  try {
    const rows = await searchRead(
      odoo,
      "res.lang",
      [["active", "=", true]],
      ["code", "name", "active"],
      { context: companyContext(null), limit: 200 }
    );
    return asArray(rows)
      .map((r) => cleanText(r?.code))
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

async function choosePricelistRowsForDisplayNames(odoo, ids, baseRows, companyId, fields) {
  const cleanIds = uniqNumbers(ids);
  if (!cleanIds.length) return baseRows;

  const installedLangs = await activeLangCodes(odoo);
  const langCandidates = [
    null,
    false,
    "es_AR",
    "es_419",
    "es_ES",
    "es_UY",
    "es_MX",
    ...installedLangs.filter((code) => low(code).startsWith("es")),
    ...installedLangs,
  ];

  const seen = new Set();
  const candidates = [{ label: "base", rows: baseRows, order: 0 }];
  let order = 1;

  for (const lang of langCandidates) {
    const key = String(lang);
    if (seen.has(key)) continue;
    seen.add(key);

    const context = companyContext(companyId, lang === null ? {} : { lang });
    try {
      const rows = await readRecords(odoo, "product.pricelist", cleanIds, fields, context);
      candidates.push({ label: key, rows, order });
    } catch (_e) {
      // Algunos Odoo no aceptan todos los códigos de idioma. Se ignora y sigue.
    }
    order += 1;
  }

  candidates.sort((a, b) => {
    const sa = scorePricelistNameRows(a.rows, cleanIds.length);
    const sb = scorePricelistNameRows(b.rows, cleanIds.length);
    if (sa !== sb) return sa - sb;
    return a.order - b.order;
  });

  return candidates[0]?.rows || baseRows;
}

function pricelistSort(a, b) {
  const aid = Number(a?.id || 0);
  const bid = Number(b?.id || 0);
  if (aid !== bid) return aid - bid;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "es", { numeric: true });
}

async function listPricelistsForCompany(odoo, companyId) {
  const company = toId(companyId);
  const fields = ["id", "name", "display_name", "company_id", "currency_id", "active"];
  const options = { order: "name asc", context: companyContext(company) };

  let domain = [];
  if (company) domain = [["company_id", "=", company]];

  let pricelists = await searchRead(odoo, "product.pricelist", domain, fields, options);

  // Fallback solo a listas sin empresa. Nunca devolvemos listas de otra empresa.
  if (company && (!Array.isArray(pricelists) || pricelists.length === 0)) {
    pricelists = await searchRead(
      odoo,
      "product.pricelist",
      [["company_id", "=", false]],
      fields,
      { order: "name asc", context: companyContext(null) }
    );
  }

  const baseRows = asArray(pricelists).filter((pl) => toId(pl?.id));
  const ids = baseRows.map((pl) => toId(pl?.id));
  const nameRows = await choosePricelistRowsForDisplayNames(odoo, ids, baseRows, company, fields);

  return mergePricelistRowsWithNames(baseRows, nameRows, company)
    .filter((pl) => pl.id)
    .sort(pricelistSort);
}

async function getPricelistOrFail(odoo, id) {
  const rows = await searchRead(
    odoo,
    "product.pricelist",
    [["id", "=", Number(id)]],
    ["id", "name", "display_name", "company_id", "currency_id", "active"],
    { limit: 1, context: companyContext(null) }
  );
  const row = rows?.[0];
  if (!row) {
    const err = new Error("Lista de precios no encontrada.");
    err.status = 404;
    throw err;
  }
  return normalizePricelist(row);
}

async function getPricelistItems(odoo, pricelistId, context) {
  return searchRead(
    odoo,
    "product.pricelist.item",
    [["pricelist_id", "=", pricelistId]],
    [
      "id",
      "pricelist_id",
      "product_tmpl_id",
      "product_id",
      "categ_id",
      "applied_on",
      "compute_price",
      "fixed_price",
      "percent_price",
      "price_discount",
      "base",
      "base_pricelist_id",
      "min_quantity",
      "date_start",
      "date_end",
    ],
    { order: "applied_on asc, id asc", limit: 10000, context }
  );
}

function relationLooksLikeTag(fieldName, meta = {}) {
  const name = String(fieldName || "").toLowerCase();
  const relation = String(meta?.relation || "").toLowerCase();
  const label = String(meta?.string || "").toLowerCase();
  if (String(meta?.type || "") !== "many2many") return false;
  return name.includes("tag") || relation.includes("tag") || label.includes("tag") || label.includes("etiqueta");
}

// Metadata del campo de tags (nombre + modelo relacionado) no cambia por empresa,
// así que este cache global es seguro a diferencia de los datos de productos, que sí son por empresa.
let tagFieldCache = null;

async function detectProductTagField(odoo) {
  if (tagFieldCache !== null) return tagFieldCache;
  try {
    const meta = await odoo.executeKw("product.template", "fields_get", [], {
      attributes: ["string", "type", "relation"],
    });
    const preferred = ["product_tag_ids", "product_template_tag_ids", "tag_ids"];
    let found = null;
    for (const field of preferred) {
      if (meta?.[field] && relationLooksLikeTag(field, meta[field])) {
        found = { field, relation: meta[field].relation };
        break;
      }
    }
    if (!found) {
      for (const [field, info] of Object.entries(meta || {})) {
        if (relationLooksLikeTag(field, info)) {
          found = { field, relation: info.relation };
          break;
        }
      }
    }
    tagFieldCache = found;
  } catch (_e) {
    tagFieldCache = null;
  }
  return tagFieldCache;
}

async function loadAllProductTags(odoo) {
  const detected = await detectProductTagField(odoo);
  if (!detected) return [];
  try {
    const rows = await searchRead(
      odoo,
      detected.relation,
      [],
      ["id", "name", "display_name"],
      { order: "name asc", context: companyContext(null), limit: 2000 }
    );
    return asArray(rows)
      .map((r) => ({ id: toId(r.id), name: cleanText(r.display_name || r.name) }))
      .filter((t) => t.id)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch (_e) {
    return [];
  }
}

async function loadTemplateTagMap(odoo, companyId) {
  const detected = await detectProductTagField(odoo);
  const map = new Map();
  if (!detected) return map;
  try {
    const rows = await searchRead(
      odoo,
      "product.template",
      [],
      ["id", detected.field],
      { context: companyContext(companyId), limit: 10000 }
    );
    for (const row of asArray(rows)) {
      const id = toId(row.id);
      if (!id) continue;
      const tagIds = uniqNumbers(row[detected.field]);
      if (tagIds.length) map.set(id, tagIds);
    }
  } catch (_e) {
    // Si falla la lectura del campo de tags, seguimos sin categorías en vez de romper la pantalla de precios.
  }
  return map;
}

async function productTemplatesForCompany(odoo, companyId, templateTagMap = new Map()) {
  const context = companyContext(companyId);
  const domain = [["sale_ok", "=", true]];
  const rows = await searchRead(
    odoo,
    "product.template",
    domain,
    ["id", "name", "display_name", "default_code", "list_price", "company_id", "active", "sale_ok"],
    { order: "name asc", limit: 10000, context }
  );

  return (rows || [])
    .filter((p) => p?.active !== false)
    .map((p) => ({
      id: `template:${Number(p.id)}`,
      item_id: null,
      item_model: "product.template",
      pricelist_id: null,
      product_id: null,
      product_tmpl_id: Number(p.id),
      product_name: cleanText(p.display_name || p.name || `Producto #${p.id}`),
      default_code: cleanText(p.default_code || ""),
      applied_on: "product_template",
      compute_price: "list_price",
      fixed_price: Number(p.list_price || 0),
      percent_price: 0,
      price_discount: 0,
      base: "list_price",
      base_pricelist_id: null,
      min_quantity: 0,
      date_start: null,
      date_end: null,
      tag_ids: templateTagMap.get(Number(p.id)) || [],
    }));
}

async function normalizePricelistItems(odoo, items, pricelistId, pricelistName, context, templateTagMap = new Map()) {
  const productVariantIds = items.map((it) => m2oId(it.product_id)).filter(Boolean);
  const variants = await readRecords(odoo, "product.product", productVariantIds, ["id", "display_name", "default_code", "product_tmpl_id"], context);
  const variantById = new Map(variants.map((v) => [Number(v.id), v]));

  const tmplIds = [
    ...items.map((it) => m2oId(it.product_tmpl_id)).filter(Boolean),
    ...variants.map((v) => m2oId(v.product_tmpl_id)).filter(Boolean),
  ];
  const templates = await readRecords(odoo, "product.template", tmplIds, ["id", "name", "display_name", "default_code", "list_price"], context);
  const tmplById = new Map(templates.map((t) => [Number(t.id), t]));

  return items.map((it) => {
    const variantId = m2oId(it.product_id);
    const variant = variantId ? variantById.get(variantId) : null;
    const tmplId = m2oId(it.product_tmpl_id) || m2oId(variant?.product_tmpl_id);
    const tmpl = tmplId ? tmplById.get(tmplId) : null;
    const productName =
      m2oName(it.product_id) ||
      m2oName(it.product_tmpl_id) ||
      cleanText(variant?.display_name) ||
      cleanText(tmpl?.display_name || tmpl?.name) ||
      m2oName(it.categ_id) ||
      "Regla global / categoría";

    return {
      id: `item:${Number(it.id)}`,
      item_id: Number(it.id),
      item_model: "product.pricelist.item",
      pricelist_id: pricelistId,
      pricelist_name: pricelistName,
      product_id: variantId,
      product_tmpl_id: tmplId,
      product_name: productName,
      default_code: cleanText(variant?.default_code || tmpl?.default_code || ""),
      applied_on: it.applied_on,
      compute_price: it.compute_price,
      fixed_price: Number(it.fixed_price || 0),
      percent_price: Number(it.percent_price || 0),
      price_discount: Number(it.price_discount || 0),
      base: it.base,
      base_pricelist_id: it.base_pricelist_id,
      min_quantity: Number(it.min_quantity || 0),
      date_start: it.date_start || null,
      date_end: it.date_end || null,
      tag_ids: templateTagMap.get(Number(tmplId)) || [],
    };
  });
}

async function productsForPricelist(odoo, pricelist) {
  const companyId = pricelist.company_resolved_id || null;
  const context = companyContext(companyId);
  const items = await getPricelistItems(odoo, pricelist.id, context);
  const templateTagMap = await loadTemplateTagMap(odoo, companyId);

  if (Array.isArray(items) && items.length) {
    return normalizePricelistItems(odoo, items, pricelist.id, pricelist.name, context, templateTagMap);
  }

  // En Odoo, la lista Predeterminado suele usar el precio base del producto
  // y no genera reglas product.pricelist.item. Para esa lista mostramos productos.
  if (pricelist.is_default_pricelist) {
    return productTemplatesForCompany(odoo, companyId, templateTagMap);
  }

  return [];
}

async function updateItemRef(odoo, ref, fixedPrice, companyId = null) {
  if (ref.type === "template") {
    await odoo.executeKw(
      "product.template",
      "write",
      [[ref.id], { list_price: roundMoney(fixedPrice) }],
      { context: companyContext(companyId) }
    );
    return { id: `template:${ref.id}`, item_model: "product.template", fixed_price: roundMoney(fixedPrice) };
  }

  await odoo.executeKw(
    "product.pricelist.item",
    "write",
    [[ref.id], { compute_price: "fixed", fixed_price: roundMoney(fixedPrice) }],
    { context: companyContext(companyId) }
  );
  return { id: `item:${ref.id}`, item_model: "product.pricelist.item", fixed_price: roundMoney(fixedPrice) };
}

async function increaseTemplatesForCompany(odoo, companyId, pct) {
  const products = await productTemplatesForCompany(odoo, companyId);
  let updated = 0;
  const details = [];

  for (const p of products) {
    const ref = parseRef(p.id, "template");
    const current = Number(p.fixed_price || 0);
    if (!ref.id || !Number.isFinite(current) || current <= 0) continue;
    const nextPrice = roundMoney(current * (1 + pct / 100));
    await updateItemRef(odoo, ref, nextPrice, companyId);
    updated += 1;
    details.push({ id: p.id, previous_price: current, fixed_price: nextPrice });
  }

  return { updated, details };
}

async function increasePricelistItems(odoo, itemIds, pct, companyId = null) {
  const ids = uniqNumbers(itemIds);
  if (!ids.length) return { updated: 0, details: [] };

  const items = await searchRead(
    odoo,
    "product.pricelist.item",
    [["id", "in", ids]],
    ["id", "fixed_price", "compute_price", "pricelist_id", "product_tmpl_id", "product_id"],
    { limit: 10000, context: companyContext(companyId) }
  );

  let updated = 0;
  const details = [];

  for (const item of items || []) {
    const current = Number(item.fixed_price || 0);
    if (!Number.isFinite(current) || current <= 0) continue;
    const nextPrice = roundMoney(current * (1 + pct / 100));
    await updateItemRef(odoo, { type: "item", id: Number(item.id) }, nextPrice, companyId);
    updated += 1;
    details.push({ id: `item:${Number(item.id)}`, previous_price: current, fixed_price: nextPrice });
  }

  return { updated, details };
}

export function buildPriceListsRouter(odoo) {
  const router = express.Router();

  router.get("/companies", async (_req, res, next) => {
    try {
      let companies = [];

      try {
        companies = await searchRead(
          odoo,
          "res.company",
          [],
          ["id", "name", "display_name"],
          { order: "name asc", context: companyContext(null) }
        );
      } catch (_e) {
        companies = [];
      }

      const byId = new Map();
      for (const c of companies || []) {
        const id = toId(c?.id);
        if (!id) continue;
        byId.set(id, {
          id,
          name: cleanText(c?.name || c?.display_name || `Empresa #${id}`),
        });
      }

      const pricelists = await searchRead(
        odoo,
        "product.pricelist",
        [],
        ["id", "name", "company_id"],
        { order: "name asc", context: companyContext(null) }
      );

      for (const pl of pricelists || []) {
        const c = normalizeCompanyFromM2o(pl?.company_id);
        if (c && !byId.has(c.id)) byId.set(c.id, c);
      }

      const out = Array.from(byId.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
      res.json({ ok: true, companies: out });
    } catch (e) {
      next(e);
    }
  });

  router.get("/tags", async (_req, res, next) => {
    try {
      const tags = await loadAllProductTags(odoo);
      res.json({ ok: true, tags });
    } catch (e) {
      next(e);
    }
  });

  router.get("/category-map", async (_req, res, next) => {
    try {
      const map = await getPriceUpdaterCategoryMap();
      res.json({ ok: true, map });
    } catch (e) {
      next(e);
    }
  });

  router.put("/category-map", async (req, res, next) => {
    try {
      const map = await setPriceUpdaterCategoryMap(req.body?.map || {});
      res.json({ ok: true, map });
    } catch (e) {
      next(e);
    }
  });

  async function sendLists(req, res, next) {
    try {
      const companyId = toId(req.query.company_id || req.params.companyId);
      const pricelists = await listPricelistsForCompany(odoo, companyId);
      res.json({ ok: true, company_id: companyId, pricelists });
    } catch (e) {
      next(e);
    }
  }

  router.get("/lists", sendLists);
  router.get("/company/:companyId/lists", sendLists);
  router.get("/by-company/:companyId", sendLists);
  router.get("/", sendLists);

  router.get("/:pricelistId/products", async (req, res, next) => {
    try {
      const pricelistId = toId(req.params.pricelistId);
      if (!pricelistId) return res.status(400).json({ ok: false, error: "Lista inválida." });

      const pricelist = await getPricelistOrFail(odoo, pricelistId);
      const products = await productsForPricelist(odoo, pricelist);

      res.json({ ok: true, pricelist, products });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/items/:itemId", async (req, res, next) => {
    try {
      const ref = parseRef(req.params.itemId);
      const fixedPrice = Number(req.body?.fixed_price);
      const companyId = toId(req.body?.company_id);

      if (!ref.id) return res.status(400).json({ ok: false, error: "Ítem inválido." });
      if (!Number.isFinite(fixedPrice) || fixedPrice < 0) {
        return res.status(400).json({ ok: false, error: "Precio inválido." });
      }

      const result = await updateItemRef(odoo, ref, fixedPrice, companyId);
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  router.post("/increase", async (req, res, next) => {
    try {
      const pct = Number(req.body?.percent);
      if (!Number.isFinite(pct)) {
        return res.status(400).json({ ok: false, error: "Porcentaje inválido." });
      }

      const companyId = toId(req.body?.company_id);
      const rawItemIds = asArray(req.body?.item_ids).map((v) => String(v || "").trim()).filter(Boolean);
      const pricelistIds = uniqNumbers(req.body?.pricelist_ids);

      let updated = 0;
      let details = [];

      if (rawItemIds.length) {
        const itemRefs = rawItemIds.map((id) => parseRef(id)).filter((ref) => ref.id);
        const priceListItemIds = itemRefs.filter((ref) => ref.type !== "template").map((ref) => ref.id);
        const templateRefs = itemRefs.filter((ref) => ref.type === "template");

        const itemResult = await increasePricelistItems(odoo, priceListItemIds, pct, companyId);
        updated += itemResult.updated;
        details = details.concat(itemResult.details);

        for (const ref of templateRefs) {
          const rows = await readRecords(odoo, "product.template", [ref.id], ["id", "list_price"], companyContext(companyId));
          const row = rows?.[0];
          const current = Number(row?.list_price || 0);
          if (!row || !Number.isFinite(current) || current <= 0) continue;
          const nextPrice = roundMoney(current * (1 + pct / 100));
          await updateItemRef(odoo, ref, nextPrice, companyId);
          updated += 1;
          details.push({ id: `template:${ref.id}`, previous_price: current, fixed_price: nextPrice });
        }
      } else if (pricelistIds.length) {
        for (const pricelistId of pricelistIds) {
          const pricelist = await getPricelistOrFail(odoo, pricelistId);
          const ctx = companyContext(pricelist.company_resolved_id || companyId);
          const items = await getPricelistItems(odoo, pricelistId, ctx);

          if (Array.isArray(items) && items.length) {
            const result = await increasePricelistItems(odoo, items.map((it) => Number(it.id)), pct, pricelist.company_resolved_id || companyId);
            updated += result.updated;
            details = details.concat(result.details);
          } else if (pricelist.is_default_pricelist) {
            const result = await increaseTemplatesForCompany(odoo, pricelist.company_resolved_id || companyId, pct);
            updated += result.updated;
            details = details.concat(result.details);
          }
        }
      } else {
        return res.status(400).json({ ok: false, error: "Faltan listas o productos para actualizar." });
      }

      res.json({ ok: true, updated, details });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
