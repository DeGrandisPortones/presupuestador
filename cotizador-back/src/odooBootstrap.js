let cache = null;
let cacheAt = 0;
const TTL_MS = Number(process.env.ODOO_BOOTSTRAP_TTL_MS || 60 * 1000);

function cleanText(value) {
  return String(value || "").trim();
}

export async function loadOdooBootstrap(odoo) {
  const now = Date.now();
  if (cache && (now - cacheAt) < TTL_MS) return cache;

  const products = await odoo.executeKw(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true]]],
    { fields: ["id", "name", "default_code", "product_tmpl_id", "list_price"], limit: 5000, order: "name asc" }
  );

  const tmplIds = [...new Set(products.map(p => Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id).filter(Boolean))];

  let tmplRows = [];
  if (tmplIds.length) {
    tmplRows = await odoo.executeKw(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      { fields: ["id", "name", "product_tag_ids"], limit: tmplIds.length }
    );
  }

  const tmplTags = new Map(
    tmplRows.map(t => [Number(t.id), Array.isArray(t.product_tag_ids) ? t.product_tag_ids.map(Number) : []])
  );
  const tmplNames = new Map(
    tmplRows.map(t => [Number(t.id), cleanText(t.name)])
  );

  const allTagIds = [...new Set(tmplRows.flatMap(t => Array.isArray(t.product_tag_ids) ? t.product_tag_ids : []).map(Number))];

  let tagsRows = [];
  if (allTagIds.length) {
    const domain = [[["id", "in", allTagIds]]];
    const kwargs = { fields: ["id", "name"], limit: allTagIds.length };

    try {
      tagsRows = await odoo.executeKw("product.tag", "search_read", domain, kwargs);
    } catch (e) {
      tagsRows = await odoo.executeKw("product.template.tag", "search_read", domain, kwargs);
    }
  }

  const tags = tagsRows.map(t => ({ id: t.id, name: t.name }));

  const productsOut = products.map(p => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
    const tag_ids = tmplTags.get(Number(tmplId)) || [];
    const variantName = cleanText(p.name);
    const templateName = cleanText(tmplNames.get(Number(tmplId)));
    const resolvedName = templateName || variantName;

    return {
      id: p.id,
      name: resolvedName,
      raw_name: resolvedName,
      original_name: resolvedName,
      template_name: templateName || null,
      variant_name: variantName || null,
      code: p.default_code || null,
      list_price: Number(p.list_price || 0),
      tag_ids,
      odoo_id: Number(tmplId || p.id) || Number(p.id),
      odoo_template_id: Number(tmplId || p.id) || Number(p.id),
      odoo_variant_id: Number(p.id) || 0,
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
