function text(v) {
  return String(v ?? "").trim();
}
function toNumberLike(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function normalizeTriple(values = []) {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  return arr;
}
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
  background: "rgba(255,255,255,0.65)",
  borderRadius: 6,
  pointerEvents: "none",
  border: "1px solid rgba(15,23,42,0.12)",
};

function Field({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
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
function getBudgetProductIdSet(quote) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  return new Set(lines.map((line) => Number(line?.product_id || 0)).filter(Boolean));
}
function detectInstallationModeByProducts(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  const insideId = Number(surfaceParameters?.installation_inside_product_id || 0);
  const behindId = Number(surfaceParameters?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}
function detectNoCladding(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  const noCladdingId = Number(surfaceParameters?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}
function normalizeAptoKgM2Rules(surfaceParameters) {
  return (Array.isArray(surfaceParameters?.apto_revestir_kg_m2_rules)
    ? surfaceParameters.apto_revestir_kg_m2_rules
    : [])
    .map((rule) => ({ product_id: Number(rule?.product_id || 0), kg_m2: toNumberLike(rule?.kg_m2) }))
    .filter((rule) => rule.product_id > 0 && Number.isFinite(rule.kg_m2) && rule.kg_m2 > 0);
}
function resolveAptoKgM2ByProducts(quote, surfaceParameters) {
  const ids = getBudgetProductIdSet(quote);
  for (const rule of normalizeAptoKgM2Rules(surfaceParameters)) {
    if (ids.has(rule.product_id)) return Number(rule.kg_m2 || 0);
  }
  return 0;
}
function resolveSellerKgM2Entry(quote, surfaceParameters) {
  const payload = quote?.payload || {};
  const candidates = [];
  if (surfaceParameters?.seller_kg_m2_field_path) candidates.push(surfaceParameters.seller_kg_m2_field_path);
  candidates.push("kg_m2_entry", "kg_m2", "entry_kg_m2", "custom_kg_m2", "peso_m2", "payload.kg_m2_entry");
  for (const path of candidates) {
    const value = path.includes(".")
      ? path.replace(/^payload\./, "").split(".").filter(Boolean).reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), payload)
      : payload?.[path];
    const n = toNumberLike(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
function detectDoorType(quote) {
  const payloadType = String(quote?.payload?.porton_type || quote?.payload?.tipo_porton || "").trim().toLowerCase();
  if (payloadType.includes("inyect") || payloadType.includes("doble_iny") || payloadType.includes("iny")) return "inyectado";
  if (payloadType.includes("clas")) return "clasico";
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const hay = lines.map((l) => String(l?.name || l?.raw_name || "").toLowerCase()).join(" ");
  if (hay.includes("inyect") || hay.includes("doble_iny") || hay.includes("iny")) return "inyectado";
  return "clasico";
}
function getLegWidthMmByType(piernasTipo) {
  const map = { angostas: 230, comunes: 270, anchas: 370, superanchas: 370, especiales: 370 };
  return Number(map[String(piernasTipo || "").trim().toLowerCase()] || 0);
}
function minMm(values = []) {
  const nums = (Array.isArray(values) ? values : []).map((v) => toNumberLike(v)).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : 0;
}
function computeAutomaticSummary({ quote, form, surfaceParameters = {} }) {
  const budgetHeightMm = Math.round(toNumberLike(quote?.payload?.dimensions?.height) * 1000) || 0;
  const budgetWidthMm = Math.round(toNumberLike(quote?.payload?.dimensions?.width) * 1000) || 0;
  const altos = Array.isArray(form?.esquema?.alto) ? form.esquema.alto : [];
  const anchos = Array.isArray(form?.esquema?.ancho) ? form.esquema.ancho : [];
  const altoMinMm = minMm(altos) || budgetHeightMm;
  const anchoMinMm = minMm(anchos) || budgetWidthMm;
  const installationMode = detectInstallationModeByProducts(quote, surfaceParameters);
  const noCladding = detectNoCladding(quote, surfaceParameters);
  const tipoPorton = detectDoorType(quote);
  const sellerKgM2Entry = resolveSellerKgM2Entry(quote, surfaceParameters);
  const aptoKgM2RuleValue = noCladding ? resolveAptoKgM2ByProducts(quote, surfaceParameters) : 0;
  const defaultKgM2Porton = tipoPorton === "inyectado"
    ? Number(surfaceParameters?.injected_kg_m2 || 25)
    : Number(surfaceParameters?.classic_kg_m2 || 15);
  const kgM2Porton = noCladding
    ? (aptoKgM2RuleValue > 0 ? aptoKgM2RuleValue : (sellerKgM2Entry > 0 ? sellerKgM2Entry : defaultKgM2Porton))
    : (installationMode === "sin_instalacion" ? (sellerKgM2Entry > 0 ? sellerKgM2Entry : defaultKgM2Porton) : defaultKgM2Porton);

  const heightDiscountMm = Number(surfaceParameters?.weight_height_discount_mm || 10);
  const widthDiscountMm = Number(surfaceParameters?.weight_width_discount_mm || 14);
  const baseHeightForWeightMm = installationMode === "sin_instalacion" ? budgetHeightMm : altoMinMm;
  const baseWidthForWeightMm = installationMode === "sin_instalacion" ? budgetWidthMm : anchoMinMm;
  const discountedHeightMm = Math.max(0, baseHeightForWeightMm - heightDiscountMm);
  const discountedWidthMm = Math.max(0, baseWidthForWeightMm - widthDiscountMm);
  const pesoEstimadoKg = round2((discountedHeightMm / 1000) * (discountedWidthMm / 1000) * kgM2Porton);

  const limitAngostas = noCladding
    ? Number(surfaceParameters?.no_cladding_angostas_max_kg || 80)
    : Number(surfaceParameters?.legs_angostas_max_kg || 140);
  const limitComunes = Number(surfaceParameters?.legs_comunes_max_kg || 175);
  const limitAnchas = Number(surfaceParameters?.legs_anchas_max_kg || 240);
  const limitSuperanchas = Number(surfaceParameters?.legs_superanchas_max_kg || 300);

  let piernasTipo = "angostas";
  if (pesoEstimadoKg > limitSuperanchas) piernasTipo = "especiales";
  else if (pesoEstimadoKg > limitAnchas) piernasTipo = "superanchas";
  else if (pesoEstimadoKg > limitComunes) piernasTipo = "anchas";
  else if (pesoEstimadoKg > limitAngostas) piernasTipo = "comunes";

  let altoCalculadoMm = discountedHeightMm;
  let anchoCalculadoMm = discountedWidthMm;
  if (installationMode === "detras_vano") {
    altoCalculadoMm = Math.max(0, altoMinMm + Number(surfaceParameters?.behind_vano_add_height_mm || 100));
    const addMap = {
      angostas: Number(surfaceParameters?.legs_angostas_add_width_mm || 140),
      comunes: Number(surfaceParameters?.legs_comunes_add_width_mm || 200),
      anchas: Number(surfaceParameters?.legs_anchas_add_width_mm || 280),
      superanchas: Number(surfaceParameters?.legs_superanchas_add_width_mm || 380),
      especiales: Number(surfaceParameters?.legs_especiales_add_width_mm || surfaceParameters?.legs_superanchas_add_width_mm || 380),
    };
    anchoCalculadoMm = Math.max(0, anchoMinMm + (addMap[piernasTipo] || 0));
  } else if (installationMode === "dentro_vano") {
    altoCalculadoMm = Math.max(0, altoMinMm - Number(surfaceParameters?.inside_vano_subtract_height_mm || 10));
    anchoCalculadoMm = Math.max(0, anchoMinMm - Number(surfaceParameters?.inside_vano_subtract_width_mm || 20));
  }

  const legWidthMm = getLegWidthMmByType(piernasTipo);
  return {
    alto_calculado_mm: Math.round(altoCalculadoMm || 0),
    ancho_calculado_mm: Math.round(anchoCalculadoMm || 0),
    alto_paso_mm: Math.max(0, Math.round(altoCalculadoMm - 200)),
    ancho_paso_mm: Math.max(0, Math.round(anchoCalculadoMm - legWidthMm * 2)),
    peso_estimado_kg: round2(pesoEstimadoKg || 0),
    piernas_tipo: piernasTipo,
    ancho_pierna_mm: legWidthMm,
  };
}
function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 14,
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto" }}>
        <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
        {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
          <div
            key={`overlay-alto-${idx}`}
            style={{
              ...schemeOverlayBaseStyle,
              left: `${rect.left}%`,
              top: `${rect.top}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
          >
            {altos[idx] || "—"}
          </div>
        ))}
        {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
          <div
            key={`overlay-ancho-${idx}`}
            style={{
              ...schemeOverlayBaseStyle,
              left: `${rect.left}%`,
              top: `${rect.top}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
          >
            {anchos[idx] || "—"}
          </div>
        ))}
      </div>
    </div>
  );
}
function formatMm(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "";
}
function formatKg(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} kg` : "";
}
function formatPiernas(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = { angostas: "angostas", comunes: "comunes", anchas: "anchas", superanchas: "superanchas", especiales: "especiales" };
  return map[key] || "";
}
function formatPlanning(planning) {
  if (!planning || typeof planning !== "object") return "";
  const week = String(planning.week_number || planning.week || "").trim();
  const start = String(planning.start_date_label || "").trim();
  const end = String(planning.end_date_label || "").trim();
  if (!week && !start && !end) return "";
  const weekPart = week ? `Semana ${week}` : "Semana estimada";
  if (start || end) return `${weekPart}, entre ${start || "—"} y ${end || "—"}`;
  return weekPart;
}
export default function MeasurementReadOnlyView({ quote }) {
  const form = quote?.measurement_form || {};
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const budgetSummaryItems = buildBudgetSummaryItems(quote);
  const technicalSummary = computeAutomaticSummary({
    quote,
    form,
    surfaceParameters: quote?.technical_rules?.surface_parameters || {},
  });
  const planningLabel = formatPlanning(quote?.production_planning);
  return (
    <div>
      <Section title="Resumen del presupuesto">
        <Row>
          <Field label="Cliente" value={quote?.end_customer?.name} />
          <Field label="Vendedor / Distribuidor" value={form.distribuidor || quote?.created_by_full_name || quote?.created_by_username} />
          <Field label="Referencia" value={form.nota_venta || form.nro_porton || quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number} />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Semana presupuestada" value={planningLabel} />
          <Field label="Modo" value={String(quote?.fulfillment_mode || "").toLowerCase() === "acopio" ? "Acopio" : "Producción"} />
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
          <Field label="Fecha de Nota de Pedido" value={form.fecha_nota_pedido || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : "")} />
          <Field label="Fecha de medición" value={form.fecha} />
          <Field label="Nombre del cliente" value={form.cliente_nombre || split.first} />
          <Field label="Apellido del cliente" value={form.cliente_apellido || split.last} />
        </Row>
      </Section>
      <Section title="Esquema de medidas">
        <MeasurementSchemeVisual form={form} />
        <div className="spacer" />
        <Row>
          <Field label="Medidas finales del portón" value={
            technicalSummary.alto_calculado_mm && technicalSummary.ancho_calculado_mm
              ? `${formatMm(technicalSummary.alto_calculado_mm)} x ${formatMm(technicalSummary.ancho_calculado_mm)}`
              : ""
          } />
          <Field label="Medidas de paso" value={
            technicalSummary.alto_paso_mm && technicalSummary.ancho_paso_mm
              ? `${formatMm(technicalSummary.alto_paso_mm)} x ${formatMm(technicalSummary.ancho_paso_mm)}`
              : ""
          } />
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Alto final editable (mm)" value={form.alto_final_mm} />
          <Field label="Ancho final editable (mm)" value={form.ancho_final_mm} />
          <Field label="Peso aproximado" value={formatKg(technicalSummary.peso_estimado_kg)} />
          <Field label="Tipo de piernas" value={formatPiernas(technicalSummary.piernas_tipo)} />
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
