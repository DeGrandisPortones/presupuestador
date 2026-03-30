function text(v) { return String(v ?? "").trim(); }
function boolLabel(v) { return v === true || String(v || "").toLowerCase() === "si" ? "Sí" : "No"; }
function Field({ label, value }) {
  return <div style={{ flex: 1, minWidth: 220 }}><div className="muted" style={{ marginBottom: 6 }}>{label}</div><div style={{ minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid #e3e3e3", background: "#fff", whiteSpace: "pre-wrap" }}>{value || <span className="muted">—</span>}</div></div>;
}
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function Section({ title, children }) { return <div className="card" style={{ background: "#fff", marginBottom: 12, border: "1px solid #eee" }}><div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>{children}</div>; }
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
export default function MeasurementReadOnlyView({ quote }) {
  const form = quote?.measurement_form || {};
  const end = quote?.end_customer || {};
  const split = splitName(end);
  return (
    <div>
      <Section title="Datos generales">
        <Row>
          <Field label="Nota de Venta / NV" value={form.nota_venta || form.nro_porton || quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number} />
          <Field label="Fecha de Nota de Pedido" value={form.fecha_nota_pedido || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : "")} />
          <Field label="Fecha de medición" value={form.fecha} />
          <Field label="Distribuidor" value={form.distribuidor || quote?.created_by_full_name || quote?.created_by_username} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Nombre del cliente" value={form.cliente_nombre || split.first} />
          <Field label="Apellido del cliente" value={form.cliente_apellido || split.last} />
          <Field label="Teléfono" value={end.phone} />
          <Field label="Localidad" value={end.city} />
        </Row>
      </Section>
      <Section title="Revestimiento">
        <Row>
          <Field label="Tipo revestimiento" value={form.tipo_revestimiento_comercial} />
          <Field label="Fabricante revestimiento" value={form.fabricante_revestimiento} />
          <Field label="Color revestimiento" value={form.color_revestimiento} />
          <Field label="Color sistema" value={form.color_sistema} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Listones" value={form.listones} />
          <Field label="Lucera" value={boolLabel(form.lucera)} />
          <Field label="Cant. de luceras" value={form.lucera ? form.lucera_cantidad : "No aplica"} />
          <Field label="Posición de lucera" value={form.lucera_posicion} />
        </Row>
      </Section>
      <Section title="Puerta / estructura">
        <Row>
          <Field label="Puerta" value={boolLabel(form.puerta)} />
          <Field label="Posición de la puerta" value={form.posicion_puerta || form.lado_puerta} />
          <Field label="Parantes cantidad" value={form.parantes?.cant} />
          <Field label="Parantes distribución" value={form.parantes?.distribucion} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Pasador manual" value={boolLabel(form.pasador_manual)} />
          <Field label="Instalación" value={boolLabel(form.instalacion)} />
          <Field label="Anclaje" value={form.anclaje} />
          <Field label="Piernas" value={form.piernas} />
        </Row>
      </Section>
      <Section title="Rebajes / suelo">
        <Row>
          <Field label="Rebaje" value={boolLabel(form.rebaje)} />
          <Field label="Altura de rebaje" value={form.rebaje_altura} />
          <Field label="Rebaje lateral" value={boolLabel(form.rebaje_lateral)} />
          <Field label="Rebaje inferior" value={boolLabel(form.rebaje_inferior)} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Trampa de tierra" value={boolLabel(form.trampa_tierra)} />
          <Field label="Altura trampa de tierra" value={form.trampa_tierra_altura} />
          <Field label="Observaciones" value={form.observaciones} />
        </Row>
      </Section>
    </div>
  );
}
