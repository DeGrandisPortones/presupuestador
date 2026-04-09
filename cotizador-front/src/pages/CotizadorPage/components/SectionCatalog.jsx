import { useCallback, useEffect, useMemo, useState } from "react";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import Input from "../../../ui/Input";
import Button from "../../../ui/Button";
import { getCatalogBootstrap } from "../../../api/catalog.js";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);
function normalize(s) { return (s || "").toString().trim().toLowerCase(); }
function getProductLabel(product) { return product?.display_name || product?.alias || product?.name || ""; }
function isDisabledForUser(product, user) {
  if (!product || !user) return false;
  const disableForVendedor = !!product.disable_for_vendedor;
  const disableForDistribuidor = !!product.disable_for_distribuidor;
  if (user.is_vendedor && disableForVendedor) return true;
  if (user.is_distribuidor && disableForDistribuidor) return true;
  return false;
}
function normalizeRulesPayload(raw) {
  return {
    section_dependency_rules: Array.isArray(raw?.section_dependency_rules) ? raw.section_dependency_rules : [],
    system_derivation_rules: Array.isArray(raw?.system_derivation_rules) ? raw.system_derivation_rules : [],
  };
}
function parseIdList(value) {
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
  return String(value || "").split(/[;,\s]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
}
function ruleMatchesSelected(rule, selectedProductIds) {
  const ids = parseIdList(rule?.required_product_ids);
  if (!ids.length) return false;
  const set = new Set(selectedProductIds || []);
  const mode = String(rule?.match_mode || "any").trim().toLowerCase();
  if (mode === "all") return ids.every((id) => set.has(Number(id)));
  return ids.some((id) => set.has(Number(id)));
}
function buildVisibleSectionIds(sections, dependencyRules, selectedProductIds) {
  const orderedIds = (Array.isArray(sections) ? sections : []).map((s) => Number(s.id)).filter(Boolean);
  const activeRules = (Array.isArray(dependencyRules) ? dependencyRules : []).filter((r) => r?.active !== false);
  if (!activeRules.length) return new Set(orderedIds);
  const childIds = new Set(activeRules.flatMap((r) => parseIdList(r?.child_section_ids)));
  const visible = new Set(orderedIds.filter((id) => !childIds.has(id)));
  for (const rule of activeRules) {
    if (!ruleMatchesSelected(rule, selectedProductIds)) continue;
    for (const childId of parseIdList(rule?.child_section_ids)) visible.add(Number(childId));
  }
  return visible;
}
function deriveSystemFromRules(systemRules, selectedProductIds) {
  const selected = new Set(selectedProductIds || []);
  for (const rule of Array.isArray(systemRules) ? systemRules : []) {
    if (rule?.active === false) continue;
    const ids = parseIdList(rule?.required_product_ids);
    const derived = String(rule?.derived_porton_type || "").trim();
    if (!ids.length || !derived) continue;
    const mode = String(rule?.match_mode || "all").trim().toLowerCase();
    const matches = mode === "any" ? ids.some((id) => selected.has(Number(id))) : ids.every((id) => selected.has(Number(id)));
    if (matches) return derived;
  }
  return "";
}

export default function SectionCatalog({ kind = "porton" }) {
  const bootstrapKind = (kind || "porton") === "otros" ? "porton" : kind;
  const addLine = useQuoteStore((s) => s.addLine);
  const lines = useQuoteStore((s) => s.lines);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);
  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(() => getOdooBootstrap(kind) || getOdooBootstrap(bootstrapKind));
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const [openSectionId, setOpenSectionId] = useState(null);
  const [queryBySection, setQueryBySection] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);
  const [completedBySection, setCompletedBySection] = useState({});

  const rulesQ = useCallback(async () => await adminGetTechnicalMeasurementRules(), []);
  const [rulesData, setRulesData] = useState({ section_dependency_rules: [], system_derivation_rules: [] });

  const refreshRules = useCallback(async () => {
    const data = await rulesQ();
    setRulesData(normalizeRulesPayload(data));
  }, [rulesQ]);

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getCatalogBootstrap(bootstrapKind);
      setOdooBootstrap(data, kind);
      setBoot(data);
      await refreshRules();
    } finally {
      setRefreshing(false);
      setAutoloadAttempted(true);
    }
  }, [kind, bootstrapKind, refreshRules]);

  useEffect(() => {
    setBoot(getOdooBootstrap(kind) || getOdooBootstrap(bootstrapKind));
    setAutoloadAttempted(false);
    setOpenSectionId(null);
    setQueryBySection({});
    setCompletedBySection({});
    setRulesData({ section_dependency_rules: [], system_derivation_rules: [] });
  }, [kind, bootstrapKind]);

  useEffect(() => {
    if (autoloadAttempted) return;
    let cancelled = false;
    (async () => {
      try {
        setRefreshing(true);
        const [data, technicalRules] = await Promise.all([
          getCatalogBootstrap(bootstrapKind),
          rulesQ(),
        ]);
        if (cancelled) return;
        setOdooBootstrap(data, kind);
        setBoot(data);
        setRulesData(normalizeRulesPayload(technicalRules));
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          setAutoloadAttempted(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [autoloadAttempted, kind, bootstrapKind, rulesQ]);

  const lineProductIds = useMemo(() => new Set((lines || []).map((l) => Number(l.product_id)).filter(Boolean)), [lines]);
  const selectedProductIds = useMemo(() => Array.from(lineProductIds), [lineProductIds]);

  useEffect(() => {
    if ((kind || "porton") !== "porton") return;
    const derived = deriveSystemFromRules(rulesData.system_derivation_rules, selectedProductIds);
    if (derived !== String(portonType || "")) setPortonType(derived);
  }, [kind, rulesData.system_derivation_rules, selectedProductIds, portonType, setPortonType]);

  const visibleSectionIds = useMemo(
    () => buildVisibleSectionIds(sections, rulesData.section_dependency_rules, selectedProductIds),
    [sections, rulesData.section_dependency_rules, selectedProductIds],
  );

  const sectionList = useMemo(() => {
    const ordered = [...sections].sort((a, b) => (Number(a.position || 0) - Number(b.position || 0)) || String(a.name).localeCompare(String(b.name)));
    return ordered.filter((s) => visibleSectionIds.has(Number(s.id)));
  }, [sections, visibleSectionIds]);

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

  useEffect(() => {
    if (!sectionList.length) {
      setCompletedBySection({});
      return;
    }
    const highestIndexWithProducts = sectionList.reduce((acc, section, index) => {
      const hasAnySelectedProduct = (productsBySection.get(Number(section.id)) || []).some((p) => lineProductIds.has(Number(p.id)));
      return hasAnySelectedProduct ? index : acc;
    }, -1);
    setCompletedBySection((prev) => {
      const next = {};
      sectionList.forEach((section, index) => {
        const sid = Number(section.id);
        next[sid] = !!prev[sid] || index <= highestIndexWithProducts;
      });
      return next;
    });
  }, [sectionList, productsBySection, lineProductIds]);

  const maxUnlockedIndex = useMemo(() => {
    if (!sectionList.length) return -1;
    let lastUnlocked = 0;
    for (let i = 0; i < sectionList.length - 1; i += 1) {
      const sid = Number(sectionList[i].id);
      if (!completedBySection[sid]) break;
      lastUnlocked = i + 1;
    }
    return lastUnlocked;
  }, [sectionList, completedBySection]);

  useEffect(() => {
    if (!sectionList.length) return;
    const safeIndex = Math.max(0, Math.min(maxUnlockedIndex, sectionList.length - 1));
    const fallbackId = Number(sectionList[safeIndex]?.id);
    if (openSectionId == null) { setOpenSectionId(fallbackId); return; }
    const currentIndex = sectionList.findIndex((s) => Number(s.id) === Number(openSectionId));
    if (currentIndex === -1 || currentIndex > maxUnlockedIndex) setOpenSectionId(fallbackId);
  }, [sectionList, openSectionId, maxUnlockedIndex]);

  function getVisibleProducts(sectionId) {
    const all = (productsBySection.get(Number(sectionId)) || []).filter((product) => !SYSTEM_PRODUCT_IDS.has(Number(product.id)));
    const q = normalize(queryBySection[sectionId] || "");
    if (!q) return all;
    return all.filter((p) => {
      const label = normalize(getProductLabel(p));
      const alias = normalize(p.alias || "");
      const raw = normalize(p.name);
      const code = normalize(p.code);
      return label.includes(q) || alias.includes(q) || raw.includes(q) || code.includes(q);
    });
  }

  function markSectionComplete(sectionId) {
    const sid = Number(sectionId);
    setCompletedBySection((prev) => ({ ...prev, [sid]: true }));
    const currentIndex = sectionList.findIndex((s) => Number(s.id) === sid);
    const nextSection = sectionList[currentIndex + 1];
    if (nextSection) setOpenSectionId(Number(nextSection.id));
  }

  const title = (kind || "porton") === "porton" ? "Características del portón" : ((kind || "") === "ipanel" ? "Características del Ipanel" : "Características / productos");

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">{title}</h3>
          <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>{refreshing ? "Cargando…" : "Actualizar catálogo"}</Button>
        </div>
        <div className="spacer" />
        <div className="muted">{refreshing ? "Cargando catálogo automáticamente…" : "No se pudo cargar el catálogo automáticamente. Podés reintentar con el botón de actualizar."}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="dg-row dg-row--between dg-row--center">
        <h3 className="dg-h3">{title}</h3>
        <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>{refreshing ? "Actualizando…" : "Actualizar catálogo"}</Button>
      </div>
      {!sectionList.length ? (
        <>
          <div className="spacer" />
          <div className="muted">No hay secciones visibles para mostrar. Revisá las dependencias configuradas en el dashboard comercial.</div>
        </>
      ) : (
        <div className="dg-accordion">
          {sectionList.map((s, index) => {
            const sid = Number(s.id);
            const isOpen = openSectionId === sid;
            const isLocked = index > maxUnlockedIndex;
            const isCompleted = !!completedBySection[sid];
            const all = productsBySection.get(sid) || [];
            const visible = getVisibleProducts(sid);
            const q = queryBySection[sid] || "";
            const nextSection = sectionList[index + 1];
            return (
              <div key={sid} className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}>
                <button type="button" className="dg-acc-header" onClick={() => { if (isLocked) return; setOpenSectionId(isOpen ? null : sid); }} disabled={isLocked} style={isLocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}>
                  <div className="dg-acc-title">{s.name}{s.use_surface_qty ? " · cantidad por superficie" : ""}</div>
                  <div className="dg-acc-meta">{isLocked ? "Bloqueada" : isCompleted ? "Completada" : "Pendiente"} · {visible.length}/{all.length}</div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>
                {isOpen ? (
                  <div className="dg-acc-body">
                    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #eee", background: isCompleted ? "#eef9f3" : "#fafafa", marginBottom: 12, fontSize: 13 }}>
                      {isCompleted ? "Sección completada. Podés seguir agregando productos o continuar con las siguientes." : nextSection ? "Completá esta sección para habilitar la siguiente según dependencias y orden." : "Esta es la última sección visible para la configuración actual."}
                    </div>
                    <Input value={q} onChange={(v) => setQueryBySection((prev) => ({ ...prev, [sid]: v }))} placeholder="Buscar dentro de esta sección (alias, nombre o código)…" style={{ width: "100%" }} />
                    <div className="spacer" />
                    <div className="dg-product-list">
                      {visible.map((p) => {
                        const disabledForUser = isDisabledForUser(p, user);
                        return (
                          <div key={p.id} className="dg-product-card" style={disabledForUser ? { opacity: 0.55, background: "#f3f4f6" } : undefined}>
                            <div className="dg-product-info">
                              <div className="dg-product-name">{getProductLabel(p)}{p.uses_surface_quantity ? " · cantidad por superficie" : ""}</div>
                              <div className="muted" style={{ fontSize: 12 }}>{p.code ? `Código: ${p.code}` : `ID: ${p.id}`}{disabledForUser ? " · No habilitado para tu rol" : ""}</div>
                            </div>
                            <Button disabled={disabledForUser} onClick={() => addLine({ ...p, name: getProductLabel(p), raw_name: p.name })}>+</Button>
                          </div>
                        );
                      })}
                      {!visible.length && <div className="muted">Sin productos para mostrar en esta sección</div>}
                    </div>
                    <div className="spacer" />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Sistema derivado actual: <b>{portonType || "—"}</b>
                      </div>
                      <Button variant="secondary" onClick={() => markSectionComplete(sid)}>{nextSection ? "Completar sección y seguir" : "Marcar sección como completa"}</Button>
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
