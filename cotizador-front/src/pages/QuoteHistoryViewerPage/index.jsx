import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getQuoteHistory, searchQuoteHistory } from "../../api/quoteViewer.js";

function text(value) {
  return String(value ?? "").trim();
}
function badgeStyle(bg, border) {
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    fontSize: 12,
    fontWeight: 800,
  };
}
function formatDateTime(value) {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("es-AR");
}
function formatMode(value) {
  return String(value || "").toLowerCase().trim() === "acopio" ? "Acopio" : "Producción";
}
function displayReference(item) {
  return text(item?.reference || item?.final_sale_order_name || item?.odoo_sale_order_name) || "—";
}
function Section({ title, children, right = null }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Field({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff" }}>
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function buildBudgetSummaryItems(history) {
  const original = history?.original_quote || {};
  const catalog = original?.catalog_bootstrap || {};
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const lines = Array.isArray(original?.lines) ? original.lines : [];
  if (!sections.length || !products.length || !lines.length) {
    return lines.map((line, idx) => ({
      key: `line-${idx}`,
      sectionName: "Ítem",
      value: text(line?.name || line?.raw_name || `Producto ${line?.product_id || ""}`),
    }));
  }
  const lineByProductId = new Map(lines.map((line) => [Number(line?.product_id || 0), line]));
  const out = [];
  for (const section of sections) {
    const selected = products
      .filter((product) => Array.isArray(product?.section_ids) && product.section_ids.some((sectionId) => Number(sectionId) === Number(section?.id)))
      .map((product) => lineByProductId.get(Number(product?.id || 0)))
      .filter(Boolean)
      .map((line) => text(line?.name || line?.raw_name));
    if (!selected.length) continue;
    out.push({
      key: `section-${section.id}`,
      sectionName: text(section?.name) || `Sección ${section?.id}`,
      value: selected.join(", "),
    });
  }
  return out;
}
function formatParantesLabel(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  if (raw.toLowerCase() === "verticales") return "Verticales";
  if (raw.toLowerCase() === "horizontal") return "Horizontal";
  if (raw.toLowerCase() === "repartido") return "Repartido";
  if (raw.toLowerCase() === "especial") return "Especial";
  return raw;
}

export default function QuoteHistoryViewerPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [inputRef, setInputRef] = useState("");
  const [searchRef, setSearchRef] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState("");

  const searchQ = useQuery({
    queryKey: ["quoteHistorySearch", searchRef],
    queryFn: () => searchQuoteHistory(searchRef),
    enabled: !!searchRef,
  });

  useEffect(() => {
    if (searchQ.data?.length === 1) {
      setSelectedQuoteId(String(searchQ.data[0].id));
    }
  }, [searchQ.data]);

  const historyQ = useQuery({
    queryKey: ["quoteHistoryDetail", selectedQuoteId],
    queryFn: () => getQuoteHistory(selectedQuoteId),
    enabled: !!selectedQuoteId,
  });

  const history = historyQ.data;
  const budgetSummary = useMemo(() => buildBudgetSummaryItems(history), [history]);

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Visualizador de portones</h2>
          <div className="muted">No tenés permisos para entrar a esta pantalla.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Visualizador de portones</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Buscá por número de pedido o de venta para ver el historial completo del portón.
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver al menú</Button>
        </div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input
            value={inputRef}
            onChange={setInputRef}
            placeholder="Ej: NP5056, NV5056 o 5056"
            style={{ flex: 1, minWidth: 260 }}
          />
          <Button
            onClick={() => {
              const next = text(inputRef);
              if (!next) return;
              setSearchRef(next);
            }}
          >
            Buscar
          </Button>
        </div>

        {searchQ.isError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 10 }}>{searchQ.error.message}</div> : null}
      </div>

      {searchQ.isLoading ? (
        <div className="card"><div className="muted">Buscando portones…</div></div>
      ) : null}

      {!!searchQ.data?.length ? (
        <Section title="Resultados encontrados">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {searchQ.data.map((item) => {
              const selected = String(selectedQuoteId) === String(item.id);
              return (
                <div
                  key={item.id}
                  style={{
                    border: selected ? "2px solid rgba(1,163,159,0.35)" : "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    background: selected ? "rgba(1,163,159,0.06)" : "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedQuoteId(String(item.id))}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{displayReference(item)}</div>
                    <div className="muted">{item.customer_name || "Sin cliente"}</div>
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    Estado: <b>{text(item.status) || "—"}</b> · Final: <b>{text(item.final_status) || "—"}</b> · Modo: <b>{formatMode(item.fulfillment_mode)}</b>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : searchRef && !searchQ.isLoading ? (
        <div className="card"><div className="muted">No se encontraron portones con esa referencia.</div></div>
      ) : null}

      {historyQ.isLoading ? (
        <div className="card"><div className="muted">Cargando historial…</div></div>
      ) : null}

      {history ? (
        <>
          <Section
            title="Estado y referencias"
            right={(
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={badgeStyle("#eef4ff", "#c7dafc")}>Original: {text(history.original_quote?.status) || "—"}</span>
                <span style={badgeStyle("#e7f7ed", "#bfe6c8")}>NV final: {text(history.final_copy?.final_sale_order_name || history.original_quote?.final_sale_order_name) || "—"}</span>
              </div>
            )}
          >
            <Row>
              <Field label="Pedido / referencia original" value={displayReference(history.original_quote)} />
              <Field label="Pedido final" value={text(history.final_copy?.final_sale_order_name || history.original_quote?.final_sale_order_name)} />
              <Field label="Modo" value={formatMode(history.original_quote?.fulfillment_mode)} />
            </Row>
          </Section>

          <Section title="Datos del cliente">
            <Row>
              <Field label="Nombre" value={text(history.customer?.name)} />
              <Field label="Teléfono" value={text(history.customer?.phone)} />
              <Field label="Email" value={text(history.customer?.email)} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Dirección" value={text(history.customer?.address)} />
              <Field label="Localidad" value={text(history.customer?.city)} />
              <Field label="Google Maps" value={text(history.customer?.maps_url)} />
            </Row>
          </Section>

          <Section title="Datos del vendedor / distribuidor">
            <Row>
              <Field label="Usuario" value={text(history.seller?.username)} />
              <Field label="Nombre" value={text(history.seller?.full_name)} />
              <Field label="Rol" value={text(history.seller?.role)} />
            </Row>
          </Section>

          <Section title="Productos presupuestados">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {budgetSummary.length ? budgetSummary.map((item) => (
                <div key={item.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  <b>{item.sectionName}:</b> {item.value || "—"}
                </div>
              )) : <div className="muted">Sin productos visibles.</div>}
            </div>
          </Section>

          <Section title="Datos técnicos">
            <Row>
              <Field label="Alto final (mm)" value={text(history.technical?.alto_final_mm)} />
              <Field label="Ancho final (mm)" value={text(history.technical?.ancho_final_mm)} />
              <Field label="Cantidad de parantes" value={text(history.technical?.cantidad_parantes)} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Orientación de parantes" value={formatParantesLabel(history.technical?.orientacion_parantes)} />
              <Field label="Distribución de parantes" value={formatParantesLabel(history.technical?.distribucion_parantes)} />
              <Field label="Observaciones de parantes" value={text(history.technical?.observaciones_parantes)} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Observaciones de medición" value={text(history.technical?.observaciones_medicion)} />
            </Row>
          </Section>

          <Section title="Puertas vinculadas">
            {history.linked_doors?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Estado</th>
                    <th>Venta Odoo</th>
                    <th>Compra Odoo</th>
                  </tr>
                </thead>
                <tbody>
                  {history.linked_doors.map((door) => (
                    <tr key={door.id}>
                      <td>{door.door_code || "—"}</td>
                      <td>{door.status || "—"}</td>
                      <td>{door.odoo_sale_order_name || "—"}</td>
                      <td>{door.odoo_purchase_order_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">No hay puertas vinculadas.</div>
            )}
          </Section>

          <Section title="Historial completo">
            {history.timeline?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.timeline.map((event) => (
                  <div key={event.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 800 }}>{event.title}</div>
                      <div className="muted">{formatDateTime(event.at)}</div>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {event.reference ? `${event.reference} · ` : ""}{event.customer || "Sin cliente"}
                    </div>
                    {event.description ? <div style={{ marginTop: 6 }}>{event.description}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No hay eventos para mostrar.</div>
            )}
          </Section>
        </>
      ) : null}
    </div>
  );
}
