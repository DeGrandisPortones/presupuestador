import express from "express";

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

async function searchRead(odoo, model, domain, fields, extra = {}) {
  return odoo.executeKw(model, "search_read", [domain], {
    fields,
    ...extra,
  });
}

async function readRecords(odoo, model, ids, fields) {
  const cleanIds = uniqNumbers(ids);
  if (!cleanIds.length) return [];
  return odoo.executeKw(model, "read", [cleanIds], { fields, context: { active_test: false } });
}

function normalizeCompanyFromM2o(company) {
  const id = m2oId(company);
  if (!id) return null;
  return { id, name: m2oName(company) || `Empresa #${id}` };
}

function buildPricelistCompanyDomain(companyId) {
  if (!companyId) return [];
  return ["|", ["company_id", "=", companyId], ["company_id", "=", false]];
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
  };
}

async function listPricelistsForCompany(odoo, companyId) {
  const fields = ["id", "name", "display_name", "company_id", "currency_id", "active"];
  const options = { order: "name asc", context: { active_test: false } };

  // Primero intentamos respetar la empresa asignada en Odoo.
  let pricelists = await searchRead(
    odoo,
    "product.pricelist",
    buildPricelistCompanyDomain(companyId),
    fields,
    options
  );

  // En varias bases las listas no tienen company_id explícito. Si no aparece nada
  // para la empresa elegida, devolvemos todas para que se puedan consultar/editar.
  if (companyId && (!Array.isArray(pricelists) || pricelists.length === 0)) {
    pricelists = await searchRead(odoo, "product.pricelist", [], fields, options);
  }

  return (pricelists || [])
    .map((pl) => normalizePricelist(pl, companyId))
    .filter((pl) => pl.id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
}

async function getPricelistOrFail(odoo, id) {
  const rows = await searchRead(
    odoo,
    "product.pricelist",
    [["id", "=", Number(id)]],
    ["id", "name", "display_name", "company_id", "currency_id", "active"],
    { limit: 1, context: { active_test: false } }
  );
  const row = rows?.[0];
  if (!row) {
    const err = new Error("Lista de precios no encontrada.");
    err.status = 404;
    throw err;
  }
  return normalizePricelist(row);
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
          { order: "name asc", context: { active_test: false } }
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
        { order: "name asc", context: { active_test: false } }
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

  async function sendLists(req, res, next) {
    try {
      const companyId = toId(req.query.company_id || req.params.companyId);
      const pricelists = await listPricelistsForCompany(odoo, companyId);
      res.json({ ok: true, company_id: companyId, pricelists });
    } catch (e) {
      next(e);
    }
  }

  // Alias explícitos. La pantalla v3 usa /lists para evitar problemas con la ruta raíz.
  router.get("/lists", sendLists);
  router.get("/company/:companyId/lists", sendLists);
  router.get("/by-company/:companyId", sendLists);
  router.get("/", sendLists);

  router.get("/:pricelistId/products", async (req, res, next) => {
    try {
      const pricelistId = toId(req.params.pricelistId);
      if (!pricelistId) return res.status(400).json({ ok: false, error: "Lista inválida." });

      const pricelist = await getPricelistOrFail(odoo, pricelistId);

      const items = await searchRead(
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
        { order: "applied_on asc, id asc", limit: 5000, context: { active_test: false } }
      );

      const productVariantIds = items.map((it) => m2oId(it.product_id)).filter(Boolean);
      const variants = await readRecords(odoo, "product.product", productVariantIds, ["id", "display_name", "default_code", "product_tmpl_id"]);
      const variantById = new Map(variants.map((v) => [Number(v.id), v]));

      const tmplIds = [
        ...items.map((it) => m2oId(it.product_tmpl_id)).filter(Boolean),
        ...variants.map((v) => m2oId(v.product_tmpl_id)).filter(Boolean),
      ];
      const templates = await readRecords(odoo, "product.template", tmplIds, ["id", "name", "display_name", "default_code", "list_price"]);
      const tmplById = new Map(templates.map((t) => [Number(t.id), t]));

      const products = items.map((it) => {
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
          id: Number(it.id),
          item_id: Number(it.id),
          pricelist_id: pricelistId,
          pricelist_name: pricelist.name,
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
        };
      });

      res.json({ ok: true, pricelist, products });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/items/:itemId", async (req, res, next) => {
    try {
      const itemId = toId(req.params.itemId);
      const fixedPrice = Number(req.body?.fixed_price);

      if (!itemId) return res.status(400).json({ ok: false, error: "Ítem inválido." });
      if (!Number.isFinite(fixedPrice) || fixedPrice < 0) {
        return res.status(400).json({ ok: false, error: "Precio inválido." });
      }

      await odoo.executeKw("product.pricelist.item", "write", [
        [itemId],
        { compute_price: "fixed", fixed_price: roundMoney(fixedPrice) },
      ]);

      res.json({ ok: true, item_id: itemId, fixed_price: roundMoney(fixedPrice) });
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

      const itemIds = uniqNumbers(req.body?.item_ids);
      const pricelistIds = uniqNumbers(req.body?.pricelist_ids);

      let domain = [];
      if (itemIds.length) {
        domain = [["id", "in", itemIds]];
      } else if (pricelistIds.length) {
        domain = [["pricelist_id", "in", pricelistIds]];
      } else {
        return res.status(400).json({ ok: false, error: "Faltan listas o productos para actualizar." });
      }

      const items = await searchRead(
        odoo,
        "product.pricelist.item",
        domain,
        ["id", "fixed_price", "compute_price", "pricelist_id", "product_tmpl_id", "product_id"],
        { limit: 10000, context: { active_test: false } }
      );

      let updated = 0;
      const details = [];

      for (const item of items || []) {
        const current = Number(item.fixed_price || 0);
        if (!Number.isFinite(current) || current <= 0) continue;

        const nextPrice = roundMoney(current * (1 + pct / 100));
        await odoo.executeKw("product.pricelist.item", "write", [
          [Number(item.id)],
          { compute_price: "fixed", fixed_price: nextPrice },
        ]);

        updated += 1;
        details.push({ id: Number(item.id), previous_price: current, fixed_price: nextPrice });
      }

      res.json({ ok: true, updated, details });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
