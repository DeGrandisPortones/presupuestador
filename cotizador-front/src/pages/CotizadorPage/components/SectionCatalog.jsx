import { useCallback, useEffect, useMemo, useState } from "react";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import Input from "../../../ui/Input";
import Button from "../../../ui/Button";
import { getCatalogBootstrap } from "../../../api/catalog.js";

const SYSTEM_PRODUCT_IDS = new Set([3008, 3009]);

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

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

export default function SectionCatalog({ kind = "porton" }) {
  const addLine = useQuoteStore((s) => s.addLine);
  const lines = useQuoteStore((s) => s.lines);
  const portonType = useQuoteStore((s) => s.portonType);
  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(() => getOdooBootstrap(kind));
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];
  const typeSections = boot?.type_sections || {};

  const [openSectionId, setOpenSectionId] = useState(null);
  const [queryBySection, setQueryBySection] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);
  const [completedBySection, setCompletedBySection] = useState({});

  const refreshCatalog = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getCatalogBootstrap(kind);
      setOdooBootstrap(data, kind);
      setBoot(data);
    } finally {
      setRefreshing(false);
      setAutoloadAttempted(true);
    }
  }, [kind]);

  useEffect(() => {
    setBoot(getOdooBootstrap(kind));
    setAutoloadAttempted(false);
    setOpenSectionId(null);
    setQueryBySection({});
    setCompletedBySection({});
  }, [kind]);

  useEffect(() => {
    if (autoloadAttempted) return;
    let cancelled = false;

    (async () => {
      try {
        setRefreshing(true);
        const data = await getCatalogBootstrap(kind);
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
  }, [autoloadAttempted, kind]);

  const sectionList = useMemo(() => {
    const ordered = [...sections].sort(
      (a, b) =>
        (Number(a.position || 0) - Number(b.position || 0)) ||
        String(a.name).localeCompare(String(b.name))
    );

    if ((kind || "porton") === "porton") {
      const key = String(portonType || "").trim();
      const allowed = key ? (typeSections[key] || []) : [];
      const allowedSet = new Set((allowed || []).map((x) => Number(x)));
      return ordered.filter((s) => allowedSet.has(Number(s.id)));
    }

    return ordered;
  }, [sections, kind, portonType, typeSections]);

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

  const lineProductIds = useMemo(
    () => new Set((lines || []).map((l) => Number(l.product_id)).filter(Boolean)),
    [lines]
  );

  useEffect(() => {
    if (!sectionList.length) {
      setCompletedBySection({});
      return;
    }

    const highestIndexWithProducts = sectionList.reduce((acc, section, index) => {
      const hasAnySelectedProduct = (productsBySection.get(Number(section.id)) || []).some((p) =>
        lineProductIds.has(Number(p.id))
      );
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

    if (openSectionId == null) {
      setOpenSectionId(fallbackId);
      return;
    }

    const currentIndex = sectionList.findIndex((s) => Number(s.id) === Number(openSectionId));
    if (currentIndex === -1 || currentIndex > maxUnlockedIndex) {
      setOpenSectionId(fallbackId);
    }
  }, [sectionList, openSectionId, maxUnlockedIndex]);

  function getVisibleProducts(sectionId) {
    const all = (productsBySection.get(Number(sectionId)) || []).filter(
      (product) => !SYSTEM_PRODUCT_IDS.has(Number(product.id))
    );
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

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">Características del portón</h3>
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
        <h3 className="dg-h3">Características del portón</h3>
        <Button variant="ghost" disabled={refreshing} onClick={refreshCatalog}>
          {refreshing ? "Actualizando…" : "Actualizar catálogo"}
        </Button>
      </div>

      {!sectionList.length ? (
        <>
          <div className="spacer" />
          <div className="muted">
            No hay secciones para mostrar.
            {(kind || "porton") === "porton"
              ? " Elegí primero el Tipo/Sistema y asegurate de que Enc. Comercial haya asignado secciones para ese tipo."
              : ""}
          </div>
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
                <button
                  type="button"
                  className="dg-acc-header"
                  onClick={() => {
                    if (isLocked) return;
                    setOpenSectionId(isOpen ? null : sid);
                  }}
                  disabled={isLocked}
                  style={isLocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                >
                  <div className="dg-acc-title">
                    {s.name}
                    {s.use_surface_qty ? " · cantidad por superficie" : ""}
                  </div>
                  <div className="dg-acc-meta">
                    {isLocked ? "Bloqueada" : isCompleted ? "Completada" : "Pendiente"} · {visible.length}/{all.length}
                  </div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>

                {isOpen ? (
                  <div className="dg-acc-body">
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #eee",
                        background: isCompleted ? "#eef9f3" : "#fafafa",
                        marginBottom: 12,
                        fontSize: 13,
                      }}
                    >
                      {isCompleted
                        ? "Sección completada. Podés seguir agregando productos o continuar con las siguientes."
                        : nextSection
                          ? "Completá esta sección para habilitar la siguiente según el orden definido en el dashboard."
                          : "Esta es la última sección habilitada para este tipo."}
                    </div>

                    <Input
                      value={q}
                      onChange={(v) => setQueryBySection((prev) => ({ ...prev, [sid]: v }))}
                      placeholder="Buscar dentro de esta sección (alias, nombre o código)…"
                      style={{ width: "100%" }}
                    />

                    <div className="spacer" />

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
                                addLine({
                                  ...p,
                                  name: getProductLabel(p),
                                  raw_name: p.name,
                                })
                              }
                            >
                              +
                            </Button>
                          </div>
                        );
                      })}
                      {!visible.length && <div className="muted">Sin productos para mostrar en esta sección</div>}
                    </div>

                    <div className="spacer" />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button variant="secondary" onClick={() => markSectionComplete(sid)}>
                        {nextSection ? "Completar sección y seguir" : "Marcar sección como completa"}
                      </Button>
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
