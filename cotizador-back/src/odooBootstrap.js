let cache = null;
let cacheAt = 0;
const TTL_MS = Number(process.env.ODOO_BOOTSTRAP_TTL_MS || 10 * 60 * 1000);

export async function loadOdooBootstrap(odoo) {
  const now = Date.now();
  if (cache && (now - cacheAt) < TTL_MS) return cache;

  // 1) Products (básicos)
  const products = await odoo.executeKw(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true]]],
    { fields: ["id", "name", "default_code", "product_tmpl_id", "list_price"], limit: 5000, order: "name asc" }
  );

  const tmplIds = [...new Set(products.map(p => Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id).filter(Boolean))];

  // 2) Templates con tags
  let tmplRows = [];
  if (tmplIds.length) {
    tmplRows = await odoo.executeKw(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      { fields: ["id", "product_tag_ids"], limit: tmplIds.length }
    );
  }
  const tmplTags = new Map(
    tmplRows.map(t => [Number(t.id), Array.isArray(t.product_tag_ids) ? t.product_tag_ids.map(Number) : []])
  );

  const allTagIds = [...new Set(tmplRows.flatMap(t => Array.isArray(t.product_tag_ids) ? t.product_tag_ids : []).map(Number))];

  // 3) Tag names
  let tagsRows = [];
  if (allTagIds.length) {
    const domain = [[["id", "in", allTagIds]]];
    const kwargs = { fields: ["id", "name"], limit: allTagIds.length };

    try {
      tagsRows = await odoo.executeKw("product.tag", "search_read", domain, kwargs);
    } catch (e) {
      // Algunas instalaciones usan product.template.tag
      tagsRows = await odoo.executeKw("product.template.tag", "search_read", domain, kwargs);
    }
  }

  const tags = tagsRows.map(t => ({ id: t.id, name: t.name }));

  const productsOut = products.map(p => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
    const tag_ids = tmplTags.get(Number(tmplId)) || [];
    return {
      id: p.id,
      name: p.name,
      code: p.default_code || null,
      list_price: Number(p.list_price || 0),
      tag_ids,
    };
  });

  cache = { products: productsOut, tags };
  cacheAt = now;
  return cache;
}

export function clearOdooBootstrapCache() {
  cache = null;
  cacheAt = 0;
}
