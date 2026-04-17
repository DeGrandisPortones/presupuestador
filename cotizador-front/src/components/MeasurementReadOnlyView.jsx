function text(v) {
  return String(v ?? "").trim();
}
function toNumberLike(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function normalizeTriple(values = []) {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  return arr;
}
function Field({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          minHeight: 42,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e3e3e3",
          background: "#fff",
          whiteSpace: "pre-wrap",
        }}
      >
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function Section({ title, children }) {
  return (
    <div className="card" style={{ background: "#fff", marginBottom: 12, border: "1px solid #eee" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
function buildBudgetSectionsContext(quote, catalog) {
  const sections = Array.isArray(catalog?.sections) ? catalog.sections.slice() : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const lineByProductId = new Map(lines.map((line) => [Number(line?.product_id), line]));
  const byId = {};
  for (const section of sections) {
    byId[Number(section?.id)] = {
      id: Number(section?.id),
      name: String(section?.name || ""),
      selected_products: [],
    };
  }
  for (const product of products) {
    const line = lineByProductId.get(Number(product?.id));
    if (!line) continue;
    const sectionIds = Array.isArray(product?.section_ids) ? product.section_ids : [];
    for (const sectionIdRaw of sectionIds) {
      const sectionId = Number(sectionIdRaw);
      if (!byId[sectionId]) byId[sectionId] = { id: sectionId, name: "", selected_products: [] };
      byId[sectionId].selected_products.push({
        display_name: String(line?.name || product?.display_name || product?.alias || product?.name || "").trim(),
      });
    }
  }
  return byId;
}
function buildBudgetSummaryItems(quote) {
  const byId = buildBudgetSectionsContext(quote, quote?.catalog_bootstrap || {});
  return Object.values(byId)
    .filter((section) => Array.isArray(section?.selected_products) && section.selected_products.length)
    .map((section) => ({
      key: `section-${section.id}`,
      sectionId: Number(section.id),
      sectionName: section.name || `Sección ${section.id}`,
      value: section.selected_products.map((product) => product.display_name).filter(Boolean).join(", "),
    }))
    .sort((a, b) => Number(a.sectionId || 0) - Number(b.sectionId || 0));
}
function sectionDisplayValue(form, item) {
  return text(form?.__budget_section_override?.[item?.sectionId]?.value) || text(item?.value);
}
function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);
  const cellStyle = {
    width: 64,
    minHeight: 28,
    borderRadius: 8,
    border: "1px solid #d8d8d8",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 12,
    padding: "4px 8px",
  };
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 14,
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 12 }}>
        {anchos.map((value, idx) => (
          <div key={`va-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div className="muted" style={{ fontSize: 11 }}>{`Ancho ${idx + 1}`}</div>
            <div style={cellStyle}>{value || "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, justifyContent: "center" }}>
          {altos.map((value, idx) => (
            <div key={`vh-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="muted" style={{ width: 54, fontSize: 11 }}>{`Alto ${idx + 1}`}</div>
              <div style={cellStyle}>{value || "—"}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            width: 230,
            minHeight: 180,
            borderRadius: 18,
            border: "3px solid #64748b",
            background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#475569",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          Esquema del portón
        </div>
      </div>
    </div>
  );
}
function buildTechnicalSummary(quote, form) {
  const kgM2 = toNumberLike(quote?.payload?.dimensions?.kg_m2) || 0;
  const altoFinal = toNumberLike(form?.alto_final_mm) || 0;
  const anchoFinal = toNumberLike(form?.ancho_final_mm) || 0;
  const areaM2 = altoFinal > 0 && anchoFinal > 0 ? (altoFinal * anchoFinal) / 1000000 : 0;
  const pesoAprox = kgM2 > 0 && areaM2 > 0 ? Math.round(areaM2 * kgM2) : 0;
  const tipoPiernas =
    text(quote?.payload?.dimensions?.tipo_piernas) ||
    text(quote?.payload?.tipo_piernas) ||
    text(form?.tipo_piernas) ||
    (anchoFinal > 4500 ? "Piernas dobles" : "Piernas simples");
  return {
    pesoAprox: pesoAprox ? `${pesoAprox} kg` : "",
    tipoPiernas,
    area: areaM2 ? `${areaM2.toFixed(2)} m²` : "",
  };
}
export default function MeasurementReadOnlyView({ quote }) {
  const form = quote?.measurement_form || {};
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const budgetSummaryItems = buildBudgetSummaryItems(quote);
  const technicalSummary = buildTechnicalSummary(quote, form);
  return (
    <div>
      <Section title="Resumen del presupuesto">
        <Row>
          <Field label="Cliente" value={quote?.end_customer?.name} />
          <Field
            label="Vendedor / Distribuidor"
            value={form.distribuidor || quote?.created_by_full_name || quote?.created_by_username}
          />
          <Field
            label="Nota de Venta / NV"
            value={
              form.nota_venta ||
              form.nro_porton ||
              quote?.final_sale_order_name ||
              quote?.odoo_sale_order_name ||
              quote?.quote_number
            }
          />
        </Row>
        <div className="spacer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {budgetSummaryItems.length ? (
            budgetSummaryItems.map((item) => (
              <div key={item.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <b>{item.sectionName} · ID {item.sectionId}:</b> {sectionDisplayValue(form, item) || "—"}
              </div>
            ))
          ) : (
            <div className="muted">Sin datos presupuestados.</div>
          )}
        </div>
      </Section>
      <Section title="Datos del cliente">
        <Row>
          <Field label="Nombre" value={quote?.end_customer?.name || form.cliente_nombre || split.first} />
          <Field label="Apellido" value={form.cliente_apellido || split.last} />
          <Field label="Teléfono" value={end.phone} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Email" value={end.email} />
          <Field label="Localidad" value={end.city} />
          <Field label="Dirección" value={end.address} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Google Maps" value={end.maps_url} />
        </Row>
      </Section>
      <Section title="Datos generales">
        <Row>
          <Field
            label="Fecha de Nota de Pedido"
            value={form.fecha_nota_pedido || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : "")}
          />
          <Field label="Fecha de medición" value={form.fecha} />
          <Field label="Nombre del cliente" value={form.cliente_nombre || split.first} />
          <Field label="Apellido del cliente" value={form.cliente_apellido || split.last} />
        </Row>
      </Section>
      <Section title="Esquema de medidas">
        <MeasurementSchemeVisual form={form} />
        <div className="spacer" />
        <Row>
          <Field label="Alto final (mm)" value={form.alto_final_mm} />
          <Field label="Ancho final (mm)" value={form.ancho_final_mm} />
          <Field label="Peso aproximado" value={technicalSummary.pesoAprox} />
          <Field label="Tipo de piernas" value={technicalSummary.tipoPiernas} />
        </Row>
      </Section>
      <Section title="Observaciones del medidor">
        <Row>
          <Field label="Observaciones" value={form.observaciones_medicion} />
        </Row>
      </Section>
    </div>
  );
}
