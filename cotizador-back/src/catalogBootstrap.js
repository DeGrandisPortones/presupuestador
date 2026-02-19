import { loadOdooBootstrap } from "./odooBootstrap.js";
import {
  ensureCatalogTables,
  listSections,
  listTagSections,
  listProductAliases,
} from "./catalogDb.js";

/**
 * Devuelve un "bootstrap" enriquecido:
 * - productos con tag_ids (desde Odoo)
 * - secciones (DB)
 * - mapeo tag->seccion (DB)
 * - alias por producto (DB) => display_name
 * - section_ids calculadas por producto (puede estar en varias)
 */
export async function loadCatalogBootstrap(odoo, { productsLimit } = {}) {
  await ensureCatalogTables();
  const base = await loadOdooBootstrap(odoo, { productsLimit });

  const [sections, tagSectionsRows, aliasRows] = await Promise.all([
    listSections(),
    listTagSections(),
    listProductAliases(),
  ]);

  const tagToSection = new Map((tagSectionsRows || []).map((r) => [Number(r.tag_id), Number(r.section_id)]));
  const aliasByProduct = new Map((aliasRows || []).map((r) => [Number(r.product_id), String(r.alias)]));

  const products = (base.products || []).map((p) => {
    const tag_ids = Array.isArray(p.tag_ids) ? p.tag_ids.map((x) => Number(x)) : [];
    const section_ids = [...new Set(tag_ids.map((tid) => tagToSection.get(tid)).filter(Boolean))].map((x) => Number(x));
    const alias = aliasByProduct.get(Number(p.id)) || null;
    return {
      ...p,
      display_name: alias || p.name,
      alias,
      section_ids,
    };
  });

  // Tags enriquecidos (con section_id)
  const tags = (base.tags || []).map((t) => ({
    id: Number(t.id),
    name: t.name,
    section_id: tagToSection.get(Number(t.id)) || null,
  }));

  return {
    ...base,
    products,
    sections: sections || [],
    tags,
    tag_sections: (tagSectionsRows || []).map((r) => ({ tag_id: Number(r.tag_id), section_id: Number(r.section_id) })),
  };
}
