import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Button from "../../../ui/Button";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);

function getProductLabel(product) {
  return product?.display_name || product?.alias || product?.name || "";
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

export default function SectionCatalog({ kind = "porton" }) {
  const bootstrapKind = (kind || "porton") === "otros" ? "porton" : kind;

  const addLine = useQuoteStore((s) => s.addLine);
  const removeLine = useQuoteStore((s) => s.removeLine);
  const lines = useQuoteStore((s) => s.lines);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);

  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(() => getOdooBootstrap(kind) || getOdooBootstrap(bootstrapKind));
  const [openSectionId, setOpenSectionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);

  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const rulesQ = useQuery({
    queryKey: ["technical-rules-for-section-catalog"],
    queryFn: adminGetTechnicalMeasurementRules,
    staleTime: 60 * 1000,
    enabled: (kind || "porton") === "porton",
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
  }, [rulesQ.data]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getCatalogBootstrap(bootstrapKind);
      setOdooBootstrap(data, kind);
      setBoot(data);
    } finally {
      setRefreshing(false);
      setAutoloadAttempted(true);
    }
  }, [kind, bootstrapKind]);

  useEffect(() => {
    setBoot(getOdooBootstrap(kind) || getOdooBootstrap(bootstrapKind));
    setAutoloadAttempted(false);
    setOpenSectionId(null);
  }, [kind, bootstrapKind]);

  useEffect(() => {
    if (autoloadAttempted) return;
    let cancelled = false;
    (async () => {
      try {
        setRefreshing(true);
        const data = await getCatalogBootstrap(bootstrapKind);
        if (cancelled) return;
        setOdooBootstrap(data, kind);
        setBoot(data);
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
  }, [autoloadAttempted, kind, bootstrapKind]);

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
      if (SYSTEM_PRODUCT_IDS.has(Number(product.id))) continue;
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
    if ((kind || "porton").toLowerCase().trim() !== "porton") {
      return sectionList.map((section) => Number(section.id));
    }

    if (!sectionList.length) return [];

    const startId =
      initialSectionId && sectionMap.has(Number(initialSectionId))
        ? Number(initialSectionId)
        : Number(sectionList[0]?.id || 0);

    if (!startId) return [];

    const ordered = [startId];
    const seen = new Set(ordered);

    let changed = true;
    let guard = 0;
    while (changed && guard < 30) {
      changed = false;
      guard += 1;

      for (const currentSectionId of [...ordered]) {
        const selectedInParent = selectedProductIdsBySection.get(Number(currentSectionId)) || new Set();

        for (const rule of dependencyRules) {
          const parentSectionId = Number(rule?.parent_section_id || 0);
          if (parentSectionId !== Number(currentSectionId)) continue;

          if (!matchProductIds(selectedInParent, rule?.required_product_ids, rule?.match_mode || "any")) {
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
  }, [
    kind,
    initialSectionId,
    sectionList,
    sectionMap,
    dependencyRules,
    selectedProductIdsBySection,
  ]);

  const visibleSections = useMemo(
    () => orderedVisibleSectionIds.map((id) => sectionMap.get(Number(id))).filter(Boolean),
    [orderedVisibleSectionIds, sectionMap],
  );

  useEffect(() => {
    if ((kind || "porton").toLowerCase().trim() !== "porton") return;

    let derivedType = "";
    for (const rule of systemRules) {
      if (matchProductIds(selectedProductIdsGlobal, rule?.required_product_ids, rule?.match_mode || "all")) {
        derivedType = String(rule?.derived_porton_type || "").trim();
        break;
      }
    }

    if (derivedType !== String(portonType || "")) {
      setPortonType(derivedType);
    }
  }, [kind, systemRules, selectedProductIdsGlobal, portonType, setPortonType]);

  useEffect(() => {
    if (!visibleSections.length) return;
    const visibleIds = new Set(visibleSections.map((section) => Number(section.id)));
    if (openSectionId == null || !visibleIds.has(Number(openSectionId))) {
      setOpenSectionId(Number(visibleSections[0].id));
    }
  }, [visibleSections, openSectionId]);

  function selectProductForSection(sectionId, product) {
    const currentSelected = selectedProductIdsBySection.get(Number(sectionId)) || new Set();
    const targetProductId = Number(product?.id);

    if (currentSelected.has(targetProductId) && currentSelected.size === 1) {
      return;
    }

    currentSelected.forEach((productId) => {
      removeLine(productId);
    });

    addLine({
      ...product,
      name: getProductLabel(product),
      raw_name: product?.name,
    });
  }

  const title =
    (kind || "porton") === "porton"
      ? "Características del portón"
      : (kind || "") === "ipanel"
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
            No hay secciones habilitadas todavía. Elegí una sección inicial en el dashboard o configurá dependencias.
          </div>
        </>
      ) : (
        <div className="dg-accordion">
          {visibleSections.map((section) => {
            const sectionId = Number(section.id);
            const isOpen = openSectionId === sectionId;
            const sectionProducts = (productsBySection.get(sectionId) || []).filter(
              (product) => !SYSTEM_PRODUCT_IDS.has(Number(product.id)),
            );
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
                    {section.use_surface_qty ? " · cantidad por superficie" : ""}
                  </div>
                  <div className="dg-acc-meta">
                    {selectedInSection.size
                      ? `${selectedInSection.size} seleccionado`
                      : "Sin selección"}{" "}
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
                                {product.uses_surface_quantity ? " · cantidad por superficie" : ""}
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {product.code ? `Código: ${product.code}` : `ID: ${product.id}`}
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
    </div>
  );
}
