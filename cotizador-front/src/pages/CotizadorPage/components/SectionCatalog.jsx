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
  if (user.is_vendedor && disableForVendedor) return true;
  if (user.is_distribuidor && disableForDistribuidor) return true;
  return false;
}

function matchProductIds(selectedIds, requiredIds, matchMode = "any") {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const required = Array.isArray(requiredIds)
    ? requiredIds.map((x) => Number(x)).filter(Boolean)
    : [];
  if (!required.length) return false;
  if (String(matchMode || "any").trim().toLowerCase() === "all") {
    return required.every((id) => selected.has(Number(id)));
  }
  return required.some((id) => selected.has(Number(id)));
}

export default function SectionCatalog({ kind = "porton" }) {
  const bootstrapKind = (kind || "porton") === "otros" ? "porton" : kind;
  const addLine = useQuoteStore((s) => s.addLine);
  const lines = useQuoteStore((s) => s.lines);
  const setPortonType = useQuoteStore((s) => s.setPortonType);
  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(
    () => getOdooBootstrap(kind) || getOdooBootstrap(bootstrapKind),
  );
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const [openSectionId, setOpenSectionId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);

  const rulesQ = useQuery({
    queryKey: ["technical-rules-for-section-dependencies"],
    queryFn: adminGetTechnicalMeasurementRules,
    staleTime: 60 * 1000,
    enabled: (kind || "porton") === "porton",
  });

  const dependencyRules = useMemo(
    () =>
      (Array.isArray(rulesQ.data?.section_dependency_rules)
        ? rulesQ.data.section_dependency_rules
        : []
      )
        .filter((rule) => rule?.active !== false)
        .slice()
        .sort(
          (a, b) =>
            Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
            String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
        ),
    [rulesQ.data],
  );

  const systemRules = useMemo(
    () =>
      (Array.isArray(rulesQ.data?.system_derivation_rules)
        ? rulesQ.data.system_derivation_rules
        : []
      )
        .filter((rule) => rule?.active !== false)
        .slice()
        .sort(
          (a, b) =>
            Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
            String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
        ),
    [rulesQ.data],
  );

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

  const sectionList = useMemo(
    () =>
      [...sections].sort(
        (a, b) =>
          Number(a.position || 0) - Number(b.position || 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), "es"),
      ),
    [sections],
  );

  const productsBySection = useMemo(() => {
    const map = new Map();
    for (const s of sectionList) map.set(Number(s.id), []);
    for (const p of products) {
      if (SYSTEM_PRODUCT_IDS.has(Number(p.id))) continue;
      const sids = Array.isArray(p.section_ids) ? p.section_ids : [];
      for (const sid of sids) {
        const key = Number(sid);
        if (map.has(key)) map.get(key).push(p);
      }
    }
    return map;
  }, [products, sectionList]);

  const selectedProductIdsGlobal = useMemo(
    () => new Set((lines || []).map((l) => Number(l.product_id)).filter(Boolean)),
    [lines],
  );

  const selectedProductIdsBySection = useMemo(() => {
    const map = new Map();
    for (const s of sectionList) map.set(Number(s.id), new Set());
    for (const line of Array.isArray(lines) ? lines : []) {
      const pid = Number(line?.product_id);
      if (!pid) continue;
      for (const [sid, sectionProducts] of productsBySection.entries()) {
        if (sectionProducts.some((product) => Number(product.id) === pid)) {
          map.get(sid)?.add(pid);
        }
      }
    }
    return map;
  }, [lines, productsBySection, sectionList]);

  const visibleSectionIds = useMemo(() => {
    if ((kind || "porton").toLowerCase().trim() !== "porton") {
      return new Set(sectionList.map((section) => Number(section.id)));
    }
    if (!sectionList.length) return new Set();
    const activeRules = dependencyRules;
    if (!activeRules.length) {
      return new Set(sectionList.map((section) => Number(section.id)));
    }

    const childIds = new Set(
      activeRules.flatMap((rule) =>
        (Array.isArray(rule?.child_section_ids) ? rule.child_section_ids : []).map((x) =>
          Number(x),
        ),
      ),
    );
    const visible = new Set(
      sectionList
        .filter((section, index) => index === 0 || !childIds.has(Number(section.id)))
        .map((section) => Number(section.id)),
    );

    let changed = true;
    let guard = 0;
    while (changed && guard < 20) {
      changed = false;
      guard += 1;
      for (const rule of activeRules) {
        const parentSectionId = Number(rule?.parent_section_id || 0);
        if (!parentSectionId || !visible.has(parentSectionId)) continue;
        const selectedInParent = selectedProductIdsBySection.get(parentSectionId) || new Set();
        const requiredIds = Array.isArray(rule?.required_product_ids)
          ? rule.required_product_ids
          : [];
        if (!matchProductIds(selectedInParent, requiredIds, rule?.match_mode || "any")) continue;
        for (const childIdRaw of Array.isArray(rule?.child_section_ids)
          ? rule.child_section_ids
          : []) {
          const childId = Number(childIdRaw);
          if (!childId || visible.has(childId)) continue;
          visible.add(childId);
          changed = true;
        }
      }
    }
    return visible;
  }, [kind, sectionList, dependencyRules, selectedProductIdsBySection]);

  const visibleSections = useMemo(
    () => sectionList.filter((section) => visibleSectionIds.has(Number(section.id))),
    [sectionList, visibleSectionIds],
  );

  useEffect(() => {
    if ((kind || "porton").toLowerCase().trim() !== "porton") return;
    let derived = "";
    for (const rule of systemRules) {
      const requiredIds = Array.isArray(rule?.required_product_ids)
        ? rule.required_product_ids
        : [];
      if (!requiredIds.length) continue;
      if (matchProductIds(selectedProductIdsGlobal, requiredIds, rule?.match_mode || "all")) {
        derived = String(rule?.derived_porton_type || "").trim();
        break;
      }
    }
    setPortonType(derived);
  }, [kind, systemRules, selectedProductIdsGlobal, setPortonType]);

  useEffect(() => {
    if (!visibleSections.length) return;
    if (openSectionId == null || !visibleSectionIds.has(Number(openSectionId))) {
      setOpenSectionId(Number(visibleSections[0].id));
    }
  }, [visibleSections, visibleSectionIds, openSectionId]);

  function getVisibleProducts(sectionId) {
    return (productsBySection.get(Number(sectionId)) || []).filter(
      (product) => !SYSTEM_PRODUCT_IDS.has(Number(product.id)),
    );
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
            No hay secciones habilitadas todavía. Revisá las reglas de dependencias en el dashboard o completá la sección anterior.
          </div>
        </>
      ) : (
        <div className="dg-accordion">
          {visibleSections.map((s) => {
            const sid = Number(s.id);
            const isOpen = openSectionId === sid;
            const visible = getVisibleProducts(sid);
            const all = productsBySection.get(sid) || [];
            const selectedInSection = selectedProductIdsBySection.get(sid) || new Set();
            return (
              <div key={sid} className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}>
                <button
                  type="button"
                  className="dg-acc-header"
                  onClick={() => setOpenSectionId(isOpen ? null : sid)}
                >
                  <div className="dg-acc-title">
                    {s.name}
                    {s.use_surface_qty ? " · cantidad por superficie" : ""}
                  </div>
                  <div className="dg-acc-meta">
                    {selectedInSection.size ? `${selectedInSection.size} seleccionados` : "Sin selección"} · {visible.length}/{all.length}
                  </div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>
                {isOpen ? (
                  <div className="dg-acc-body">
                    <div className="dg-product-list">
                      {visible.map((p) => {
                        const disabledForUser = isDisabledForUser(p, user);
                        return (
                          <div
                            key={p.id}
                            className="dg-product-card"
                            style={disabledForUser ? { opacity: 0.55, background: "#f3f4f6" } : undefined}
                          >
                            <div className="dg-product-info">
                              <div className="dg-product-name">
                                {getProductLabel(p)}
                                {p.uses_surface_quantity ? " · cantidad por superficie" : ""}
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {p.code ? `Código: ${p.code}` : `ID: ${p.id}`}
                                {disabledForUser ? " · No habilitado para tu rol" : ""}
                              </div>
                            </div>
                            <Button
                              disabled={disabledForUser}
                              onClick={() =>
                                addLine({ ...p, name: getProductLabel(p), raw_name: p.name })
                              }
                            >
                              +
                            </Button>
                          </div>
                        );
                      })}
                      {!visible.length && (
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
