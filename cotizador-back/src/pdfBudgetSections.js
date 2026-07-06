import { listBudgetSections } from "./catalogDb.js";
import { loadCatalogBootstrap } from "./catalogBootstrap.js";

function squeezeText(value) {
  return String(value || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Arma, para un presupuesto puntual, hasta 3 filas "combinadas" reemplazando los
// tokens $id<sectionId> de cada plantilla por el nombre del producto elegido en esa
// sección de catálogo (presupuestador_sections.id). Si un catalog_kind todavía no
// tiene plantillas configuradas, devuelve null para que el PDF siga listando las
// líneas sueltas como hasta ahora.
export async function resolveBudgetSectionRows({ catalogKind, lines, odoo }) {
  try {
    const templates = (await listBudgetSections(catalogKind)).filter((t) => String(t?.template || "").trim());
    if (!templates.length) return null;

    const catalog = await loadCatalogBootstrap(odoo, catalogKind);
    const sectionIdsByProductId = new Map(
      (Array.isArray(catalog?.products) ? catalog.products : []).map((p) => [
        Number(p?.id || 0),
        Array.isArray(p?.section_ids) ? p.section_ids.map(Number) : [],
      ]),
    );

    const sectionAgg = new Map(); // sectionId -> { texts: string[], totalNet: number, total: number, lineIdx: Set<number> }
    (Array.isArray(lines) ? lines : []).forEach((line, idx) => {
      const productId = Number(line?.productId || 0);
      if (!productId) return;
      const sectionIds = sectionIdsByProductId.get(productId) || [];
      for (const sectionId of sectionIds) {
        if (!sectionAgg.has(sectionId)) sectionAgg.set(sectionId, { texts: [], totalNet: 0, total: 0, lineIdx: new Set() });
        const agg = sectionAgg.get(sectionId);
        if (agg.lineIdx.has(idx)) continue;
        agg.lineIdx.add(idx);
        const name = String(line?.name || "").trim();
        if (name) agg.texts.push(name);
        agg.totalNet += Number(line?.totalNet || 0);
        agg.total += Number(line?.total || 0);
      }
    });

    const groupedRows = [];
    const consumedLineIdx = new Set();

    for (const tpl of templates) {
      const referencedSectionIds = new Set();
      const resolvedText = squeezeText(
        String(tpl?.template || "").replace(/\$id(\d+)/g, (_match, idStr) => {
          const sectionId = Number(idStr);
          referencedSectionIds.add(sectionId);
          const agg = sectionAgg.get(sectionId);
          return agg && agg.texts.length ? agg.texts.join(", ") : "";
        }),
      );
      if (!resolvedText) continue;

      let rowTotalNet = 0;
      let rowTotal = 0;
      for (const sectionId of referencedSectionIds) {
        const agg = sectionAgg.get(sectionId);
        if (!agg) continue;
        rowTotalNet += agg.totalNet;
        rowTotal += agg.total;
        for (const idx of agg.lineIdx) consumedLineIdx.add(idx);
      }

      groupedRows.push({
        isGrouped: true,
        title: String(tpl?.name || "").trim(),
        name: resolvedText,
        qty: 1,
        unit: rowTotal,
        total: rowTotal,
        totalNet: rowTotalNet,
      });
    }

    if (!groupedRows.length) return null;

    const leftoverLines = (Array.isArray(lines) ? lines : []).filter((_line, idx) => !consumedLineIdx.has(idx));
    return { groupedRows, leftoverLines };
  } catch (e) {
    console.error("resolveBudgetSectionRows error:", e?.message || e);
    return null;
  }
}
