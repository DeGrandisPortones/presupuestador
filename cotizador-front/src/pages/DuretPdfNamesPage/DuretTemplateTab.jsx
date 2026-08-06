import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { adminGetDuretPdfTemplate, adminSaveDuretPdfTemplate } from "../../api/admin.js";

const FIELD_STYLE = { width: "100%", padding: 9, borderRadius: 8, border: "1px solid #ddd", fontFamily: "inherit", fontSize: 13 };
const LABEL_STYLE = { display: "block", fontWeight: 700, fontSize: 12, color: "#6B7280", marginBottom: 4 };

function emptyCondicion() { return { label: "", text: "" }; }

// Textos fijos de la propuesta de Duret (todo lo que NO depende de que se
// vendió puntualmente - eso vive en la pestaña "Contenido", ver
// DuretContentTab.jsx). Ver duret_pdf_template en settingsDb.js.
export default function DuretTemplateTab() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);

  const templateQ = useQuery({
    queryKey: ["adminDuretPdfTemplate"],
    queryFn: () => adminGetDuretPdfTemplate(),
  });

  useEffect(() => {
    if (templateQ.data) setDraft(templateQ.data);
  }, [templateQ.data]);

  const saveM = useMutation({
    mutationFn: async (payload) => adminSaveDuretPdfTemplate(payload),
    onSuccess: (saved) => {
      toast.success("Plantilla de Duret guardada");
      qc.setQueryData(["adminDuretPdfTemplate"], saved);
      qc.invalidateQueries({ queryKey: ["adminDuretPdfTemplate"] });
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la plantilla"),
  });

  if (templateQ.isLoading || !draft) {
    return <div className="card muted">Cargando...</div>;
  }
  if (templateQ.isError) {
    return <div className="card" style={{ color: "#d93025", fontSize: 13 }}>{templateQ.error.message}</div>;
  }

  function set(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }
  function setPriceGroupLabel(key, value) {
    setDraft((prev) => ({ ...prev, price_group_labels: { ...(prev.price_group_labels || {}), [key]: value } }));
  }
  function setCondicion(idx, patch) {
    setDraft((prev) => {
      const list = [...(prev.condiciones || [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, condiciones: list };
    });
  }
  function addCondicion() {
    setDraft((prev) => ({ ...prev, condiciones: [...(prev.condiciones || []), emptyCondicion()] }));
  }
  function removeCondicion(idx) {
    setDraft((prev) => ({ ...prev, condiciones: (prev.condiciones || []).filter((_, i) => i !== idx) }));
  }

  return (
    <div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 14 }}>
          Textos fijos de la propuesta de Duret. No dependen de qué se vendió en cada presupuesto puntual (eso se
          configura en la pestaña "Contenido").
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={LABEL_STYLE}>Etiqueta superior (página 1)</label>
            <input style={FIELD_STYLE} value={draft.eyebrow_label} onChange={(e) => set({ eyebrow_label: e.target.value })} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Etiqueta de documento (ej: "Propuesta")</label>
            <input style={FIELD_STYLE} value={draft.document_label} onChange={(e) => set({ document_label: e.target.value })} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL_STYLE}>Título principal</label>
            <input style={FIELD_STYLE} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL_STYLE}>Subtítulo (usá {"{cliente}"} y {"{ubicacion}"} para insertar esos datos del presupuesto)</label>
            <input style={FIELD_STYLE} value={draft.subheadline_template} onChange={(e) => set({ subheadline_template: e.target.value })} />
          </div>

          <div>
            <label style={LABEL_STYLE}>Días de vigencia (si el presupuesto no trae fecha propia)</label>
            <input
              style={FIELD_STYLE}
              type="number"
              min={1}
              value={draft.validity_days}
              onChange={(e) => set({ validity_days: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label style={LABEL_STYLE}>Texto del pie de página</label>
            <input style={FIELD_STYLE} value={draft.footer_label} onChange={(e) => set({ footer_label: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Página 2 — Alcance económico</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={LABEL_STYLE}>Etiqueta superior</label>
            <input style={FIELD_STYLE} value={draft.economico_eyebrow} onChange={(e) => set({ economico_eyebrow: e.target.value })} />
          </div>
          <div>
            <label style={LABEL_STYLE}>Título de "Detalle incluido"</label>
            <input style={FIELD_STYLE} value={draft.detalle_incluido_title} onChange={(e) => set({ detalle_incluido_title: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL_STYLE}>Título</label>
            <input style={FIELD_STYLE} value={draft.economico_headline} onChange={(e) => set({ economico_headline: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL_STYLE}>Bajada</label>
            <textarea
              style={{ ...FIELD_STYLE, minHeight: 50, resize: "vertical" }}
              value={draft.economico_subtext}
              onChange={(e) => set({ economico_subtext: e.target.value })}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL_STYLE}>Texto del recuadro de inversión total (página 1)</label>
            <textarea
              style={{ ...FIELD_STYLE, minHeight: 50, resize: "vertical" }}
              value={draft.investment_box_text}
              onChange={(e) => set({ investment_box_text: e.target.value })}
            />
          </div>
        </div>

        <div className="spacer" />
        <label style={LABEL_STYLE}>Nombres de los 3 grupos de precio</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <input
            style={FIELD_STYLE}
            value={draft.price_group_labels?.grupo_1 || ""}
            onChange={(e) => setPriceGroupLabel("grupo_1", e.target.value)}
            placeholder="Grupo 1 (ej: Fabricación y automatización)"
          />
          <input
            style={FIELD_STYLE}
            value={draft.price_group_labels?.grupo_2 || ""}
            onChange={(e) => setPriceGroupLabel("grupo_2", e.target.value)}
            placeholder="Grupo 2 (ej: Revestimiento y diseño exterior)"
          />
          <input
            style={FIELD_STYLE}
            value={draft.price_group_labels?.grupo_3 || ""}
            onChange={(e) => setPriceGroupLabel("grupo_3", e.target.value)}
            placeholder="Grupo 3 (ej: Servicios de obra y logística)"
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          A qué grupo suma cada producto se define en la pestaña "Contenido", por producto.
        </div>
      </div>

      <div className="spacer" />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Condiciones y aclaraciones</h3>
        <label style={LABEL_STYLE}>Título de la sección</label>
        <input style={{ ...FIELD_STYLE, marginBottom: 12 }} value={draft.condiciones_title} onChange={(e) => set({ condiciones_title: e.target.value })} />

        {(draft.condiciones || []).map((item, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, marginBottom: 10, alignItems: "start" }}>
            <input
              style={FIELD_STYLE}
              value={item.label}
              onChange={(e) => setCondicion(idx, { label: e.target.value })}
              placeholder="Etiqueta (ej: Luceras)"
            />
            <input
              style={FIELD_STYLE}
              value={item.text}
              onChange={(e) => setCondicion(idx, { text: e.target.value })}
              placeholder="Texto"
            />
            <Button variant="ghost" onClick={() => removeCondicion(idx)}>Quitar</Button>
          </div>
        ))}
        <Button variant="secondary" onClick={addCondicion}>+ Agregar condición</Button>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          El PDF agrega automáticamente una última condición con el nombre del vendedor logueado como "Asesor comercial".
        </div>
      </div>

      <div className="spacer" />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" onClick={() => saveM.mutate(draft)} disabled={saveM.isPending}>
          {saveM.isPending ? "Guardando..." : "Guardar plantilla"}
        </Button>
      </div>
    </div>
  );
}
