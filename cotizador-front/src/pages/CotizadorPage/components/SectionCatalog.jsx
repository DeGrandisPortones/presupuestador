import { useMemo, useState } from "react";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import Input from "../../../ui/Input";
import Button from "../../../ui/Button";
import { getCatalogBootstrap } from "../../../api/catalog.js";

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

export default function SectionCatalog() {
  const addLine = useQuoteStore((s) => s.addLine);

  const [boot, setBoot] = useState(() => getOdooBootstrap());
  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];

  const [selected, setSelected] = useState("all"); // all | unassigned | sectionId
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const sectionList = useMemo(() => {
    // orden fijo por position asc
    const sorted = [...sections].sort((a, b) => (Number(a.position || 0) - Number(b.position || 0)) || String(a.name).localeCompare(String(b.name)));
    return sorted;
  }, [sections]);

  const counts = useMemo(() => {
    const c = new Map();
    let unassigned = 0;
    for (const p of products) {
      const sids = Array.isArray(p.section_ids) ? p.section_ids : [];
      if (!sids.length) unassigned += 1;
      for (const sid of sids) c.set(String(sid), (c.get(String(sid)) || 0) + 1);
    }
    return { bySection: c, unassigned, total: products.length };
  }, [products]);

  const visibleProducts = useMemo(() => {
    const q = normalize(query);
    const filteredBySection = products.filter((p) => {
      const sids = Array.isArray(p.section_ids) ? p.section_ids : [];
      if (selected === "all") return true;
      if (selected === "unassigned") return !sids.length;
      return sids.includes(Number(selected));
    });

    const filtered = !q
      ? filteredBySection
      : filteredBySection.filter((p) => {
          const name = normalize(p.display_name || p.name);
          const raw = normalize(p.name);
          const code = normalize(p.code);
          return name.includes(q) || raw.includes(q) || code.includes(q);
        });

    return filtered;
  }, [products, selected, query]);

  const selectedTitle = useMemo(() => {
    if (selected === "all") return "Todos";
    if (selected === "unassigned") return "Sin sección";
    return sectionList.find((s) => Number(s.id) === Number(selected))?.name || "Sección";
  }, [selected, sectionList]);

  if (!boot) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Catálogo por secciones</h3>
          <Button
            variant="ghost"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try {
                const data = await getCatalogBootstrap();
                setOdooBootstrap(data);
                setBoot(data);
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? "Actualizando…" : "Cargar catálogo"}
          </Button>
        </div>
        <div className="spacer" />
        <div className="muted">Todavía no hay catálogo en el navegador. Podés cargarlo con el botón o cerrando y volviendo a entrar.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Catálogo por secciones</h3>
        <Button
          variant="ghost"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              const data = await getCatalogBootstrap();
              setOdooBootstrap(data);
              setBoot(data);
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? "Actualizando…" : "Actualizar catálogo"}
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, alignItems: "start" }}>
        {/* Secciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            className={selected === "all" ? "navlink active" : "navlink"}
            onClick={() => setSelected("all")}
            type="button"
          >
            Todos <span className="muted">({counts.total})</span>
          </button>

          <button
            className={selected === "unassigned" ? "navlink active" : "navlink"}
            onClick={() => setSelected("unassigned")}
            type="button"
          >
            Sin sección <span className="muted">({counts.unassigned})</span>
          </button>

          {sectionList.map((s) => (
            <button
              key={s.id}
              className={String(selected) === String(s.id) ? "navlink active" : "navlink"}
              onClick={() => setSelected(String(s.id))}
              type="button"
              style={{ textAlign: "left" }}
            >
              {s.name} <span className="muted">({counts.bySection.get(String(s.id)) || 0})</span>
            </button>
          ))}
        </div>

        {/* Productos */}
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Sección: <b>{selectedTitle}</b></div>
          <Input
            value={query}
            onChange={setQuery}
            placeholder="Buscar dentro de la sección (nombre o código)…"
            style={{ width: "100%" }}
          />

          <div className="spacer" />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto", paddingRight: 6 }}>
            {visibleProducts.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  border: "1px solid #eee",
                  padding: 10,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.display_name || p.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    ID: {p.id}{p.code ? ` · ${p.code}` : ""}
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
            {!visibleProducts.length && <div className="muted">Sin productos para mostrar</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
