import express from "express";

function asId(v) {
  if (Array.isArray(v)) return Number(v[0] || 0);
  return Number(v || 0);
}

function asName(v) {
  if (Array.isArray(v)) return String(v[1] || "");
  return String(v || "");
}

function parseIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function roundMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function itemProductTemplateId(item) {
  return asId(item?.product_tmpl_id);
}

function itemProductVariantId(item) {
  return asId(item?.product_id);
}

function productVariantId(product) {
  return asId(product?.product_variant_id);
}

function pickItemForProduct(items, product) {
  const productId = Number(product?.id || 0);
  const variantId = productVariantId(product);

  const variantItem = items.find((item) => itemProductVariantId(item) === variantId);
  if (variantItem) return variantItem;

  return items.find((item) => itemProductTemplateId(item) === productId) || null;
}

async function getPricelistItems(odoo, pricelistId) {
  return odoo.executeKw(
    "product.pricelist.item",
    "search_read",
    [[[
      "pricelist_id",
      "=",
      Number(pricelistId),
    ]]],
    {
      fields: [
        "id",
        "pricelist_id",
        "product_tmpl_id",
        "product_id",
        "fixed_price",
        "compute_price",
        "applied_on",
        "min_quantity",
        "date_start",
        "date_end",
      ],
      order: "id asc",
    }
  );
}

async function getSaleProducts(odoo, { productTemplateIds = [], search = "" } = {}) {
  const domain = [
    ["active", "=", true],
    ["sale_ok", "=", true],
  ];

  const ids = parseIdList(productTemplateIds);
  if (ids.length) domain.push(["id", "in", ids]);

  const q = String(search || "").trim();
  if (q) {
    domain.push("|");
    domain.push(["name", "ilike", q]);
    domain.push(["default_code", "ilike", q]);
  }

  return odoo.executeKw(
    "product.template",
    "search_read",
    [domain],
    {
      fields: [
        "id",
        "name",
        "default_code",
        "list_price",
        "company_id",
        "product_variant_id",
        "active",
        "sale_ok",
      ],
      order: "name asc",
      limit: ids.length ? undefined : 500,
    }
  );
}

async function findProductItem(odoo, pricelistId, productTemplateId) {
  const found = await odoo.executeKw(
    "product.pricelist.item",
    "search_read",
    [[
      ["pricelist_id", "=", Number(pricelistId)],
      ["product_tmpl_id", "=", Number(productTemplateId)],
    ]],
    { fields: ["id", "fixed_price"], limit: 1 }
  );

  return Array.isArray(found) && found[0] ? found[0] : null;
}

async function upsertFixedPrice(odoo, pricelistId, productTemplateId, fixedPrice) {
  const existing = await findProductItem(odoo, pricelistId, productTemplateId);
  const vals = {
    compute_price: "fixed",
    fixed_price: roundMoney(fixedPrice),
  };

  if (existing?.id) {
    await odoo.executeKw("product.pricelist.item", "write", [[Number(existing.id)], vals]);
    return { action: "updated", item_id: Number(existing.id) };
  }

  const createdId = await odoo.executeKw("product.pricelist.item", "create", [{
    pricelist_id: Number(pricelistId),
    applied_on: "1_product",
    product_tmpl_id: Number(productTemplateId),
    ...vals,
  }]);

  return { action: "created", item_id: Number(createdId) };
}

export function buildPriceListsRouter(odoo) {
  const router = express.Router();

  router.get("/dashboard", async (_req, res, next) => {
    try {
      const [companies, pricelists] = await Promise.all([
        odoo.executeKw("res.company", "search_read", [[]], {
          fields: ["id", "name"],
          order: "name asc",
        }),
        odoo.executeKw("product.pricelist", "search_read", [[["active", "=", true]]], {
          fields: ["id", "name", "company_id", "currency_id", "active"],
          order: "name asc",
        }),
      ]);

      res.json({ ok: true, companies, pricelists });
    } catch (e) {
      next(e);
    }
  });

  router.get("/companies", async (_req, res, next) => {
    try {
      const companies = await odoo.executeKw("res.company", "search_read", [[]], {
        fields: ["id", "name"],
        order: "name asc",
      });
      res.json({ ok: true, companies });
    } catch (e) {
      next(e);
    }
  });

  router.get("/pricelists", async (req, res, next) => {
    try {
      const companyId = Number(req.query.company_id || 0);
      const domain = [["active", "=", true]];
      if (Number.isInteger(companyId) && companyId > 0) domain.push(["company_id", "=", companyId]);

      const pricelists = await odoo.executeKw("product.pricelist", "search_read", [domain], {
        fields: ["id", "name", "company_id", "currency_id", "active"],
        order: "name asc",
      });

      res.json({ ok: true, pricelists });
    } catch (e) {
      next(e);
    }
  });

  router.get("/pricelists/:pricelistId/products", async (req, res, next) => {
    try {
      const pricelistId = Number(req.params.pricelistId || 0);
      if (!Number.isInteger(pricelistId) || pricelistId <= 0) {
        return res.status(400).json({ ok: false, error: "Lista inválida." });
      }

      const [products, items] = await Promise.all([
        getSaleProducts(odoo, { search: req.query.search || "" }),
        getPricelistItems(odoo, pricelistId),
      ]);

      const rows = products.map((product) => {
        const item = pickItemForProduct(items, product);
        const itemPrice = item ? Number(item.fixed_price || 0) : null;
        const basePrice = Number(product.list_price || 0);
        return {
          id: Number(product.id),
          name: product.name || "",
          default_code: product.default_code || "",
          company_id: product.company_id || false,
          variant_id: product.product_variant_id || false,
          item_id: item?.id || null,
          item_applied_on: item?.applied_on || null,
          current_price: item ? roundMoney(itemPrice) : roundMoney(basePrice),
          base_price: roundMoney(basePrice),
          compute_price: item?.compute_price || null,
        };
      });

      res.json({ ok: true, products: rows });
    } catch (e) {
      next(e);
    }
  });

  router.patch("/pricelists/:pricelistId/products/:productTemplateId", async (req, res, next) => {
    try {
      const pricelistId = Number(req.params.pricelistId || 0);
      const productTemplateId = Number(req.params.productTemplateId || 0);
      const fixedPrice = Number(req.body?.fixed_price);

      if (!Number.isInteger(pricelistId) || pricelistId <= 0) {
        return res.status(400).json({ ok: false, error: "Lista inválida." });
      }
      if (!Number.isInteger(productTemplateId) || productTemplateId <= 0) {
        return res.status(400).json({ ok: false, error: "Producto inválido." });
      }
      if (!Number.isFinite(fixedPrice) || fixedPrice < 0) {
        return res.status(400).json({ ok: false, error: "Precio inválido." });
      }

      const result = await upsertFixedPrice(odoo, pricelistId, productTemplateId, fixedPrice);
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  router.post("/increase", async (req, res, next) => {
    try {
      const pricelistIds = parseIdList(req.body?.pricelist_ids);
      const productTemplateIds = parseIdList(req.body?.product_template_ids);
      const percent = Number(req.body?.percent);

      if (!pricelistIds.length) {
        return res.status(400).json({ ok: false, error: "Falta seleccionar lista/s." });
      }
      if (!Number.isFinite(percent)) {
        return res.status(400).json({ ok: false, error: "Porcentaje inválido." });
      }

      const products = await getSaleProducts(odoo, { productTemplateIds });
      let updated = 0;
      let created = 0;
      let skipped = 0;

      for (const pricelistId of pricelistIds) {
        const items = await getPricelistItems(odoo, pricelistId);
        for (const product of products) {
          const item = pickItemForProduct(items, product);
          const current = item ? Number(item.fixed_price || 0) : Number(product.list_price || 0);
          if (!Number.isFinite(current) || current < 0) {
            skipped += 1;
            continue;
          }

          const nextPrice = roundMoney(current * (1 + percent / 100));
          const result = await upsertFixedPrice(odoo, pricelistId, Number(product.id), nextPrice);
          if (result.action === "created") created += 1;
          else updated += 1;
        }
      }

      res.json({ ok: true, updated, created, skipped });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
