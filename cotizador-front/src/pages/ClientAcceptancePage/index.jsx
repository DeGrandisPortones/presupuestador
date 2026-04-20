import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  getPublicMeasurementAcceptance,
  submitPublicMeasurementAcceptance,
} from "../../api/measurements.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

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
    const cleanPath = String(path || "").replace(/^payload\./, "");
    const value = cleanPath.includes(".")
      ? cleanPath.split(".").filter(Boolean).reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), payload)
      : payload?.[cleanPath];
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

function Card({ title, children }) {
  return (
    <div className="card" style={{ background: "#fff", marginBottom: 12, border: "1px solid #eee" }}>
      {title ? <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div> : null}
      {children}
    </div>
  );
}
function StaticField({ label, value }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid #e3e3e3", background: "#fff", whiteSpace: "pre-wrap" }}>
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);
  return (
    <div style={{ border: "1px dashed #cbd5e1", borderRadius: 14, background: "#ffffff", padding: 16 }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 780, margin: "0 auto" }}>
        <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
        {SCHEME_RECT_PCTS.alto.map((rect, idx) => (
          <div key={`overlay-alto-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
            {altos[idx] || "—"}
          </div>
        ))}
        {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (
          <div key={`overlay-ancho-${idx}`} style={{ ...schemeOverlayBaseStyle, left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}>
            {anchos[idx] || "—"}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientAcceptancePage() {
  const { token } = useParams();
  const [step, setStep] = useState("initial");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const acceptanceQ = useQuery({
    queryKey: ["client-acceptance", token],
    queryFn: () => getPublicMeasurementAcceptance(token),
    enabled: !!token,
  });

  const acceptM = useMutation({
    mutationFn: () => submitPublicMeasurementAcceptance(token, { fullName, dni }),
    onSuccess: () => {
      setStep("done");
      acceptanceQ.refetch();
    },
  });

  const quote = acceptanceQ.data?.quote || null;
  const accepted = acceptanceQ.data?.acceptance || null;
  const form = quote?.measurement_form || {};
  const technicalSummary = useMemo(() => computeAutomaticSummary({
    quote,
    form,
    surfaceParameters: quote?.technical_rules?.surface_parameters || {},
  }), [quote, form]);

  if (acceptanceQ.isLoading) {
    return <div className="container"><div className="card"><div className="muted">Cargando datos técnicos del portón...</div></div></div>;
  }
  if (acceptanceQ.isError) {
    return <div className="container"><div className="card"><div style={{ color: "#d93025", fontSize: 13 }}>{acceptanceQ.error?.message || "No se pudo cargar la aceptación del cliente"}</div></div></div>;
  }
  if (!quote) {
    return <div className="container"><div className="card"><div className="muted">No se encontraron datos para esta aceptación.</div></div></div>;
  }

  const soldLines = Array.isArray(quote?.lines) ? quote.lines : [];
  const canAccept = !accepted?.accepted_at;
  const submitError = acceptM.error?.message || "";

  return (
    <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 12px" }}>
      <Card>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Aceptación del cliente</h2>
        <div className="muted">
          Revisá los datos técnicos del portón y confirmá la aceptación al final de la página.
        </div>
      </Card>

      <Card title="Datos del portón">
        <Row>
          <StaticField label="Referencia" value={quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number} />
          <StaticField label="Cliente" value={quote?.end_customer?.name} />
          <StaticField label="Teléfono" value={quote?.end_customer?.phone} />
        </Row>
        <div className="spacer" />
        <Row>
          <StaticField label="Dirección" value={quote?.end_customer?.address} />
          <StaticField label="Localidad" value={quote?.end_customer?.city} />
          <StaticField label="Google Maps" value={quote?.end_customer?.maps_url} />
        </Row>
      </Card>

      <Card title="Esquema de medidas">
        <MeasurementSchemeVisual form={form} />
        <div className="spacer" />
        <Row>
          <StaticField label="Alto final" value={formatMm(form?.alto_final_mm || technicalSummary.alto_calculado_mm)} />
          <StaticField label="Ancho final" value={formatMm(form?.ancho_final_mm || technicalSummary.ancho_calculado_mm)} />
          <StaticField label="Cantidad de parantes" value={text(form?.cantidad_parantes)} />
        </Row>
        <div className="spacer" />
        <Row>
          <StaticField label="Medidas de paso" value={technicalSummary.alto_paso_mm && technicalSummary.ancho_paso_mm ? `${formatMm(technicalSummary.alto_paso_mm)} x ${formatMm(technicalSummary.ancho_paso_mm)}` : ""} />
          <StaticField label="Peso aproximado" value={formatKg(technicalSummary.peso_estimado_kg)} />
          <StaticField label="Tipo de piernas" value={formatPiernas(technicalSummary.piernas_tipo)} />
        </Row>
      </Card>

      <Card title="Productos del portón">
        {!soldLines.length ? <div className="muted">Sin productos informados.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {soldLines.map((line, idx) => (
              <div key={`${line?.product_id || "line"}-${idx}`} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <b>{text(line?.raw_name || line?.name || `Producto ${line?.product_id || idx + 1}`)}</b>
                <div className="muted">Cantidad: {Number(line?.qty || 1) || 1}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Observaciones">
        <div>{text(form?.observaciones_medicion) || <span className="muted">Sin observaciones.</span>}</div>
      </Card>

      <Card title="Aceptación del cliente">
        {accepted?.accepted_at ? (
          <>
            <div style={{ color: "#065f46", fontWeight: 800, marginBottom: 12 }}>
              La aceptación ya fue registrada correctamente.
            </div>
            <Row>
              <StaticField label="Nombre completo" value={accepted?.full_name} />
              <StaticField label="DNI" value={accepted?.dni} />
              <StaticField label="Fecha de aceptación" value={accepted?.accepted_at ? new Date(accepted.accepted_at).toLocaleString("es-AR") : ""} />
            </Row>
          </>
        ) : (
          <>
            {step === "initial" ? (
              <Button onClick={() => setStep("name")}>Acepto los datos técnicos del portón</Button>
            ) : null}

            {step === "name" ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>Nombre completo</div>
                  <Input value={fullName} onChange={setFullName} style={{ width: "100%" }} />
                </div>
                <Button
                  onClick={() => {
                    if (!text(fullName)) {
                      window.alert("Ingresá tu nombre completo.");
                      return;
                    }
                    setStep("dni");
                  }}
                >
                  Continuar
                </Button>
              </div>
            ) : null}

            {step === "dni" ? (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>DNI</div>
                    <Input value={dni} onChange={setDni} style={{ width: "100%" }} />
                  </div>
                  <Button
                    disabled={acceptM.isPending}
                    onClick={() => {
                      const cleanDni = String(dni || "").replace(/\D/g, "");
                      if (!cleanDni || cleanDni.length < 7) {
                        window.alert("Ingresá un DNI válido.");
                        return;
                      }
                      acceptM.mutate();
                    }}
                  >
                    {acceptM.isPending ? "Registrando..." : "Confirmar aceptación"}
                  </Button>
                </div>
                {submitError ? <div style={{ color: "#d93025", fontSize: 13, marginTop: 12 }}>{submitError}</div> : null}
              </>
            ) : null}

            {step === "done" && accepted?.accepted_at ? (
              <div style={{ color: "#065f46", fontWeight: 800 }}>La aceptación fue registrada correctamente.</div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
