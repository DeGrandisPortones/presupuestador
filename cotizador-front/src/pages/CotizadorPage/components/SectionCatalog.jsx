import { useEffect, useMemo, useState } from "react";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import Input from "../../../ui/Input";
import Button from "../../../ui/Button";
import { getCatalogBootstrap } from "../../../api/catalog.js";

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

export default function SectionCatalog({ kind = "porton" }) {
  const addLine = useQuoteStore((s) => s.addLine);
  const portonType = useQuoteStore((s) => s.portonType);

  const [boot, setBoot] = useState(() => getOdooBootstrap(kind));
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];
  const typeSections = boot?.type_sections || {};

  const [openSectionId, setOpenSectionId] = useState(null);
  const [queryBySection, setQueryBySection] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadTried, setAutoloadTried] = useState(false);

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

  useEffect(() => {
    setBoot(getOdooBootstrap(kind));
    setAutoloadTried(false);
  }, [kind]);

  useEffect(() => {
    if (boot || refreshing || autoloadTried) return;

    let cancelled = false;

    async function loadCatalog() {
      setRefreshing(true);
      try {
        const data = await getCatalogBootstrap(kind);
        if (cancelled) return;
        setOdooBootstrap(data, kind);
        setBoot(data);
      } catch {
        if (!cancelled) setAutoloadTried(true);
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          setAutoloadTried(true);
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [boot, refreshing, autoloadTried, kind]);

  useEffect(() => {
    if (!sectionList.length) return;
    if (openSectionId == null || !sectionList.some((s) => Number(s.id) === Number(openSectionId))) {
      setOpenSectionId(Number(sectionList[0].id));
    }
  }, [sectionList, openSectionId]);

  const productsBySection = useMemo(() => {
    const map = new Map();
    for (const s of sectionList) map.set(Number(s.id), []);
    for (const p of products) {
      const sids = Array.isArray(p.section_ids) ? p.section_ids : [];
      for (const sid of sids) {
        const key = Number(sid);
        if (map.has(key)) map.get(key).push(p);
      }
    }
    return map;
  }, [products, sectionList]);

  function getVisibleProducts(sectionId) {
    const all = productsBySection.get(Number(sectionId)) || [];
    const q = normalize(queryBySection[sectionId] || "");
    if (!q) return all;

    return all.filter((p) => {
      const name = normalize(p.display_name || p.alias || p.name);
      const alias = normalize(p.alias || "");
      const raw = normalize(p.name);
      const code = normalize(p.code);
      return name.includes(q) || alias.includes(q) || raw.includes(q) || code.includes(q);
    });
  }

  async function refreshCatalog() {
    setRefreshing(true);
    try {
      const data = await getCatalogBootstrap(kind);
      setOdooBootstrap(data, kind);
      setBoot(data);
    } finally {
      setRefreshing(false);
      setAutoloadTried(true);
    }
  }

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">Características del portón</h3>
          <Button
            variant="ghost"
            disabled={refreshing}
            onClick={refreshCatalog}
          >
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
        <Button
          variant="ghost"
          disabled={refreshing}
          onClick={refreshCatalog}
        >
          {refreshing ? "Actualizando…" : "Actualizar catálogo"}
        </Button>
      </div>

      {!sectionList.length ? (
        <>
          <div className="spacer" />
          <div className="muted">
            No hay secciones para mostrar.
            {(kind || "porton") === "porton" ? " Elegí primero el Tipo/Sistema y asegurate de que Enc. Comercial haya asignado secciones para ese tipo." : ""}
          </div>
        </>
      ) : (
        <div className="dg-accordion">
          {sectionList.map((s) => {
            const sid = Number(s.id);
            const isOpen = openSectionId === sid;
            const all = productsBySection.get(sid) || [];
            const visible = getVisibleProducts(sid);
            const q = queryBySection[sid] || "";

            return (
              <div key={sid} className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}>
                <button
                  type="button"
                  className="dg-acc-header"
                  onClick={() => setOpenSectionId(isOpen ? null : sid)}
                >
                  <div className="dg-acc-title">{s.name}</div>
                  <div className="dg-acc-meta">
                    {visible.length}/{all.length}
                  </div>
                  <div className="dg-acc-chevron">{isOpen ? "▾" : "▸"}</div>
                </button>

                {isOpen ? (
                  <div className="dg-acc-body">
                    <Input
                      value={q}
                      onChange={(v) =>
                        setQueryBySection((prev) => ({ ...prev, [sid]: v }))
                      }
                      placeholder="Buscar dentro de esta sección (nombre o código)…"
                      style={{ width: "100%" }}
                    />

                    <div className="spacer" />

                    <div className="dg-product-list">
                      {visible.map((p) => (
                        <div key={p.id} className="dg-product-card">
                          <div className="dg-product-info">
                            <div className="dg-product-name">
                              {p.display_name || p.alias || p.name}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              ID: {p.id}
                              {p.code ? ` · ${p.code}` : ""}
                              {p.alias && p.alias !== p.name ? <span>{` · ${p.name}`}</span> : null}
                            </div>
                          </div>

                          <Button
                            onClick={() =>
                              addLine({
                                ...p,
                                name: p.display_name || p.alias || p.name,
                                raw_name: p.name,
                              })
                            }
                          >
                            +
                          </Button>
                        </div>
                      ))}
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
