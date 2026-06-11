import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCatalogBootstrap, refreshCatalogBootstrap } from "../../../api/catalog.js";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import { useQuoteStore } from "../../../domain/quote/store.js";
import { useAuthStore } from "../../../domain/auth/store.js";
import Button from "../../../ui/Button.jsx";

const DOOR_SECTION_GREEN_IDS = new Set([84, 86, 88, 89, 90, 92, 94]);
const DOOR_SECTION_BLUE_IDS = new Set([96, 97, 98, 99, 100, 101, 102]);

function getDoorSectionTone(sectionId) {
  const id = Number(sectionId || 0);
  if (DOOR_SECTION_GREEN_IDS.has(id)) {
    return {
      background: "#ecfdf3",
      borderColor: "#bbf7d0",
      boxShadow: "inset 4px 0 0 #22c55e",
    };
  }
  if (DOOR_SECTION_BLUE_IDS.has(id)) {
    return {
      background: "#eff6ff",
      borderColor: "#bfdbfe",
      boxShadow: "inset 4px 0 0 #38bdf8",
    };
  }
  return undefined;
}

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
function normalizeIdList(values) {
  if (Array.isArray(values)) return values.map((value) => toPositiveInt(value)).filter(Boolean);
  return String(values || "")
    .split(/[;,\s]+/)
    .map((value) => toPositiveInt(value))
    .filter(Boolean);
}
function matchProductIds(selectedIds, requiredIds, matchMode = "any") {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const required = normalizeIdList(requiredIds);

  // Compatibilidad con la opción del dashboard "cualquier producto de la sección".
  // Si la regla llega sin IDs específicos, una selección cualquiera en la sección padre alcanza.
  if (!required.length) return selected.size > 0;

  if (String(matchMode || "any").trim().toLowerCase() === "all") {
    return required.every((id) => selected.has(id));
  }
  return required.some((id) => selected.has(id));
}
function buildDoorSectionMap(sections = []) {
  const map = new Map();
  for (const section of Array.isArray(sections) ? sections : []) {
    const sectionId = toPositiveInt(section?.id);
    if (sectionId) map.set(sectionId, section);
  }
  return map;
}
function computeVisibleDoorSectionIds({ sections, initialSectionId, dependencyRules, selectedProductIdsBySection }) {
  const sectionList = Array.isArray(sections) ? sections : [];
  const sectionMap = buildDoorSectionMap(sectionList);
  const activeDependencyRules = (Array.isArray(dependencyRules) ? dependencyRules : [])
    .filter((rule) => rule?.active !== false);

  if (!sectionList.length) return [];

  // Sin reglas configuradas, mantenemos el comportamiento histórico: todas las secciones.
  if (!initialSectionId && !activeDependencyRules.length) {
    return sectionList.map((section) => toPositiveInt(section?.id)).filter(Boolean);
  }

  const startId = sectionMap.has(toPositiveInt(initialSectionId)) ? toPositiveInt(initialSectionId) : null;
  if (!startId) return [];

  const ordered = [startId];
  const seen = new Set(ordered);
  let changed = true;
  let guard = 0;

  while (changed && guard < 50) {
    changed = false;
    guard += 1;

    for (const currentSectionId of [...ordered]) {
      const selectedInParent = selectedProductIdsBySection.get(toPositiveInt(currentSectionId)) || new Set();

      for (const rule of activeDependencyRules) {
        const parentSectionId = toPositiveInt(rule?.parent_section_id);
        if (parentSectionId !== toPositiveInt(currentSectionId)) continue;

        const matches = matchProductIds(
          selectedInParent,
          rule?.required_product_ids,
          rule?.match_mode || "any",
        );
        if (!matches) continue;

        for (const childSectionId of normalizeIdList(rule?.child_section_ids)) {
          if (!sectionMap.has(childSectionId) || seen.has(childSectionId)) continue;
          ordered.push(childSectionId);
          seen.add(childSectionId);
          changed = true;
        }
      }
    }
  }

  return ordered;
}
function cloneSelectionMap(sections, selectedProductIdsBySection) {
  const map = new Map();
  for (const section of Array.isArray(sections) ? sections : []) {
    const sectionId = toPositiveInt(section?.id);
    if (sectionId) map.set(sectionId, new Set(selectedProductIdsBySection.get(sectionId) || []));
  }
  return map;
}
function debugCatalogEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search || "").get("debugCatalog") === "1";
  } catch {
    return false;
  }
}
function prepareDoorCatalogForPricelistContext(data, { pricelistId, partnerId }) {
  const pl = toPositiveInt(pricelistId);
  const partner = toPositiveInt(partnerId) || null;
  const products = Array.isArray(data?.products) ? data.products : [];

  // No precalculamos todos los precios de Puertas porque eso puede superar el
  // timeout. El catálogo se muestra sólo cuando ya hay lista efectiva, pero cada
  // producto elegido pide su precio puntual con esa lista.
  const safeProducts = products.map((product) => ({
    ...product,
    price: 0,
    basePrice: 0,
    base_price: 0,
    list_price: 0,
    listPrice: 0,
    price_predeterminado: 0,
    price_list: 0,
    price_pending: true,
    price_unresolved: true,
    price_pricelist_id: pl || null,
    price_partner_id: partner,
  }));

  return {
    ...(data || {}),
    products: safeProducts,
    pricing_context: { pricelist_id: pl || null, partner_id: partner, mode: "selected-lines" },
  };
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
  const sectionRefs = useRef(new Map());
  const pendingAutoScrollSectionIdRef = useRef(null);
  const autoScrollTimeoutRef = useRef(null);

  const q = useQuery({ queryKey: ["catalog-bootstrap", "puerta"], queryFn: () => getCatalogBootstrap("puerta"), staleTime: 60 * 1000 });
  const rulesQ = useQuery({ queryKey: ["technical-rules-for-door-catalog", "puerta"], queryFn: () => adminGetTechnicalMeasurementRules("puerta"), staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  const rawBoot = q.data || null;
  const boot = pricedBoot || null;
  const sections = useMemo(() => [...(boot?.sections || [])].sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || "").localeCompare(String(b.name || ""), "es")), [boot]);
  const products = Array.isArray(boot?.products) ? boot.products : [];
  const initialSectionId = toPositiveInt(rulesQ.data?.initial_section_id);
  const dependencyRules = useMemo(() => {
    const raw = Array.isArray(rulesQ.data?.section_dependency_rules) ? rulesQ.data.section_dependency_rules : [];
    return raw
      .filter((rule) => rule?.active !== false)
      .slice()
      .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0) || String(a?.name || "").localeCompare(String(b?.name || ""), "es"));
  }, [rulesQ.data]);

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

  const orderedVisibleSectionIds = useMemo(() => {
    return computeVisibleDoorSectionIds({
      sections,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection,
    });
  }, [sections, initialSectionId, dependencyRules, selectedProductIdsBySection]);

  const visibleSections = useMemo(() => {
    const sectionMap = buildDoorSectionMap(sections);
    return orderedVisibleSectionIds.map((sectionId) => sectionMap.get(toPositiveInt(sectionId))).filter(Boolean);
  }, [sections, orderedVisibleSectionIds]);

  const scrollToSection = useCallback((sectionId) => {
    const id = Number(sectionId || 0);
    if (!id || typeof window === "undefined") return;

    const run = () => {
      const target = sectionRefs.current.get(id);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const top = Math.max(0, window.scrollY + rect.top - 96);
      window.scrollTo({ top, behavior: "smooth" });
    };

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
      return;
    }
    run();
  }, []);

  const openSectionAndScroll = useCallback((sectionId) => {
    const id = Number(sectionId || 0);
    if (!id) return;
    pendingAutoScrollSectionIdRef.current = id;
    setOpenSectionId(id);
  }, []);

  useEffect(() => {
    const pendingId = Number(pendingAutoScrollSectionIdRef.current || 0);
    if (!pendingId || Number(openSectionId || 0) !== pendingId) return undefined;

    if (autoScrollTimeoutRef.current) {
      window.clearTimeout(autoScrollTimeoutRef.current);
    }

    autoScrollTimeoutRef.current = window.setTimeout(() => {
      scrollToSection(pendingId);
      pendingAutoScrollSectionIdRef.current = null;
      autoScrollTimeoutRef.current = null;
    }, 90);

    return () => {
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
  }, [openSectionId, scrollToSection]);

  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
  }, []);

  const debugPayload = useMemo(() => ({
    component: "PuertaCatalog",
    catalogKind: "puerta",
    initialSectionId,
    dependencyRules,
    allSections: sections.map((section) => ({ id: Number(section.id), name: section.name })),
    orderedVisibleSectionIds,
    visibleSections: visibleSections.map((section) => ({ id: Number(section.id), name: section.name })),
    selectedProductIdsBySection: Array.from(selectedProductIdsBySection.entries()).map(([sectionId, ids]) => ({ sectionId, productIds: Array.from(ids || []) })),
    rulesLoading: rulesQ.isLoading,
    rulesError: rulesQ.error?.message || "",
  }), [initialSectionId, dependencyRules, sections, orderedVisibleSectionIds, visibleSections, selectedProductIdsBySection, rulesQ.isLoading, rulesQ.error]);

  useEffect(() => {
    setPricingError("");
    if (!rawBoot || !toPositiveInt(pricelistId)) {
      setPricedBoot(null);
      return undefined;
    }
    setPricedBoot(prepareDoorCatalogForPricelistContext(rawBoot, { pricelistId, partnerId }));
    return undefined;
  }, [rawBoot, pricelistId, partnerId]);

  useEffect(() => {
    if (!visibleSections.length) return;
    if (openSectionId && visibleSections.some((s) => Number(s.id) === Number(openSectionId))) return;
    setOpenSectionId(Number(visibleSections[0].id));
  }, [visibleSections, openSectionId]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCatalogBootstrap("puerta");
      const [catalogResult] = await Promise.all([q.refetch(), rulesQ.refetch()]);
      const nextRaw = catalogResult?.data || null;
      if (nextRaw && toPositiveInt(pricelistId)) {
        setPricedBoot(prepareDoorCatalogForPricelistContext(nextRaw, { pricelistId, partnerId }));
      }
    }
    finally { setRefreshing(false); }
  }, [q, rulesQ, pricelistId, partnerId]);

  function selectProductForSection(section, product) {
    const sectionId = Number(section.id);
    const targetProductId = Number(product?.id);
    const sectionProductIds = new Set((productsBySection.get(sectionId) || []).map((p) => Number(p.id)));
    const currentSelected = selectedProductIdsBySection.get(sectionId) || new Set();
    if (currentSelected.has(targetProductId) && currentSelected.size === 1) {
      const currentIndex = orderedVisibleSectionIds.findIndex((id) => Number(id) === sectionId);
      const nextSectionId = currentIndex >= 0 ? orderedVisibleSectionIds[currentIndex + 1] : null;
      if (nextSectionId) openSectionAndScroll(nextSectionId);
      return;
    }

    const currentIndex = orderedVisibleSectionIds.findIndex((id) => Number(id) === sectionId);
    const downstreamSectionIds = currentIndex >= 0 ? orderedVisibleSectionIds.slice(currentIndex + 1) : [];

    for (const productId of sectionProductIds) forceRemoveLine(productId);

    const nextSelectionMap = cloneSelectionMap(sections, selectedProductIdsBySection);
    nextSelectionMap.set(sectionId, new Set([targetProductId]));

    for (const downstreamSectionId of downstreamSectionIds) {
      const downstreamProducts = productsBySection.get(Number(downstreamSectionId)) || [];
      for (const downstreamProduct of downstreamProducts) forceRemoveLine(Number(downstreamProduct.id));
      nextSelectionMap.set(Number(downstreamSectionId), new Set());
    }

    addLine({ ...product, name: getProductLabel(product), raw_name: getClientFacingProductName(product) });

    const nextOrderedIds = computeVisibleDoorSectionIds({
      sections,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection: nextSelectionMap,
    });
    const nextIndex = nextOrderedIds.findIndex((id) => Number(id) === sectionId);
    const nextSectionId = nextIndex >= 0 ? nextOrderedIds[nextIndex + 1] : null;
    if (nextSectionId) openSectionAndScroll(nextSectionId);
  }

  if (q.isLoading) return <div className="muted">Cargando catálogo de puertas...</div>;
  if (q.isError) return <div style={{ color: "#d93025" }}>{q.error.message}</div>;
  if (rulesQ.isError) return <div style={{ color: "#d93025" }}>{rulesQ.error.message}</div>;
  if (pricingError) return <div style={{ color: "#d93025" }}>{pricingError}</div>;
  if (!boot) return <div className="muted">Esperando lista de precios del usuario antes de mostrar el catálogo...</div>;
  if (rulesQ.isLoading) return <div className="muted">Cargando dependencias del catálogo de puertas...</div>;

  return (
    <div>
      {debugCatalogEnabled() ? (
        <div style={{ position: "sticky", top: 0, zIndex: 20, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>DEBUG CATÁLOGO PUERTAS ACTIVO</div>
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(JSON.stringify(debugPayload, null, 2))}>Copiar debug</Button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto", marginTop: 8 }}>{JSON.stringify(debugPayload, null, 2)}</pre>
        </div>
      ) : null}

      <div className="dg-row dg-row--between dg-row--center">
        <h3 className="dg-h3">Características de la puerta</h3>
        <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>{refreshing ? "Actualizando..." : "Actualizar catálogo"}</Button>
      </div>

      {!visibleSections.length ? (
        <>
          <div className="spacer" />
          <div className="muted">No hay secciones habilitadas todavía. Configurá la sección inicial y las dependencias para el catálogo Puerta desde el dashboard.</div>
        </>
      ) : (
        <div className="dg-accordion">
          {visibleSections.map((section) => {
            const sectionId = Number(section.id);
            const isOpen = openSectionId === sectionId;
            const sectionProducts = productsBySection.get(sectionId) || [];
            const selectedInSection = selectedProductIdsBySection.get(sectionId) || new Set();
            const sectionToneStyle = getDoorSectionTone(sectionId);
            return (
              <div
                key={sectionId}
                ref={(el) => {
                  if (el) sectionRefs.current.set(sectionId, el);
                  else sectionRefs.current.delete(sectionId);
                }}
                className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}
                style={sectionToneStyle ? { borderColor: sectionToneStyle.borderColor } : undefined}
              >
                <button type="button" className="dg-acc-header" style={sectionToneStyle} onClick={() => setOpenSectionId(isOpen ? null : sectionId)}>
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
