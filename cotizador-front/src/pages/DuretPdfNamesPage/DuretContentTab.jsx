import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import Button from "../../ui/Button.jsx";
import { adminGetProductPdfContent, adminSetProductPdfContent, adminGetDuretPdfTemplate } from "../../api/admin.js";

const EMPTY_DRAFT = { section_title: "", section_order: "100", block_title: "", block_description: "", price_group: "", tag: "", detail_bullet: "" };

function buildSearchText(item = {}) {
  return [item?.product_id, item?.odoo_id, item?.odoo_name, item?.presupuestador_name, item?.alias, item?.section_title, item?.block_title, item?.tag]
    .join(" ")
    .toLowerCase();
}
function isConfigured(item = {}) {
  return !!(item.section_title || item.block_title || item.block_description || item.price_group || item.tag || item.detail_bullet);
}
function toDraft(item = {}) {
  return {
    section_title: String(item.section_title || ""),
    section_order: String(item.section_order ?? "100"),
    block_title: String(item.block_title || ""),
    block_description: String(item.block_description || ""),
    price_group: String(item.price_group || ""),
    tag: String(item.tag || ""),
    detail_bullet: String(item.detail_bullet || ""),
  };
}

const FIELD_STYLE = { width: "100%", padding: 9, borderRadius: 8, border: "1px solid #ddd", fontFamily: "inherit", fontSize: 13 };
const LABEL_STYLE = { display: "block", fontWeight: 700, fontSize: 12, color: "#6B7280", marginBottom: 4 };

// Contenido "rico" por producto (marca Duret): a diferencia de "Nombres PDF"
// (un nombre plano por producto), acá se arma la seccion de "solucion
// propuesta", el grupo de precio del desglose economico y los chips/bullets
// del PDF - todo por producto, para que la propuesta se arme sola segun lo
// que cada presupuesto realmente incluya. Ver presupuestador_product_pdf_content
// en catalogDb.js y renderDuretPresupuestoPdf en routes/pdf.routes.js.
export default function DuretContentTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState("porton");
  const [q, setQ] = useState("");
  const [onlyConfigured, setOnlyConfigured] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});

  const itemsQ = useQuery({
    queryKey: ["adminDuretProductContent", kind],
    queryFn: () => adminGetProductPdfContent(kind, "duret"),
  });
  const templateQ = useQuery({
    queryKey: ["adminDuretPdfTemplate"],
    queryFn: () => adminGetDuretPdfTemplate(),
  });

  useEffect(() => {
    const next = {};
    for (const item of (itemsQ.data || [])) next[String(item.product_id)] = toDraft(item);
    setDrafts(next);
  }, [itemsQ.data]);

  const saveM = useMutation({
    mutationFn: async ({ productId, payload }) => adminSetProductPdfContent(kind, productId, payload, "duret"),
    onSuccess: (_saved, variables) => {
      toast.success(`Contenido guardado (producto ${variables.productId})`);
      qc.invalidateQueries({ queryKey: ["adminDuretProductContent", kind] });
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar"),
  });

  const priceGroupOptions = useMemo(() => {
    const labels = templateQ.data?.price_group_labels || {};
    return [
      { value: "", label: "— Sin grupo (va a \"Otros conceptos\") —" },
      { value: "grupo_1", label: labels.grupo_1 || "Grupo 1" },
      { value: "grupo_2", label: labels.grupo_2 || "Grupo 2" },
      { value: "grupo_3", label: labels.grupo_3 || "Grupo 3" },
    ];
  }, [templateQ.data]);

  const filtered = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();
    let source = Array.isArray(itemsQ.data) ? itemsQ.data : [];
    if (onlyConfigured) source = source.filter(isConfigured);
    if (!needle) return source;
    return source.filter((item) => buildSearchText(item).includes(needle));
  }, [itemsQ.data, q, onlyConfigured]);

  function updateDraft(productId, patch) {
    setDrafts((prev) => ({ ...prev, [productId]: { ...(prev[productId] || EMPTY_DRAFT), ...patch } }));
  }

  function saveProduct(productId) {
    const draft = drafts[productId] || EMPTY_DRAFT;
    const orderNum = Number(draft.section_order);
    saveM.mutate({
      productId,
      payload: {
        section_title: draft.section_title,
        section_order: Number.isFinite(orderNum) && orderNum > 0 ? orderNum : 100,
        block_title: draft.block_title,
        block_description: draft.block_description,
        price_group: draft.price_group,
        tag: draft.tag,
        detail_bullet: draft.detail_bullet,
      },
    });
  }

  function clearProduct(productId) {
    setDrafts((prev) => ({ ...prev, [productId]: { ...EMPTY_DRAFT } }));
    saveM.mutate({ productId, payload: {} });
  }

  return (
    <div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 10 }}>
          Por cada producto definís en qué sección de "La solución propuesta" aparece, a qué grupo del desglose
          económico suma su importe, y qué chip/bullet aporta. Un producto sin nada configurado simplemente no
          agrega sección/chip/bullet propio, y su importe cae en "Otros conceptos".
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Button variant={kind === "porton" ? "primary" : "ghost"} onClick={() => setKind("porton")}>Portón</Button>
          <Button variant={kind === "ipanel" ? "primary" : "ghost"} onClick={() => setKind("ipanel")}>Ipanel</Button>
          <Button variant={kind === "otros" ? "primary" : "ghost"} onClick={() => setKind("otros")}>Otros</Button>
          <Button variant="secondary" onClick={() => itemsQ.refetch()} disabled={itemsQ.isFetching}>
            {itemsQ.isFetching ? "Actualizando..." : "Actualizar"}
          </Button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ID, nombre Odoo, alias, sección o tag..."
            style={{ flex: 1, minWidth: 260, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={onlyConfigured} onChange={(e) => setOnlyConfigured(e.target.checked)} />
            Solo configurados
          </label>
          <div className="muted">{filtered.length} producto(s)</div>
        </div>
      </div>

      <div className="spacer" />

      {itemsQ.isLoading ? <div className="card muted">Cargando...</div> : null}
      {itemsQ.isError ? <div className="card" style={{ color: "#d93025", fontSize: 13 }}>{itemsQ.error.message}</div> : null}
      {!itemsQ.isLoading && !itemsQ.isError && !filtered.length ? <div className="card muted">Sin productos para mostrar.</div> : null}

      {filtered.map((item) => {
        const productId = String(item.product_id);
        const draft = drafts[productId] || EMPTY_DRAFT;
        const isOpen = !!expanded[productId];
        const configured = isConfigured(item);
        return (
          <div key={`${kind}-${productId}`} className="card" style={{ marginBottom: 10 }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => setExpanded((prev) => ({ ...prev, [productId]: !prev[productId] }))}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {item.presupuestador_name || item.odoo_name || `Producto ${productId}`}
                  {configured ? (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#0a7", border: "1px solid #0a7", borderRadius: 999, padding: "1px 8px" }}>
                      configurado
                    </span>
                  ) : null}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  ID {productId} · {item.section_title ? `Sección: ${item.section_title}` : "Sin sección"}
                  {item.tag ? ` · Tag: ${item.tag}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 20, color: "#999" }}>{isOpen ? "▾" : "▸"}</div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div>
                  <label style={LABEL_STYLE}>Título de sección ("La solución propuesta")</label>
                  <input
                    style={FIELD_STYLE}
                    value={draft.section_title}
                    onChange={(e) => updateDraft(productId, { section_title: e.target.value })}
                    placeholder="Ej: Estructura, Automatización, Diseño, Acceso peatonal"
                  />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Orden de sección</label>
                  <input
                    style={FIELD_STYLE}
                    type="number"
                    value={draft.section_order}
                    onChange={(e) => updateDraft(productId, { section_order: e.target.value })}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LABEL_STYLE}>Título del bloque</label>
                  <input
                    style={FIELD_STYLE}
                    value={draft.block_title}
                    onChange={(e) => updateDraft(productId, { block_title: e.target.value })}
                    placeholder={item.presupuestador_name || item.odoo_name || "Título a mostrar"}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LABEL_STYLE}>Descripción del bloque</label>
                  <textarea
                    style={{ ...FIELD_STYLE, minHeight: 60, resize: "vertical" }}
                    value={draft.block_description}
                    onChange={(e) => updateDraft(productId, { block_description: e.target.value })}
                    placeholder="Texto corto tipo marketing, 1-2 líneas."
                  />
                </div>

                <div>
                  <label style={LABEL_STYLE}>Grupo de precio (desglose económico)</label>
                  <select
                    style={FIELD_STYLE}
                    value={draft.price_group}
                    onChange={(e) => updateDraft(productId, { price_group: e.target.value })}
                  >
                    {priceGroupOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LABEL_STYLE}>Tag (chip)</label>
                  <input
                    style={FIELD_STYLE}
                    value={draft.tag}
                    onChange={(e) => updateDraft(productId, { tag: e.target.value })}
                    placeholder="Ej: Automatizado"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LABEL_STYLE}>Bullet de "Detalle incluido"</label>
                  <input
                    style={FIELD_STYLE}
                    value={draft.detail_bullet}
                    onChange={(e) => updateDraft(productId, { detail_bullet: e.target.value })}
                    placeholder="Ej: Motorreductor con 2 controles remotos."
                  />
                </div>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <Button variant="ghost" onClick={() => clearProduct(productId)} disabled={saveM.isPending}>Limpiar</Button>
                  <Button variant="primary" onClick={() => saveProduct(productId)} disabled={saveM.isPending}>Guardar</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
