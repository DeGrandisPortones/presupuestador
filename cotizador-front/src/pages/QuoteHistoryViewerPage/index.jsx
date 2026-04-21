import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getQuoteViewer } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function text(v) {
  return String(v ?? "").trim();
}
function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("es-AR");
}
function formatJson(value) {
  if (!value || typeof value !== "object") return "";
  return JSON.stringify(value, null, 2);
}
function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function Field({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", whiteSpace: "pre-wrap" }}>
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}
function ItemsTable({ lines = [] }) {
  if (!Array.isArray(lines) || !lines.length) return <div className="muted">Sin ítems.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th className="right">ID</th>
            <th className="right">Cant.</th>
            <th className="right">Base</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={`${line?.product_id || "x"}-${idx}`}>
              <td>{text(line?.name || line?.raw_name || `Producto ${line?.product_id || idx + 1}`)}</td>
              <td className="right">{text(line?.product_id)}</td>
              <td className="right">{text(line?.qty)}</td>
              <td className="right">{text(line?.basePrice ?? line?.base_price ?? line?.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function CandidateList({ matches = [], onSelect }) {
  if (!matches.length) return null;
  return (
    <Section title="Coincidencias encontradas">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {matches.map((item) => (
          <div key={item.quote_id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontWeight: 800 }}>{item.client_name || "Sin cliente"}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              NP: <b>{item.np || "—"}</b> · NV: <b>{item.nv || "—"}</b> · Estado: <b>{item.current_state || "—"}</b>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              Vendedor: <b>{item.seller_name || "—"}</b> · Coincidencia: <b>{item.match_type || "—"}</b>
            </div>
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={() => onSelect(item.quote_id)}>Ver historial completo</Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export default function QuoteHistoryViewerPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchInput, setSearchInput] = useState("");
  const [queryState, setQueryState] = useState({ reference: "", quoteId: "" });

  const q = useQuery({
    queryKey: ["quote-history-viewer", queryState.reference, queryState.quoteId],
    queryFn: () => getQuoteViewer({ reference: queryState.reference, quoteId: queryState.quoteId }),
    enabled: !!(queryState.reference || queryState.quoteId),
    staleTime: 30 * 1000,
  });

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ color: "#d93025" }}>No autorizado.</div>
        </div>
      </div>
    );
  }

  const viewer = q.data?.viewer || null;
  const matches = Array.isArray(q.data?.matches) ? q.data.matches : [];
  const original = viewer?.original_quote || null;
  const finalCopy = viewer?.final_copy || null;
  const customer = viewer?.customer || {};
  const seller = viewer?.seller || {};
  const status = viewer?.status || {};
  const technical = viewer?.technical || {};
  const documents = viewer?.documents || {};
  const linkedDoors = Array.isArray(viewer?.linked_doors) ? viewer.linked_doors : [];
  const timeline = Array.isArray(viewer?.timeline) ? viewer.timeline : [];

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Visualizador de historial de portón</h2>
            <div className="muted" style={{ marginTop: 6 }}>Buscá por número de pedido o número de venta.</div>
          </div>
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>

      <Section title="Buscar portón">
        <Row>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Número de pedido / número de venta</div>
            <Input
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Ej: NP5056, NV5056 o 5056"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Button onClick={() => setQueryState({ reference: text(searchInput), quoteId: "" })} disabled={!text(searchInput) || q.isFetching}>
              {q.isFetching ? "Buscando..." : "Buscar"}
            </Button>
            <Button variant="secondary" onClick={() => { setSearchInput(""); setQueryState({ reference: "", quoteId: "" }); }}>
              Limpiar
            </Button>
          </div>
        </Row>
        {q.isError ? <div style={{ color: "#d93025", marginTop: 10 }}>{q.error?.message || "No se pudo buscar el portón"}</div> : null}
      </Section>

      {!viewer && matches.length > 1 ? (
        <CandidateList matches={matches} onSelect={(quoteId) => setQueryState({ reference: "", quoteId: String(quoteId) })} />
      ) : null}

      {viewer ? (
        <>
          <Section title="Estado y referencias">
            <Row>
              <Field label="Estado actual" value={viewer.current_state} />
              <Field label="Número de pedido" value={documents.presupuesto_original} />
              <Field label="Número de venta" value={documents.venta_final} />
              <Field label="Número interno" value={documents.numero_interno} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Estado del presupuesto" value={status.quote_status} />
              <Field label="Destino" value={status.fulfillment_mode} />
              <Field label="Aprobación comercial" value={status.commercial_decision} />
              <Field label="Aprobación técnica" value={status.technical_decision} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Estado de medición" value={status.measurement_status} />
              <Field label="Solicitud Acopio → Producción" value={status.acopio_to_produccion_status} />
              <Field label="ID presupuesto" value={documents.presupuesto_id} />
              <Field label="ID ajuste final" value={documents.ajuste_final_id} />
            </Row>
          </Section>

          <Section title="Datos del cliente">
            <Row>
              <Field label="Nombre" value={customer.name} />
              <Field label="Teléfono" value={customer.phone} />
              <Field label="Email" value={customer.email} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Dirección" value={customer.address} />
              <Field label="Localidad" value={customer.city} />
              <Field label="Maps" value={customer.maps_url} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Facturación" value={formatJson(original?.payload?.billing_customer || {})} />
            </Row>
          </Section>

          <Section title="Datos del vendedor / distribuidor">
            <Row>
              <Field label="Rol" value={seller.created_by_role} />
              <Field label="Nombre" value={seller.name} />
              <Field label="Usuario" value={seller.username} />
              <Field label="Partner Odoo" value={seller.bill_to_odoo_partner_id} />
            </Row>
          </Section>

          <Section title="Datos técnicos">
            <Row>
              <Field label="Ancho presupuestado (m)" value={technical.ancho_presupuestado_m} />
              <Field label="Alto presupuestado (m)" value={technical.alto_presupuestado_m} />
              <Field label="Alto final (mm)" value={technical.alto_final_mm} />
              <Field label="Ancho final (mm)" value={technical.ancho_final_mm} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Cantidad de parantes" value={technical.cantidad_parantes} />
              <Field label="Orientación de parantes" value={technical.orientacion_parantes} />
              <Field label="Distribución de parantes" value={technical.distribucion_parantes} />
              <Field label="Fecha de medición" value={technical.fecha_medicion} />
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Obs. distribución parantes" value={technical.observaciones_parantes} />
              <Field label="Obs. medición" value={technical.observaciones_medicion} />
              <Field label="Aceptación cliente" value={technical.acceptance_full_name ? `${technical.acceptance_full_name} · DNI ${technical.acceptance_dni}` : ""} />
              <Field label="Fecha aceptación cliente" value={formatDateTime(technical.acceptance_at)} />
            </Row>
          </Section>

          <Section title="Ítems del presupuesto original">
            <ItemsTable lines={original?.lines || []} />
          </Section>

          <Section title="Ítems finales / fabricación">
            <ItemsTable lines={finalCopy?.lines || technical.final_copy_lines || []} />
          </Section>

          <Section title="Puertas vinculadas">
            {linkedDoors.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {linkedDoors.map((door) => (
                  <div key={door.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 800 }}>{text(door.door_code) || `Puerta ${door.id}`}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Estado: <b>{text(door.status)}</b> · Venta Odoo: <b>{text(door.odoo_sale_order_name) || "—"}</b> · Compra Odoo: <b>{text(door.odoo_purchase_order_name) || "—"}</b>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">Sin puertas vinculadas.</div>
            )}
          </Section>

          <Section title="Historial completo">
            {timeline.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {timeline.map((event, idx) => (
                  <div key={`${event.when}-${idx}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                    <div style={{ fontWeight: 800 }}>{event.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {formatDateTime(event.when)} · {event.section}
                    </div>
                    {event.description ? <div style={{ marginTop: 6 }}>{event.description}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">Sin historial disponible.</div>
            )}
          </Section>

          <Section title="JSON técnico / diagnóstico">
            <Row>
              <Field label="Measurement form" value={formatJson(technical.measurement_form)} />
              <Field label="Dimensiones payload" value={formatJson(technical.payload_dimensions)} />
            </Row>
          </Section>
        </>
      ) : null}
    </div>
  );
}
