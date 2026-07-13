import { loadCatalogBootstrap } from "./catalogBootstrap.js";

const SECTOR_KEYS = ["producto", "automatizacion", "servicios"];
const SECTOR_LABELS = {
  producto: "Sector Producto",
  automatizacion: "Sector Automatización",
  servicios: "Sector Servicios",
};

// Logica pura (sin I/O) que arma el resumen por sector a partir del catalogo
// ya resuelto. Separada de resolveBudgetSectorSummary para poder probarla
// con datos de prueba sin depender de Odoo.
export function computeBudgetSectorSummary({ sections, products, lines }) {
  const sectionsList = Array.isArray(sections) ? sections : [];
  const sectionsById = new Map(sectionsList.map((s) => [Number(s?.id || 0), s]));
  const hasAnySectorConfigured = sectionsList.some((s) => SECTOR_KEYS.includes(String(s?.budget_sector || "")));
  if (!hasAnySectorConfigured) return null;

  const sectionIdsByProductId = new Map(
    (Array.isArray(products) ? products : []).map((p) => [
      Number(p?.id || 0),
      Array.isArray(p?.section_ids) ? p.section_ids.map(Number) : [],
    ]),
  );

  const buckets = new Map(SECTOR_KEYS.map((key) => [key, { key, label: SECTOR_LABELS[key], items: [], total: 0 }]));
  const unassignedItems = [];
  let unassignedTotal = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    const productId = Number(line?.productId || 0);
    const sectionIds = productId ? (sectionIdsByProductId.get(productId) || []) : [];
    const productName = String(line?.name || "").trim();
    const lineTotal = Number(line?.total || 0);
    if (!productName) continue;

    if (!sectionIds.length) {
      unassignedItems.push({ sectionName: "Sin sección", productName });
      unassignedTotal += lineTotal;
      continue;
    }
    for (const sectionId of sectionIds) {
      const section = sectionsById.get(Number(sectionId));
      const sector = normalizeSector(section?.budget_sector);
      const item = { sectionName: section?.name || "Sección", productName };
      if (sector) {
        const bucket = buckets.get(sector);
        bucket.items.push(item);
        bucket.total += lineTotal;
      } else {
        unassignedItems.push(item);
        unassignedTotal += lineTotal;
      }
    }
  }

  const sectors = SECTOR_KEYS.map((key) => buckets.get(key));
  const grandTotal = sectors.reduce((acc, s) => acc + s.total, 0);
  return {
    sectors,
    grandTotal,
    unassigned: unassignedItems.length ? { items: unassignedItems, total: unassignedTotal } : null,
  };
}

// Arma, para un presupuesto puntual, el resumen de la primera hoja del PDF:
// cada linea se ubica segun la seccion de catalogo del producto (section_ids)
// y el sector asignado a esa seccion (presupuestador_sections.budget_sector).
// Si ninguna seccion del catalog_kind tiene sector asignado todavia, devuelve
// null para que el PDF no agregue esta hoja (comportamiento actual sin cambios).
export async function resolveBudgetSectorSummary({ catalogKind, lines, odoo }) {
  try {
    const catalog = await loadCatalogBootstrap(odoo, catalogKind);
    return computeBudgetSectorSummary({ sections: catalog?.sections, products: catalog?.products, lines });
  } catch (e) {
    console.error("resolveBudgetSectorSummary error:", e?.message || e);
    return null;
  }
}

function normalizeSector(value) {
  const v = String(value || "");
  return SECTOR_KEYS.includes(v) ? v : null;
}
