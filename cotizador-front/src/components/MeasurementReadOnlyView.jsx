const SCHEME_RECT_PCTS = {
  alto: [
    { left: 9.22, top: 43.73, width: 14.4, height: 14.24 },
    { left: 27.02, top: 43.73, width: 14.4, height: 14.24 },
    { left: 44.5, top: 43.73, width: 14.24, height: 14.24 },
  ],
  ancho: [
    { left: 71.36, top: 22.71, width: 14.4, height: 14.24 },
    { left: 71.36, top: 48.14, width: 14.4, height: 13.9 },
    { left: 71.36, top: 82.71, width: 14.4, height: 14.24 },
  ],
};
const schemeOverlayBaseStyle = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  color: "#111",
  textShadow: "0 1px 0 rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.55)",
  borderRadius: 6,
  pointerEvents: "none",
};
function text(v) { return String(v ?? "").trim(); }
function toNumberLike(value) { const n = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function averageMm(values = []) { const nums = (Array.isArray(values) ? values : []).map((item) => toNumberLike(item)).filter((item) => item > 0); if (!nums.length) return 0; return Math.round(nums.reduce((acc, item) => acc + item, 0) / nums.length); }
function formatApproxWeight(weightKg) { const value = Number(weightKg || 0); return value > 0 ? `${Math.round(value)} kg` : "—"; }
function findTipoPiernas(form, budgetSummaryItems = []) { const match = (Array.isArray(budgetSummaryItems) ? budgetSummaryItems : []).find((item) => `${item?.sectionName || ""} ${item?.value || ""}`.toLowerCase().match(/pierna|parante|soporte/)); if (match?.value) return String(match.value).trim(); const parantes = text(form?.parantes?.cant); return parantes || "—"; }
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
export default function MeasurementReadOnlyView({ quote }) {
  const form = quote?.measurement_form || {};
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const budgetSummaryItems = buildBudgetSummaryItems(quote);
  const finalHeight = toNumberLike(form?.alto_final_mm) || averageMm(form?.esquema?.alto || []);
  const finalWidth = toNumberLike(form?.ancho_final_mm) || averageMm(form?.esquema?.ancho || []);
  const kgM2 = toNumberLike(quote?.payload?.dimensions?.kg_m2);
  const surfaceM2 = finalHeight > 0 && finalWidth > 0 ? (finalHeight * finalWidth) / 1000000 : 0;
  const approxWeightLabel = formatApproxWeight(kgM2 > 0 && surfaceM2 > 0 ? kgM2 * surfaceM2 : 0);
  const tipoPiernas = findTipoPiernas(form, budgetSummaryItems);
  return (
    <div>
      <Section title="Resumen del presupuesto">
        <Row>
          <Field label="Cliente" value={quote?.end_customer?.name} />
          <Field label="Vendedor / Distribuidor" value={form.distribuidor || quote?.created_by_full_name || quote?.created_by_username} />
          <Field label="Nota de Venta / NV" value={form.nota_venta || form.nro_porton || quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number} />
        </Row>
        <div className="spacer" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {budgetSummaryItems.length ? budgetSummaryItems.map((item) => (
            <div key={item.key} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <b>{item.sectionName} · ID {item.sectionId}:</b> {sectionDisplayValue(form, item) || "—"}
            </div>
          )) : <div className="muted">Sin datos presupuestados.</div>}
        </div>
      </Section>
      <Section title="Datos generales">
        <Row>
          <Field label="Fecha de Nota de Pedido" value={form.fecha_nota_pedido || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : "")} />
          <Field label="Fecha de medición" value={form.fecha} />
          <Field label="Nombre del cliente" value={form.cliente_nombre || split.first} />
          <Field label="Apellido del cliente" value={form.cliente_apellido || split.last} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Teléfono" value={end.phone} />
          <Field label="Localidad" value={end.city} />
          <Field label="Google Maps" value={end.maps_url} />
        </Row>
      </Section>
      <Section title="Resumen técnico del portón">
        <Row>
          <Field label="Alto final calculado (mm)" value={finalHeight ? String(Math.round(finalHeight)) : "—"} />
          <Field label="Ancho final calculado (mm)" value={finalWidth ? String(Math.round(finalWidth)) : "—"} />
          <Field label="Peso aproximado" value={approxWeightLabel} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Tipo de piernas" value={tipoPiernas} />
          <Field label="Kg/m²" value={kgM2 > 0 ? `${kgM2}` : "—"} />
          <Field label="Superficie final aprox." value={surfaceM2 > 0 ? `${surfaceM2.toFixed(2)} m²` : "—"} />
        </Row>
      </Section>
      <Section title="Esquema de medidas">
        <Row>
          <Field label="Alto final (mm)" value={form.alto_final_mm} />
          <Field label="Ancho final (mm)" value={form.ancho_final_mm} />
          <Field label="Altos" value={(Array.isArray(form.esquema?.alto) ? form.esquema.alto : []).filter(Boolean).join(" / ")} />
          <Field label="Anchos" value={(Array.isArray(form.esquema?.ancho) ? form.esquema.ancho : []).filter(Boolean).join(" / ")} />
        </Row>
        <div className="spacer" />
        <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto" }}>
          <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
          {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
            <div key={`overlay-alto-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
              {form?.esquema?.alto?.[idx] || ""}
            </div>
          ))}
          {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
            <div key={`overlay-ancho-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
              {form?.esquema?.ancho?.[idx] || ""}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
