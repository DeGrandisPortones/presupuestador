import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
import {
  adminGetTechnicalMeasurementRules,
  adminRefreshCatalog,
} from "../../../api/admin.js";
import Button from "../../../ui/Button";

const CATALOG_KINDS = new Set(["porton", "ipanel", "otros"]);

function normalizeCatalogKind(kind) {
  const normalized = String(kind || "porton").toLowerCase().trim();
  return CATALOG_KINDS.has(normalized) ? normalized : "porton";
}

function getClientFacingProductName(product) {
  return (
    product?.client_display_name ||
    product?.raw_name ||
    product?.original_name ||
    product?.name ||
    ""
  );
}

function getProductLabel(product) {
  return (
    product?.display_name ||
    product?.alias ||
    product?.internal_alias ||
    getClientFacingProductName(product)
  );
}

function syncQuoteLinesFromCatalogProducts(products = []) {
  const byId = new Map(
    (Array.isArray(products) ? products : [])
      .map((product) => [Number(product?.id), product])
      .filter(([id]) => Number.isFinite(id) && id > 0)
  );

  if (!byId.size) return;

  useQuoteStore.setState((state) => {
    const currentLines = Array.isArray(state?.lines) ? state.lines : [];
    const nextLines = currentLines.map((line) => {
      const product = byId.get(Number(line?.product_id));
      if (!product) return line;

      const nextRawName = getClientFacingProductName(product) || line?.raw_name || null;
      const nextName = getProductLabel(product) || line?.name || null;

      return {
        ...line,
        odoo_external_id: Number(product?.odoo_variant_id || line?.odoo_external_id || line?.product_id || 0) || 0,
        odoo_variant_id: Number(product?.odoo_variant_id || line?.odoo_variant_id || line?.odoo_external_id || line?.product_id || 0) || 0,
        odoo_id: Number(product?.odoo_id || line?.odoo_id || 0) || 0,
        odoo_template_id: Number(product?.odoo_template_id || line?.odoo_template_id || 0) || 0,
        name: nextName,
        raw_name: nextRawName,
        code: product?.code ?? line?.code ?? null,
      };
    });

    return { lines: nextLines };
  });
}

function getVisibleOdooId(product) {
  return Number(product?.odoo_id || product?.odoo_template_id || product?.id || 0) || 0;
}

function isDisabledForUser(product, user) {
  if (!product || !user) return false;
  const disableForVendedor = !!product.disable_for_vendedor;
  const disableForDistribuidor = !!product.disable_for_distribuidor;
  if (user?.is_vendedor && disableForVendedor) return true;
  if (user?.is_distribuidor && disableForDistribuidor) return true;
  return false;
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0);
}

function matchProductIds(selectedIds, requiredIds, matchMode = "any") {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const required = normalizeIdList(requiredIds);
  if (!required.length) return false;
  if (String(matchMode || "any").trim().toLowerCase() === "all") {
    return required.every((id) => selected.has(id));
  }
  return required.some((id) => selected.has(id));
}

function cloneSelectionMap(sectionList, selectedProductIdsBySection) {
  const map = new Map();
  for (const section of sectionList) {
    const sid = Number(section.id);
    map.set(sid, new Set(selectedProductIdsBySection.get(sid) || []));
  }
  return map;
}

function computeOrderedSectionIds({
  kind,
  sectionList,
  sectionMap,
  initialSectionId,
  dependencyRules,
  selectedProductIdsBySection,
}) {
  void kind;
  if (!sectionList.length) return [];

  const activeDependencyRules = (Array.isArray(dependencyRules) ? dependencyRules : [])
    .filter((rule) => rule?.active !== false);

  if (!initialSectionId && !activeDependencyRules.length) {
    return sectionList.map((section) => Number(section.id));
  }

  const startId =
    initialSectionId && sectionMap.has(Number(initialSectionId))
      ? Number(initialSectionId)
      : null;

  if (!startId) return [];

  const ordered = [startId];
  const seen = new Set(ordered);

  let changed = true;
  let guard = 0;
  while (changed && guard < 30) {
    changed = false;
    guard += 1;

    for (const currentSectionId of [...ordered]) {
      const selectedInParent =
        selectedProductIdsBySection.get(Number(currentSectionId)) || new Set();

      for (const rule of activeDependencyRules) {
        const parentSectionId = Number(rule?.parent_section_id || 0);
        if (parentSectionId !== Number(currentSectionId)) continue;

        if (
          !matchProductIds(
            selectedInParent,
            rule?.required_product_ids,
            rule?.match_mode || "any",
          )
        ) {
          continue;
        }

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

export default function SectionCatalog({ kind = "porton", onDownloadPresupuesto = null }) {
  const catalogKind = normalizeCatalogKind(kind);

  const addLine = useQuoteStore((s) => s.addLine);
  const forceRemoveLine = useQuoteStore((s) => s.forceRemoveLine);
  const lines = useQuoteStore((s) => s.lines);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);

  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(() => getOdooBootstrap(catalogKind));
  const [openSectionId, setOpenSectionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);

  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const rulesQ = useQuery({
    queryKey: ["technical-rules-for-section-catalog", catalogKind],
    queryFn: () => adminGetTechnicalMeasurementRules(catalogKind),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: !!catalogKind,
  });

  const initialSectionId = Number(rulesQ.data?.initial_section_id || 0) || null;

  const dependencyRules = useMemo(() => {
    const raw = Array.isArray(rulesQ.data?.section_dependency_rules)
      ? rulesQ.data.section_dependency_rules
      : [];
    return raw
      .filter((rule) => rule?.active !== false)
      .slice()
      .sort(
        (a, b) =>
          Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
          String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
      );
  }, [rulesQ.data]);

  const systemRules = useMemo(() => {
    if (catalogKind !== "porton") return [];
    const raw = Array.isArray(rulesQ.data?.system_derivation_rules)
      ? rulesQ.data.system_derivation_rules
      : [];
    return raw
      .filter((rule) => rule?.active !== false)
      .slice()
      .sort(
        (a, b) =>
          Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
          String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
      );
  }, [catalogKind, rulesQ.data]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      await adminRefreshCatalog();
      const data = await getCatalogBootstrap(catalogKind);
      setOdooBootstrap(data, catalogKind);
      setBoot(data);
      syncQuoteLinesFromCatalogProducts(data?.products || []);
    } finally {
      setRefreshing(false);
      setAutoloadAttempted(true);
    }
  }, [catalogKind]);

  useEffect(() => {
    setBoot(getOdooBootstrap(catalogKind));
    setAutoloadAttempted(false);
    setOpenSectionId(null);
  }, [catalogKind]);

  useEffect(() => {
    if (autoloadAttempted) return;
    let cancelled = false;
    (async () => {
      try {
        setRefreshing(true);
        const data = await getCatalogBootstrap(catalogKind);
        if (cancelled) return;
        setOdooBootstrap(data, catalogKind);
        setBoot(data);
        syncQuoteLinesFromCatalogProducts(data?.products || []);
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          setAutoloadAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoloadAttempted, catalogKind]);

  useEffect(() => {
    syncQuoteLinesFromCatalogProducts(products);
  }, [products]);

  const sectionList = useMemo(() => {
    return [...sections].sort(
      (a, b) =>
        Number(a.position || 0) - Number(b.position || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "es"),
    );
  }, [sections]);

  const sectionMap = useMemo(
    () => new Map(sectionList.map((section) => [Number(section.id), section])),
    [sectionList],
  );

  const productsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sectionList) map.set(Number(section.id), []);
    for (const product of products) {
      const sectionIds = Array.isArray(product.section_ids) ? product.section_ids : [];
      for (const rawSectionId of sectionIds) {
        const sectionId = Number(rawSectionId);
        if (map.has(sectionId)) map.get(sectionId).push(product);
      }
    }
    return map;
  }, [products, sectionList]);

  const selectedProductIdsGlobal = useMemo(
    () => new Set((Array.isArray(lines) ? lines : []).map((line) => Number(line?.product_id)).filter(Boolean)),
    [lines],
  );

  const selectedProductIdsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sectionList) map.set(Number(section.id), new Set());

    const currentLines = Array.isArray(lines) ? lines : [];
    for (const [sectionId, sectionProducts] of productsBySection.entries()) {
      const productIdsInSection = new Set(sectionProducts.map((product) => Number(product.id)));
      for (const line of currentLines) {
        const productId = Number(line?.product_id);
        if (productIdsInSection.has(productId)) {
          map.get(sectionId)?.add(productId);
        }
      }
    }
    return map;
  }, [lines, productsBySection, sectionList]);

  const orderedVisibleSectionIds = useMemo(() => {
    return computeOrderedSectionIds({
      kind: catalogKind,
      sectionList,
      sectionMap,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection,
    });
  }, [catalogKind, sectionList, sectionMap, initialSectionId, dependencyRules, selectedProductIdsBySection]);

  const visibleSections = useMemo(
    () => orderedVisibleSectionIds.map((id) => sectionMap.get(Number(id))).filter(Boolean),
    [orderedVisibleSectionIds, sectionMap],
  );

  const terminalStepCompleted = useMemo(() => {
    if (!visibleSections.length) return false;
    const lastSection = visibleSections[visibleSections.length - 1];
    if (!lastSection) return false;
    const selected = selectedProductIdsBySection.get(Number(lastSection.id));
    return !!selected && selected.size > 0;
  }, [visibleSections, selectedProductIdsBySection]);

  useEffect(() => {
    if (catalogKind !== "porton") return;

    let derivedType = "";
    for (const rule of systemRules) {
      if (
        matchProductIds(
          selectedProductIdsGlobal,
          rule?.required_product_ids,
          rule?.match_mode || "all",
        )
      ) {
        derivedType = String(rule?.derived_porton_type || "").trim();
        break;
      }
    }

    if (derivedType !== String(portonType || "")) {
      setPortonType(derivedType);
    }
  }, [catalogKind, systemRules, selectedProductIdsGlobal, portonType, setPortonType]);

  useEffect(() => {
    if (!visibleSections.length) return;
    const firstVisibleSectionId = Number(visibleSections[0]?.id || 0) || null;
    const visibleIds = new Set(visibleSections.map((section) => Number(section.id)));
    const currentOpenSectionId = Number(openSectionId || 0) || null;
    if (currentOpenSectionId && visibleIds.has(currentOpenSectionId)) return;
    if (firstVisibleSectionId) {
      setOpenSectionId(firstVisibleSectionId);
    }
  }, [visibleSections, openSectionId]);

  function selectProductForSection(sectionId, product) {
    const currentSelected = selectedProductIdsBySection.get(Number(sectionId)) || new Set();
    const targetProductId = Number(product?.id);

    const sectionProductIds = new Set(
      (productsBySection.get(Number(sectionId)) || [])
        .map((item) => Number(item.id))
        .filter(Boolean),
    );
    const currentSelectedIds = [...currentSelected].filter((id) => id !== targetProductId);

    const currentIndex = orderedVisibleSectionIds.findIndex((id) => Number(id) === Number(sectionId));
    const downstreamSectionIds =
      currentIndex >= 0 ? orderedVisibleSectionIds.slice(currentIndex + 1) : [];
    const hasDownstreamSelections = downstreamSectionIds.some((sid) => {
      const selected = selectedProductIdsBySection.get(Number(sid));
      return selected && selected.size > 0;
    });

    if (currentSelected.has(targetProductId) && currentSelected.size === 1) {
      const nextSectionId = downstreamSectionIds[0] || null;
      if (nextSectionId) setOpenSectionId(Number(nextSectionId));
      return;
    }

    if (currentSelectedIds.length > 0 && hasDownstreamSelections) {
      const ok = window.confirm(
        "Si cambiás este producto, vas a tener que volver a cargar las secciones siguientes. ¿Deseás continuar?",
      );
      if (!ok) return;
    }

    const nextSelectionMap = cloneSelectionMap(sectionList, selectedProductIdsBySection);

    for (const productId of sectionProductIds) {
      forceRemoveLine(productId);
      nextSelectionMap.get(Number(sectionId))?.delete(Number(productId));
    }

    if (hasDownstreamSelections) {
      for (const downstreamSectionId of downstreamSectionIds) {
        const selectedDownstream = [
          ...(nextSelectionMap.get(Number(downstreamSectionId)) || new Set()),
        ];
        for (const productId of selectedDownstream) {
          forceRemoveLine(productId);
          nextSelectionMap.get(Number(downstreamSectionId))?.delete(Number(productId));
        }
      }
    }

    addLine({
      ...product,
      name: getProductLabel(product),
      raw_name: getClientFacingProductName(product),
    });
    nextSelectionMap.set(Number(sectionId), new Set([targetProductId]));

    const nextOrderedIds = computeOrderedSectionIds({
      kind: catalogKind,
      sectionList,
      sectionMap,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection: nextSelectionMap,
    });

    const nextIndex = nextOrderedIds.findIndex((id) => Number(id) === Number(sectionId));
    const nextSectionId = nextIndex >= 0 ? nextOrderedIds[nextIndex + 1] : null;

    if (nextSectionId) setOpenSectionId(Number(nextSectionId));
  }

  const title =
    catalogKind === "porton"
      ? "Características del portón"
      : catalogKind === "ipanel"
        ? "Características del Ipanel"
        : "Características / productos";

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">{title}</h3>
          <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>
            {refreshing ? "Cargando…" : "Actualizar catálogo"}
          </Button>
        </div>
        <div className="spacer" />
        <div className="muted">
          {refreshing
            ? "Cargando catálogo automáticamente…"
            : "No se pudo cargar el catálogo automáticamente. Podés reintentar con el botón de actualizar."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dg-row dg-row--between dg-row--center">
        <h3 className="dg-h3">{title}</h3>
        <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>
          {refreshing ? "Actualizando…" : "Actualizar catálogo"}
        </Button>
      </div>

      {!visibleSections.length ? (
        <>
          <div className="spacer" />
          <div className="muted">
            No hay secciones habilitadas todavía. Configurá secciones y etiquetas para este catálogo desde el dashboard.
          </div>
        </>
      ) : (
        <div className="dg-accordion">
          {visibleSections.map((section) => {
            const sectionId = Number(section.id);
            const isOpen = openSectionId === sectionId;
            const sectionProducts = productsBySection.get(sectionId) || [];
            const selectedInSection = selectedProductIdsBySection.get(sectionId) || new Set();

            return (
              <div key={sectionId} className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}>
                <button
                  type="button"
                  className="dg-acc-header"
                  onClick={() => setOpenSectionId(isOpen ? null : sectionId)}
                >
                  <div className="dg-acc-title">
                    {section.name}
                  </div>
                  <div className="dg-acc-meta">
                    {selectedInSection.size ? `${selectedInSection.size} seleccionado` : "Sin selección"}{" "}
                    · {sectionProducts.length}
                  </div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>

                {isOpen ? (
                  <div className="dg-acc-body">
                    <div className="dg-product-list">
                      {sectionProducts.map((product) => {
                        const disabledForUser = isDisabledForUser(product, user);
                        const isSelected = selectedInSection.has(Number(product.id));
                        const visibleOdooId = getVisibleOdooId(product);

                        return (
                          <div
                            key={product.id}
                            className="dg-product-card"
                            style={
                              disabledForUser
                                ? { opacity: 0.55, background: "#f3f4f6" }
                                : isSelected
                                  ? { border: "1px solid #60a5fa", background: "#eff6ff" }
                                  : undefined
                            }
                          >
                            <div className="dg-product-info">
                              <div className="dg-product-name">
                                {getProductLabel(product)}
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                ID Presupuestador: {product.id}
                                {" · "}
                                ID Odoo: {visibleOdooId || product.id}
                                {product.code ? ` · ${product.code}` : ""}
                                {disabledForUser ? " · No habilitado para tu rol" : ""}
                              </div>
                            </div>

                            <Button
                              variant={isSelected ? "primary" : "secondary"}
                              disabled={disabledForUser}
                              onClick={() => selectProductForSection(sectionId, product)}
                            >
                              {isSelected ? "Elegido" : "Elegir"}
                            </Button>
                          </div>
                        );
                      })}

                      {!sectionProducts.length && (
                        <div className="muted">Sin productos para mostrar en esta sección</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {terminalStepCompleted && typeof onDownloadPresupuesto === "function" ? (
        <>
          <div className="spacer" />
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <Button variant="secondary" onClick={onDownloadPresupuesto}>
              Descargar presupuesto
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
