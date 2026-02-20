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

  const [boot, setBoot] = useState(() => getOdooBootstrap(kind));
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const [openSectionId, setOpenSectionId] = useState(null);
  const [queryBySection, setQueryBySection] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const sectionList = useMemo(() => {
    // orden fijo por position asc (definido desde dashboard)
    return [...sections].sort(
      (a, b) =>
        (Number(a.position || 0) - Number(b.position || 0)) ||
        String(a.name).localeCompare(String(b.name))
    );
  }, [sections]);

  // auto abrir la primera sección si no hay una seleccionada
  useEffect(() => {
    if (!sectionList.length) return;
    if (openSectionId == null) setOpenSectionId(Number(sectionList[0].id));
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
      const name = normalize(p.display_name || p.name);
      const raw = normalize(p.name);
      const code = normalize(p.code);
      return name.includes(q) || raw.includes(q) || code.includes(q);
    });
  }

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">Características del portón</h3>
          <Button
            variant="ghost"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                const data = await getCatalogBootstrap(kind);
                setOdooBootstrap(data, kind);
                setBoot(data);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? "Cargando…" : "Cargar catálogo"}
          </Button>
        </div>
        <div className="spacer" />
        <div className="muted">
          Todavía no hay catálogo en el navegador. Podés cargarlo con el botón o
          cerrando y volviendo a entrar.
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
          onClick={async () => {
            setRefreshing(true);
            try {
              const data = await getCatalogBootstrap(kind);
              setOdooBootstrap(data, kind);
                setBoot(data);
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? "Actualizando…" : "Actualizar catálogo"}
        </Button>
      </div>

      {!sectionList.length ? (
        <>
          <div className="spacer" />
          <div className="muted">
            No hay secciones configuradas todavía. Cargá/actualizá el catálogo
            desde Odoo.
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
                              {p.display_name || p.name}
                            </div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              ID: {p.id}
                              {p.code ? ` · ${p.code}` : ""}
                              {p.alias ? <span> · alias</span> : null}
                            </div>
                          </div>

                          {/* Al store le pasamos name=display_name para que el usuario vea el alias en el presupuesto */}
                          <Button
                            onClick={() =>
                              addLine({
                                ...p,
                                // alias visible
                                name: p.display_name || p.name,
                                // nombre real para PDF
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
