import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { adminGetBudgetSections, adminSetBudgetSection } from "../../api/admin.js";

const SECTION_INDEXES = [1, 2, 3];

function emptyDrafts() {
  return { 1: { name: "", template: "" }, 2: { name: "", template: "" }, 3: { name: "", template: "" } };
}

export default function BudgetSectionsTab({ catalogKind }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState(emptyDrafts());
  const [savingIndex, setSavingIndex] = useState(null);

  const sectionsQ = useQuery({
    queryKey: ["adminBudgetSections", catalogKind],
    queryFn: () => adminGetBudgetSections(catalogKind),
    enabled: !!catalogKind,
  });

  useEffect(() => {
    const next = emptyDrafts();
    for (const section of sectionsQ.data?.sections || []) {
      const idx = Number(section.section_index);
      if (next[idx]) next[idx] = { name: section.name || "", template: section.template || "" };
    }
    setDrafts(next);
  }, [sectionsQ.data]);

  const catalogSections = sectionsQ.data?.catalog_sections || [];

  async function copyToken(sectionId) {
    const token = `$id${sectionId}`;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      window.prompt("Copiá este token", token);
    }
  }

  async function saveSection(sectionIndex) {
    setSavingIndex(sectionIndex);
    try {
      await adminSetBudgetSection(catalogKind, sectionIndex, drafts[sectionIndex]);
      qc.invalidateQueries({ queryKey: ["adminBudgetSections", catalogKind] });
      alert(`Sección ${sectionIndex} guardada.`);
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Secciones del presupuesto (PDF)</h3>
      <div className="muted">
        Armá hasta 3 secciones que reemplazan el listado plano de productos en el PDF. Cada sección se imprime como
        una sola fila: un título y un párrafo armado a partir de la plantilla, con el precio sumado de los productos
        que la componen. Los productos que no queden cubiertos por ninguna plantilla se siguen listando sueltos, como
        hoy.
      </div>
      <div className="spacer" />

      <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fafafa" }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Tokens disponibles para {catalogKind}</div>
        <div className="muted" style={{ marginBottom: 8 }}>
          Insertá <code>$id&lt;N&gt;</code> en la plantilla: se reemplaza por el producto elegido en esa sección del
          catálogo para ese presupuesto puntual. Si no hubo selección ahí, el token desaparece.
        </div>
        {sectionsQ.isLoading ? <div className="muted">Cargando secciones del catálogo...</div> : null}
        {!sectionsQ.isLoading && !catalogSections.length ? (
          <div className="muted">Este catálogo todavía no tiene secciones configuradas (pestaña "Etiquetas → Secciones").</div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {catalogSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => copyToken(section.id)}
              title="Copiar token"
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <b>{`$id${section.id}`}</b> · {section.name}
            </button>
          ))}
        </div>
      </div>

      <div className="spacer" />

      {sectionsQ.isError ? <div style={{ color: "#d93025" }}>{sectionsQ.error?.message || "No se pudo cargar"}</div> : null}

      {SECTION_INDEXES.map((sectionIndex) => (
        <div key={sectionIndex} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Sección {sectionIndex}</div>
          <div className="muted" style={{ marginBottom: 4 }}>Nombre (título en negrita que se imprime en el PDF)</div>
          <Input
            value={drafts[sectionIndex]?.name || ""}
            onChange={(value) => setDrafts((prev) => ({ ...prev, [sectionIndex]: { ...prev[sectionIndex], name: value } }))}
            placeholder="Ej: Productos"
            style={{ width: "100%" }}
          />
          <div className="spacer" />
          <div className="muted" style={{ marginBottom: 4 }}>Plantilla (texto con $id&lt;N&gt;)</div>
          <textarea
            value={drafts[sectionIndex]?.template || ""}
            onChange={(event) => setDrafts((prev) => ({ ...prev, [sectionIndex]: { ...prev[sectionIndex], template: event.target.value } }))}
            placeholder="Ej: $id3000 revestimiento en $id3001 color $id3002. Acero galvanizado, pintura en polvo epoxi..."
            rows={4}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd", fontFamily: "inherit", resize: "vertical" }}
          />
          <div className="spacer" />
          <Button variant="primary" disabled={savingIndex === sectionIndex} onClick={() => saveSection(sectionIndex)}>
            {savingIndex === sectionIndex ? "Guardando..." : "Guardar sección"}
          </Button>
        </div>
      ))}
    </div>
  );
}
