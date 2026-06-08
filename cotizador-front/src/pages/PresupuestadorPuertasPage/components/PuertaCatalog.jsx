import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCatalogBootstrap, refreshCatalogBootstrap } from "../../../api/catalog.js";
import { getPrices } from "../../../api/odoo.js";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { useAuthStore } from "../../../domain/auth/store.js";
import Button from "../../../ui/Button.jsx";

function getClientFacingProductName(product) {
  return product?.client_display_name || product?.raw_name || product?.original_name || product?.name || "";
}
function getProductLabel(product) {
  return product?.display_name || product?.alias || product?.internal_alias || getClientFacingProductName(product);
}
function getVisibleOdooId(product) {
  return Number(product?.odoo_id || product?.odoo_template_id || product?.id || 0) || 0;
}
function isDisabledForUser(product, user) {
  if (!product || !user) return false;
  if (user?.is_vendedor && product.disable_for_vendedor) return true;
  if (user?.is_distribuidor && product.disable_for_distribuidor) return true;
  return false;
}

function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
function resolveProductPricingId(product = {}) {
  return toPositiveInt(
    product?.odoo_variant_id ||
    product?.odoo_external_id ||
    product?.odoo_product_id ||
    product?.odoo_id ||
    product?.odoo_template_id ||
    product?.product_id ||
    product?.id
  );
}
async function buildPricedDoorCatalog(data, { pricelistId, partnerId }) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const pl = toPositiveInt(pricelistId);
  const partner = toPositiveInt(partnerId) || null;
  if (!pl || !products.length) return { ...(data || {}), products: [] };

  const lines = products
    .map((product) => {
      const productId = resolveProductPricingId(product);
      const sourceProductId = toPositiveInt(product?.id);
      if (!productId || !sourceProductId) return null;
      return {
        product_id: productId,
        source_product_id: sourceProductId,
        odoo_template_id: toPositiveInt(product?.odoo_template_id) || null,
        qty: 1,
      };
    })
    .filter(Boolean);

  if (!lines.length) return { ...(data || {}), products: [] };

  const pricesBySourceId = new Map();
  const chunkSize = 80;
  for (let index = 0; index < lines.length; index += chunkSize) {
    const chunk = lines.slice(index, index + chunkSize);
    const response = await getPrices({ pricelist_id: pl, partner_id: partner, lines: chunk });
    if (Number(response?.pricelist_id || 0) !== Number(pl || 0)) {
      throw new Error("Odoo devolvió precios de otra lista. Reintentá actualizar el catálogo.");
    }
    for (const item of Array.isArray(response?.prices) ? response.prices : []) {
      const sourceId = toPositiveInt(item?.product_id);
      if (sourceId) pricesBySourceId.set(sourceId, item);
    }
  }

  const pricedProducts = products.map((product) => {
    const sourceId = toPositiveInt(product?.id);
    const priceInfo = pricesBySourceId.get(sourceId);
    if (!priceInfo) return { ...product, price: 0, basePrice: 0, base_price: 0 };
    const price = Number(priceInfo.price ?? 0);
    const safePrice = Number.isFinite(price) ? price : 0;
    return {
      ...product,
      price: safePrice,
      basePrice: safePrice,
      base_price: safePrice,
      code: priceInfo.code ?? product?.code ?? null,
      odoo_template_id: toPositiveInt(priceInfo.odoo_template_id || product?.odoo_template_id) || product?.odoo_template_id || null,
    };
  });

  return { ...(data || {}), products: pricedProducts, pricing_context: { pricelist_id: pl, partner_id: partner } };
}

export default function PuertaCatalog() {
  const user = useAuthStore((s) => s.user);
  const addLine = useQuoteStore((s) => s.addLine);
  const forceRemoveLine = useQuoteStore((s) => s.forceRemoveLine);
  const lines = useQuoteStore((s) => s.lines);
  const pricelistId = useQuoteStore((s) => s.pricelistId);
  const partnerId = useQuoteStore((s) => s.partnerId);
  const [openSectionId, setOpenSectionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pricedBoot, setPricedBoot] = useState(null);
  const [pricingError, setPricingError] = useState("");

  const q = useQuery({ queryKey: ["catalog-bootstrap", "puerta"], queryFn: () => getCatalogBootstrap("puerta"), staleTime: 60 * 1000 });
  const rawBoot = q.data || null;
  const boot = pricedBoot || null;
  const sections = useMemo(() => [...(boot?.sections || [])].sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || "").localeCompare(String(b.name || ""), "es")), [boot]);
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const productsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(Number(section.id), []);
    for (const product of products) {
      const sectionIds = Array.isArray(product.section_ids) ? product.section_ids : [];
      for (const rawSectionId of sectionIds) {
        const sectionId = Number(rawSectionId);
        if (map.has(sectionId)) map.get(sectionId).push(product);
      }
    }
    return map;
  }, [products, sections]);

  const selectedProductIdsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sections) map.set(Number(section.id), new Set());
    for (const [sectionId, sectionProducts] of productsBySection.entries()) {
      const ids = new Set(sectionProducts.map((product) => Number(product.id)));
      for (const line of lines || []) {
        const productId = Number(line?.product_id);
        if (ids.has(productId)) map.get(sectionId)?.add(productId);
      }
    }
    return map;
  }, [lines, productsBySection, sections]);

  useEffect(() => {
    setPricedBoot(null);
    setPricingError("");
    if (!rawBoot || !toPositiveInt(pricelistId)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const priced = await buildPricedDoorCatalog(rawBoot, { pricelistId, partnerId });
        if (!cancelled) setPricedBoot(priced);
      } catch (e) {
        if (!cancelled) setPricingError(e?.message || "No se pudieron calcular los precios de la lista.");
      }
    })();
    return () => { cancelled = true; };
  }, [rawBoot, pricelistId, partnerId]);

  useEffect(() => {
    if (!sections.length) return;
    if (openSectionId && sections.some((s) => Number(s.id) === Number(openSectionId))) return;
    setOpenSectionId(Number(sections[0].id));
  }, [sections, openSectionId]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCatalogBootstrap("puerta");
      const result = await q.refetch();
      const nextRaw = result?.data || null;
      if (nextRaw && toPositiveInt(pricelistId)) {
        const priced = await buildPricedDoorCatalog(nextRaw, { pricelistId, partnerId });
        setPricedBoot(priced);
      }
    }
    finally { setRefreshing(false); }
  }, [q, pricelistId, partnerId]);

  function selectProductForSection(section, product) {
    const sectionId = Number(section.id);
    const targetProductId = Number(product?.id);
    const sectionProductIds = new Set((productsBySection.get(sectionId) || []).map((p) => Number(p.id)));
    const currentSelected = selectedProductIdsBySection.get(sectionId) || new Set();
    if (currentSelected.has(targetProductId) && currentSelected.size === 1) return;
    for (const productId of sectionProductIds) forceRemoveLine(productId);
    addLine({ ...product, name: getProductLabel(product), raw_name: getClientFacingProductName(product) });
    const idx = sections.findIndex((s) => Number(s.id) === sectionId);
    const next = sections[idx + 1];
    if (next) setOpenSectionId(Number(next.id));
  }

  if (q.isLoading) return <div className="muted">Cargando catálogo de puertas...</div>;
  if (q.isError) return <div style={{ color: "#d93025" }}>{q.error.message}</div>;
  if (pricingError) return <div style={{ color: "#d93025" }}>{pricingError}</div>;
  if (!boot) return <div className="muted">Calculando precios de la lista asignada antes de mostrar el catálogo...</div>;

  return (
    <div>
      <div className="dg-row dg-row--between dg-row--center">
        <h3 className="dg-h3">Características de la puerta</h3>
        <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>{refreshing ? "Actualizando..." : "Actualizar catálogo"}</Button>
      </div>

      {!sections.length ? (
        <>
          <div className="spacer" />
          <div className="muted">No hay secciones habilitadas todavía. Configurá secciones y etiquetas para el catálogo Puerta desde el dashboard.</div>
        </>
      ) : (
        <div className="dg-accordion">
          {sections.map((section) => {
            const sectionId = Number(section.id);
            const isOpen = openSectionId === sectionId;
            const sectionProducts = productsBySection.get(sectionId) || [];
            const selectedInSection = selectedProductIdsBySection.get(sectionId) || new Set();
            return (
              <div key={sectionId} className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}>
                <button type="button" className="dg-acc-header" onClick={() => setOpenSectionId(isOpen ? null : sectionId)}>
                  <div className="dg-acc-title">{section.name}</div>
                  <div className="dg-acc-meta">{selectedInSection.size ? `${selectedInSection.size} seleccionado` : "Sin selección"} · {sectionProducts.length}</div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>

                {isOpen ? (
                  <div className="dg-acc-body">
                    <div className="dg-product-list">
                      {sectionProducts.map((product) => {
                        const disabledForUser = isDisabledForUser(product, user);
                        const isSelected = selectedInSection.has(Number(product.id));
                        return (
                          <div key={product.id} className="dg-product-card" style={disabledForUser ? { opacity: 0.55, background: "#f3f4f6" } : isSelected ? { border: "1px solid #60a5fa", background: "#eff6ff" } : undefined}>
                            <div className="dg-product-info">
                              <div className="dg-product-name">{getProductLabel(product)}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                ID Presupuestador: {product.id} · ID Odoo: {getVisibleOdooId(product) || product.id}{product.code ? ` · ${product.code}` : ""}{disabledForUser ? " · No habilitado para tu rol" : ""}
                              </div>
                            </div>
                            <Button variant={isSelected ? "primary" : "secondary"} disabled={disabledForUser} onClick={() => selectProductForSection(section, product)}>
                              {isSelected ? "Elegido" : "Elegir"}
                            </Button>
                          </div>
                        );
                      })}
                      {!sectionProducts.length ? <div className="muted">Sin productos para mostrar en esta sección</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
