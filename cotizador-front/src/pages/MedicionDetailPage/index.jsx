import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { getMedicionPublicPdfUrl } from "../../api/pdf.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getMeasurement, reviewMeasurement, saveMeasurement } from "../../api/measurements.js";
import { buildMeasurementWhatsappMessage, buildWhatsappUrl } from "../../utils/whatsapp.js";
import { validateArgentinaPhone, validateEmailAddress, validateGoogleMapsUrl } from "../../utils/contactValidation.js";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}
function isYes(v) {
  return v === true || String(v || "").toLowerCase().trim() === "si";
}
function deriveDistribuidor(quote) {
  const role = String(quote?.created_by_role || "").toLowerCase().trim();
  if (role === "vendedor") return "De Grandis Portones";
  return quote?.created_by_full_name || quote?.created_by_username || "";
}
function deriveEnAcopio(quote) {
  const fm = String(quote?.fulfillment_mode || "").toLowerCase().trim();
  if (fm === "acopio") return true;
  const st = String(quote?.acopio_to_produccion_status || "").toLowerCase().trim();
  if (st && st !== "none") return true;
  if (quote?.acopio_to_produccion_requested_at) return true;
  return false;
}
function makeEditableCustomer(quote) {
  const endCustomer = quote?.end_customer || {};
  return {
    name: String(endCustomer.name || "").trim(),
    phone: String(endCustomer.phone || "").trim(),
    email: String(endCustomer.email || "").trim(),
    address: String(endCustomer.address || "").trim(),
    city: String(endCustomer.city || "").trim(),
    maps_url: String(endCustomer.maps_url || "").trim(),
  };
}
function normalizeMeasurementMode(v) {
  return String(v || "medidor").toLowerCase().trim() === "tecnica_only" ? "tecnica_only" : "medidor";
}
function normalizeMeasurementSubtype(v) {
  return String(v || "normal").toLowerCase().trim() === "sin_medicion" ? "sin_medicion" : "normal";
}
function isTecnicaOnlyQuote(quote) {
  return normalizeMeasurementMode(quote?.measurement_mode) === "tecnica_only"
    || normalizeMeasurementSubtype(quote?.measurement_subtype) === "sin_medicion";
}
function resolveVisibleQuoteNumber(quote) {
  const quoteNumber = String(quote?.quote_number || "").trim();
  if (quoteNumber) return quoteNumber;
  const finalDigits = onlyDigits(quote?.final_sale_order_name || quote?.odoo_sale_order_name || "");
  return finalDigits || "";
}
function toNumberLike(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = toNumberLike(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000));
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
  background: "rgba(255,255,255,0.55)",
  borderRadius: 6,
  pointerEvents: "none",
};
function normalizeMeasurementForm(raw, quote) {
  const f = raw && typeof raw === "object" ? { ...raw } : {};
  const suggestedAltoMm = extractBudgetDimensionMm(quote, "alto");
  const suggestedAnchoMm = extractBudgetDimensionMm(quote, "ancho");
  if (!f.fecha) f.fecha = todayISO();
  if (!f.distribuidor) f.distribuidor = deriveDistribuidor(quote);
  if (f.en_acopio === undefined) f.en_acopio = deriveEnAcopio(quote);
  const p = f.parantes && typeof f.parantes === "object" ? { ...f.parantes } : {};
  if (p.cant === undefined) p.cant = "";
  f.parantes = p;
  const esq = f.esquema && typeof f.esquema === "object" ? { ...f.esquema } : {};
  const alto = Array.isArray(esq.alto) ? esq.alto.slice(0, 3) : [];
  const ancho = Array.isArray(esq.ancho) ? esq.ancho.slice(0, 3) : [];
  while (alto.length < 3) alto.push("");
  while (ancho.length < 3) ancho.push("");
  esq.alto = alto;
  esq.ancho = ancho;
  f.esquema = esq;

  if ((f.ancho_mm || f.alto_mm || suggestedAnchoMm || suggestedAltoMm) && !raw?.esquema) {
    const baseAlto = String(f.alto_mm || suggestedAltoMm || "").trim();
    const baseAncho = String(f.ancho_mm || suggestedAnchoMm || "").trim();
    if (isTecnicaOnlyQuote(quote)) {
      for (let i = 0; i < 3; i += 1) {
        if (baseAlto && !f.esquema.alto[i]) f.esquema.alto[i] = baseAlto;
        if (baseAncho && !f.esquema.ancho[i]) f.esquema.ancho[i] = baseAncho;
      }
      if (!f.alto_final_mm && baseAlto) f.alto_final_mm = baseAlto;
      if (!f.ancho_final_mm && baseAncho) f.ancho_final_mm = baseAncho;
    } else {
      if (baseAlto && !f.esquema.alto[1]) f.esquema.alto[1] = baseAlto;
      if (baseAncho && !f.esquema.ancho[1]) f.esquema.ancho[1] = baseAncho;
    }
  }
  if (f.alto_final_mm === undefined) f.alto_final_mm = "";
  if (f.ancho_final_mm === undefined) f.ancho_final_mm = "";
  if (f.estructura_metalica !== undefined && typeof f.estructura_metalica !== "boolean") f.estructura_metalica = isYes(f.estructura_metalica);
  if (f.lucera !== undefined && typeof f.lucera !== "boolean") f.lucera = isYes(f.lucera);
  if (f.traslado !== undefined && typeof f.traslado !== "boolean") f.traslado = isYes(f.traslado);
  if (f.relevamiento !== undefined && typeof f.relevamiento !== "boolean") f.relevamiento = isYes(f.relevamiento);
  if (f.color_revestimiento !== "Otros") f.color_revestimiento_otro = f.color_revestimiento_otro || "";
  return f;
}
function makeEmptyForm(quote) {
  const suggestedAltoMm = extractBudgetDimensionMm(quote, "alto");
  const suggestedAnchoMm = extractBudgetDimensionMm(quote, "ancho");
  const isTecnicaOnly = isTecnicaOnlyQuote(quote);
  return {
    fecha: todayISO(),
    distribuidor: deriveDistribuidor(quote),
    nro_porton: "",
    parantes: { cant: "" },
    lado_puerta: "",
    lado_motor: "",
    toma_corriente: "",
    esquema: {
      alto: isTecnicaOnly && suggestedAltoMm ? [suggestedAltoMm, suggestedAltoMm, suggestedAltoMm] : ["", "", ""],
      ancho: isTecnicaOnly && suggestedAnchoMm ? [suggestedAnchoMm, suggestedAnchoMm, suggestedAnchoMm] : ["", "", ""],
    },
    alto_final_mm: isTecnicaOnly ? suggestedAltoMm : "",
    ancho_final_mm: isTecnicaOnly ? suggestedAnchoMm : "",
    observaciones: "",
    colocacion: "",
    en_acopio: deriveEnAcopio(quote),
    accionamiento: "",
    levadizo: "",
    estructura_metalica: false,
    rebaje_lateral_mm: "",
    rebaje_inferior_mm: "",
    anclaje: "",
    color_sistema: "",
    tipo_revestimiento: "",
    varillado_medida: "",
    orientacion_revestimiento: "",
    revestimiento: "",
    color_revestimiento: "",
    color_revestimiento_otro: "",
    lucera: false,
    lucera_cantidad: "",
    peso_revestimiento: "",
    traslado: false,
    relevamiento: false,
    contacto_obra_nombre: "",
    contacto_obra_tel: "",
  };
}
function Section({ title, children }) {
  return <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}><div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>{children}</div>;
}
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function Field({ label, children }) {
  return <div style={{ flex: 1, minWidth: 220 }}><div className="muted" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}
function Select({ value, onChange, options, placeholder = "—", disabled = false }) {
  return <select value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }} disabled={disabled}><option value="">{placeholder}</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
function measurementStatusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Pendiente revisión técnica";
  if (s === "needs_fix") return "A corregir";
  if (s === "approved") return "Aprobada";
  return s || "—";
}
function SuggestedHint({ value }) {
  if (!value) return null;
  return <div className="muted" style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Sugerido: <b>{value}</b> · el medidor debe volver a seleccionarlo</div>;
}
function validateTechnicalFinalDimensions(form) {
  if (!String(form?.alto_final_mm || "").trim()) throw new Error("Completá el Alto final antes de confirmar el detalle técnico.");
  if (!String(form?.ancho_final_mm || "").trim()) throw new Error("Completá el Ancho final antes de confirmar el detalle técnico.");
}

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const pendingWhatsappWindowRef = useRef(null);

  const q = useQuery({ queryKey: ["measurement", quoteId], queryFn: () => getMeasurement(quoteId), enabled: !!quoteId });
  const quote = q.data;
  const [form, setForm] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [shareInfo, setShareInfo] = useState(null);

  const isMedidor = !!user?.is_medidor;
  const isTechnical = !!user?.is_rev_tecnica;
  const isOwner = String(quote?.created_by_user_id || "") === String(user?.user_id || "");
  const isCommercialViewer = !!user?.is_enc_comercial;
  const isTecnicaOnly = isTecnicaOnlyQuote(quote);
  const canEdit = isMedidor || isTechnical;
  const canView = canEdit || isOwner || isCommercialViewer;
  const measurementSuggestions = quote?.measurement_prefill || {};
  const visibleQuoteNumber = resolveVisibleQuoteNumber(quote);
  const detailKindLabel = isTecnicaOnly ? "Detalle técnico" : "Medición";
  const backPath = isTechnical ? "/aprobacion/tecnica?tab=aprobaciones_mediciones" : (isMedidor ? "/mediciones" : "/presupuestos");

  function openPendingWhatsappWindow() {
    try {
      const popup = window.open("", "_blank");
      if (!popup) return null;
      try { popup.opener = null; } catch {}
      try {
        popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>Preparando WhatsApp…</title><style>body{font-family:Arial,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f9;color:#111827}.box{padding:24px 28px;border-radius:14px;background:white;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,0.08);text-align:center}</style></head><body><div class="box">Preparando WhatsApp…</div></body></html>`);
        popup.document.close();
      } catch {}
      pendingWhatsappWindowRef.current = popup;
      return popup;
    } catch {
      pendingWhatsappWindowRef.current = null;
      return null;
    }
  }
  function closePendingWhatsappWindow() {
    const popup = pendingWhatsappWindowRef.current;
    if (popup && !popup.closed) { try { popup.close(); } catch {} }
    pendingWhatsappWindowRef.current = null;
  }
  function redirectPendingWhatsappWindow(url) {
    const popup = pendingWhatsappWindowRef.current;
    if (popup && !popup.closed) {
      try { popup.location.href = url; pendingWhatsappWindowRef.current = null; return true; } catch {}
    }
    try { window.open(url, "_blank", "noopener,noreferrer"); return true; } catch { return false; }
  }
  function validateCustomerData(nextCustomer, { requireWhatsapp = false } = {}) {
    const phoneErr = validateArgentinaPhone(nextCustomer?.phone, { required: requireWhatsapp });
    if (phoneErr) throw new Error(phoneErr);
    const emailErr = validateEmailAddress(nextCustomer?.email, { required: false });
    if (emailErr) throw new Error(emailErr);
    const mapsErr = validateGoogleMapsUrl(nextCustomer?.maps_url, { required: false });
    if (mapsErr) throw new Error(mapsErr);
  }

  useEffect(() => {
    if (!quote) return;
    const f = quote.measurement_form ? normalizeMeasurementForm(quote.measurement_form, quote) : makeEmptyForm(quote);
    setForm(f);
    setCustomer(makeEditableCustomer(quote));
  }, [quote]);
  useEffect(() => () => closePendingWhatsappWindow(), []);

  const mSave = useMutation({
    mutationFn: ({ submit }) => {
      if (submit && isTechnical) validateTechnicalFinalDimensions(form);
      validateCustomerData(customer, { requireWhatsapp: submit && isTechnical });
      return saveMeasurement(quoteId, { form, submit, endCustomer: customer });
    },
    onMutate: () => setShareInfo(null),
    onSuccess: async (savedQuote, variables) => {
      await q.refetch();
      if (!variables?.submit) {
        setShareInfo({ tone: "success", message: isTechnical ? "Cambios guardados." : `${detailKindLabel} guardado.` });
        return;
      }
      if (isMedidor) {
        closePendingWhatsappWindow();
        setShareInfo({ tone: "success", message: "Medición enviada a Técnica para revisión." });
        return;
      }
      const token = savedQuote?.measurement_share_token;
      const publicPdfUrl = getMedicionPublicPdfUrl(token);
      const whatsappText = buildMeasurementWhatsappMessage(publicPdfUrl);
      const whatsappUrl = buildWhatsappUrl(savedQuote?.end_customer?.phone || customer?.phone, whatsappText);
      if (whatsappUrl) {
        const opened = redirectPendingWhatsappWindow(whatsappUrl);
        setShareInfo({ tone: opened ? "success" : "warning", message: opened ? `${detailKindLabel} aprobado. Se abrió WhatsApp con el mensaje listo para el cliente.` : `${detailKindLabel} aprobado. No se pudo abrir WhatsApp automáticamente, pero el mensaje quedó listo.`, whatsappUrl, publicPdfUrl });
        return;
      }
      closePendingWhatsappWindow();
      setShareInfo({ tone: "warning", message: `${detailKindLabel} aprobado, pero falta un teléfono válido para abrir WhatsApp.`, publicPdfUrl });
    },
    onError: (error) => { closePendingWhatsappWindow(); setShareInfo({ tone: "warning", message: error?.message || `No se pudo guardar el ${detailKindLabel.toLowerCase()}.` }); },
  });

  const rejectM = useMutation({
    mutationFn: (notes) => reviewMeasurement(quoteId, { action: "reject", notes }),
    onSuccess: async () => { await q.refetch(); setShareInfo({ tone: "warning", message: "Medición devuelta al medidor para corregir." }); },
    onError: (error) => { setShareInfo({ tone: "warning", message: error?.message || "No se pudo devolver la medición." }); },
  });

  const leftRightOptions = useMemo(() => ([{ value: "izquierda", label: "Izquierda" }, { value: "derecha", label: "Derecha" }]), []);
  const yesNoOptions = useMemo(() => ([{ value: "no", label: "No" }, { value: "si", label: "Sí" }]), []);
  const setYesNoBool = (key, v) => setForm({ ...form, [key]: v === "si" });

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{detailKindLabel} · Presupuesto #{visibleQuoteNumber || "—"}</h2>
            <div className="muted">
              {isTechnical
                ? (isTecnicaOnly
                  ? "Completá la planilla de datos técnicos, definí Alto/Ancho final y confirmá para disparar Odoo."
                  : "Revisar la planilla, corregir si hace falta y aprobar para enviar al cliente.")
                : (isMedidor
                  ? "Completar la planilla y enviarla a Técnica para revisión."
                  : (isTecnicaOnly
                    ? "Vista de la planilla de datos técnicos del portón."
                    : "Vista de la planilla de medición del portón."))}
            </div>
            {quote ? <div className="muted" style={{ marginTop: 6 }}>Estado: <b>{measurementStatusLabel(quote.measurement_status)}</b>{isTecnicaOnly ? <> · Tipo: <b>Detalle técnico</b></> : null}</div> : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><Button variant="ghost" onClick={() => navigate(backPath)}>Volver</Button></div>
        </div>
        {q.isLoading && <><div className="spacer" /><div className="muted">Cargando…</div></>}
        {q.isError && <><div className="spacer" /><div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div></>}
        {q.isSuccess && !canView && <><div className="spacer" /><div className="muted">No tenés permisos para ver esta planilla.</div></>}
      </div>

      {quote && canView && <>
        <div className="spacer" />
        <Section title="Membrete">
          <Row>
            <Field label="Cliente"><Input value={customer?.name || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
            <Field label="Localidad"><Input value={customer?.city || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
            <Field label="Teléfono"><Input value={customer?.phone || ""} onChange={(v) => setCustomer((prev) => ({ ...(prev || {}), phone: v }))} placeholder="Sin 0 y sin 15" style={{ width: "100%" }} disabled={!canEdit} /></Field>
            <Field label="Dirección"><Input value={customer?.address || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
          </Row>
          <div className="spacer" />
          <Row>
            <Field label="Correo"><Input value={customer?.email || ""} onChange={(v) => setCustomer((prev) => ({ ...(prev || {}), email: v }))} placeholder="cliente@correo.com" style={{ width: "100%" }} disabled={!canEdit} /></Field>
            <Field label="Maps"><Input value={customer?.maps_url || ""} onChange={(v) => setCustomer((prev) => ({ ...(prev || {}), maps_url: v }))} placeholder="https://maps.app.goo.gl/..." style={{ width: "100%" }} disabled={!canEdit} /></Field>
          </Row>
          {quote.measurement_status === "needs_fix" && quote.measurement_review_notes && <><div className="spacer" /><div style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Revisión: corregir</div><div>{quote.measurement_review_notes}</div></div></>}
        </Section>

        {!form && <div className="card"><div className="muted">Inicializando formulario…</div></div>}
        {form && <>
          <Section title="Datos generales">
            <Row>
              <Field label="Fecha"><Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
              <Field label="Distribuidor"><Input value={form.distribuidor || ""} onChange={(v) => setForm({ ...form, distribuidor: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
              <Field label="Cliente"><Input value={customer?.name || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="N° de portón (Nota de venta)"><Input value={form.nro_porton || ""} onChange={(v) => setForm({ ...form, nro_porton: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
            </Row>
          </Section>

          <Section title="Parantes / Laterales">
            <Row>
              <Field label="Parantes (Cant)"><Input type="number" value={form.parantes?.cant || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes || {}), cant: v } })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
              <Field label="Lado de la puerta"><Select value={form.lado_puerta || ""} onChange={(v) => setForm({ ...form, lado_puerta: v })} options={leftRightOptions} disabled={!canEdit} /></Field>
              <Field label="Lado de motor o soporte"><Select value={form.lado_motor || ""} onChange={(v) => setForm({ ...form, lado_motor: v })} options={leftRightOptions} disabled={!canEdit} /></Field>
              <Field label="Toma Corriente"><Select value={form.toma_corriente || ""} onChange={(v) => setForm({ ...form, toma_corriente: v })} options={leftRightOptions} disabled={!canEdit} /></Field>
            </Row>
          </Section>

          <Section title="Esquema (medidas)">
            {isTecnicaOnly ? (
              <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#fff7e6", border: "1px solid #ffe3a3" }}>
                Este portón no pasa por Medidor. Técnica completa la planilla usando como base las medidas declaradas en el presupuesto y confirma el <b>Alto final</b> y el <b>Ancho final</b>.
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 2, minWidth: 320 }}>
                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" }}>
                  <div style={{ position: "relative", width: "100%" }}>
                    <img src="/measurement_scheme.png" alt="Esquema" style={{ width: "100%", height: "auto", display: "block" }} />
                    {SCHEME_RECT_PCTS.alto.map((p, i) => {
                      const v = form.esquema?.alto?.[i];
                      if (v === "" || v === null || v === undefined) return null;
                      return <div key={`alto-ov-${i}`} style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}>{v}</div>;
                    })}
                    {SCHEME_RECT_PCTS.ancho.map((p, i) => {
                      const v = form.esquema?.ancho?.[i];
                      if (v === "" || v === null || v === undefined) return null;
                      return <div key={`ancho-ov-${i}`} style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}>{v}</div>;
                    })}
                  </div>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Ingresá un número en cada rectángulo (mm).</div>
              </div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Alto</div>
                <Row>{[0, 1, 2].map((i) => <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}><Input type="number" value={form.esquema?.alto?.[i] ?? ""} onChange={(v) => { const next = { ...(form.esquema || {}) }; const arr = Array.isArray(next.alto) ? next.alto.slice(0, 3) : ["", "", ""]; while (arr.length < 3) arr.push(""); arr[i] = v; next.alto = arr; setForm({ ...form, esquema: next }); }} style={{ width: "100%" }} disabled={!canEdit} /></Field>)}</Row>
                <div className="spacer" />
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Ancho</div>
                <Row>{[0, 1, 2].map((i) => <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}><Input type="number" value={form.esquema?.ancho?.[i] ?? ""} onChange={(v) => { const next = { ...(form.esquema || {}) }; const arr = Array.isArray(next.ancho) ? next.ancho.slice(0, 3) : ["", "", ""]; while (arr.length < 3) arr.push(""); arr[i] = v; next.ancho = arr; setForm({ ...form, esquema: next }); }} style={{ width: "100%" }} disabled={!canEdit} /></Field>)}</Row>
                <div className="spacer" />
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Medidas finales</div>
                <Row>
                  <Field label="Alto final (mm)">
                    <Input type="number" value={form.alto_final_mm || ""} onChange={(v) => setForm({ ...form, alto_final_mm: v })} style={{ width: "100%" }} disabled={!isTechnical} />
                  </Field>
                  <Field label="Ancho final (mm)">
                    <Input type="number" value={form.ancho_final_mm || ""} onChange={(v) => setForm({ ...form, ancho_final_mm: v })} style={{ width: "100%" }} disabled={!isTechnical} />
                  </Field>
                </Row>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Estos dos campos los define Técnica y son obligatorios antes de confirmar el detalle técnico.</div>
              </div>
            </div>
          </Section>

          <Section title="Instalación / Sistema">
            <Row>
              <Field label="Tipo de colocación"><Select value={form.colocacion || ""} onChange={(v) => setForm({ ...form, colocacion: v })} options={[{ value: "dentro_vano", label: "Por dentro del vano" }, { value: "detras_vano", label: "Por detrás del vano" }]} disabled={!canEdit} /></Field>
              <Field label="Portón en acopio"><Input value={form.en_acopio ? "Sí" : "No"} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Tipo de accionamiento"><SuggestedHint value={measurementSuggestions.accionamiento} /><Select value={form.accionamiento || ""} onChange={(v) => setForm({ ...form, accionamiento: v })} options={[{ value: "manual", label: "Manual" }, { value: "automatico", label: "Automático" }]} disabled={!canEdit} /></Field>
              <Field label="Sistema levadizo"><SuggestedHint value={measurementSuggestions.levadizo} /><Select value={form.levadizo || ""} onChange={(v) => setForm({ ...form, levadizo: v })} options={[{ value: "coplanar", label: "Coplanar" }, { value: "comun", label: "Común" }]} disabled={!canEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Estructura metálica para puerta"><SuggestedHint value={measurementSuggestions.estructura_metalica} /><Select value={form.estructura_metalica ? "si" : "no"} onChange={(v) => setYesNoBool("estructura_metalica", v)} options={yesNoOptions} disabled={!canEdit} /></Field>
              <Field label="Rebaje lateral (mm)"><Input type="number" value={form.rebaje_lateral_mm || ""} onChange={(v) => setForm({ ...form, rebaje_lateral_mm: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
              <Field label="Rebaje inferior (mm)"><Input type="number" value={form.rebaje_inferior_mm || ""} onChange={(v) => setForm({ ...form, rebaje_inferior_mm: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
              <Field label="Anclaje de fijación"><SuggestedHint value={measurementSuggestions.anclaje} /><Select value={form.anclaje || ""} onChange={(v) => setForm({ ...form, anclaje: v })} options={[{ value: "lateral", label: "Lateral" }, { value: "frontal", label: "Frontal" }, { value: "sin", label: "Sin Anclajes" }]} disabled={!canEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row><Field label="Color de sistema"><SuggestedHint value={measurementSuggestions.color_sistema} /><Select value={form.color_sistema || ""} onChange={(v) => setForm({ ...form, color_sistema: v })} options={[{ value: "Blanco", label: "Blanco" }, { value: "Gris topo", label: "Gris topo" }, { value: "Negro texturado Brillante", label: "Negro texturado Brillante" }, { value: "Negro Semi Mate", label: "Negro Semi Mate" }, { value: "Negro Textourado mate", label: "Negro Textourado mate" }, { value: "Bronce colonial", label: "Bronce colonial" }]} disabled={!canEdit} /></Field></Row>
          </Section>

          <Section title="Revestimiento">
            <Row>
              <Field label="Tipo de Revestimiento"><SuggestedHint value={measurementSuggestions.tipo_revestimiento} /><Select value={form.tipo_revestimiento || ""} onChange={(v) => { const next = { ...form, tipo_revestimiento: v }; if (!["varillado_inyectado", "varillado_simple"].includes(v)) next.varillado_medida = ""; setForm(next); }} options={[{ value: "lamas", label: "Lamas" }, { value: "varillado_inyectado", label: "Varillado Inyectado" }, { value: "varillado_simple", label: "Varillado Simple" }]} disabled={!canEdit} /></Field>
              {["varillado_inyectado", "varillado_simple"].includes(form.tipo_revestimiento) && <Field label="Medida (Varillado)"><Input value={form.varillado_medida || ""} onChange={(v) => setForm({ ...form, varillado_medida: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>}
              <Field label="Orientación del revestimiento"><SuggestedHint value={measurementSuggestions.orientacion_revestimiento} /><Select value={form.orientacion_revestimiento || ""} onChange={(v) => setForm({ ...form, orientacion_revestimiento: v })} options={[{ value: "lamas_horizontales", label: "Lamas Horizontales" }, { value: "lamas_verticales", label: "Lamas Verticales" }, { value: "varillado_vertical", label: "Varillado Vertical" }]} disabled={!canEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Revestimiento"><SuggestedHint value={measurementSuggestions.revestimiento} /><Select value={form.revestimiento || ""} onChange={(v) => setForm({ ...form, revestimiento: v })} options={[{ value: "Apto Aluminio", label: "Apto Aluminio" }, { value: "Simil madera Clásico Simil", label: "Simil madera Clásico Simil" }, { value: "Simil Aluminio Clásico", label: "Simil Aluminio Clásico" }, { value: "Apto PVC", label: "Apto PVC" }, { value: "Simil madera doble inyectado", label: "Simil madera doble inyectado" }, { value: "Simil aluminio doble inyectado", label: "Simil aluminio doble inyectado" }, { value: "Varillado", label: "Varillado" }]} disabled={!canEdit} /></Field>
              <Field label="Color de revestimiento"><SuggestedHint value={measurementSuggestions.color_revestimiento} /><Select value={form.color_revestimiento || ""} onChange={(v) => { const next = { ...form, color_revestimiento: v }; if (v !== "Otros") next.color_revestimiento_otro = ""; setForm(next); }} options={[{ value: "Roble", label: "Roble" }, { value: "Negro Texturado", label: "Negro Texturado" }, { value: "Negro Semi mate", label: "Negro Semi mate" }, { value: "Blanco", label: "Blanco" }, { value: "Bronce Colonial", label: "Bronce Colonial" }, { value: "Negro Micro", label: "Negro Micro" }, { value: "Nogal", label: "Nogal" }, { value: "Gris Topo", label: "Gris Topo" }, { value: "Otros", label: "Otros" }]} disabled={!canEdit} /></Field>
              {form.color_revestimiento === "Otros" && <Field label="Otros (especificar)"><Input value={form.color_revestimiento_otro || ""} onChange={(v) => setForm({ ...form, color_revestimiento_otro: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>}
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Lucera con vidrios"><SuggestedHint value={measurementSuggestions.lucera} /><Select value={form.lucera ? "si" : "no"} onChange={(v) => { const yes = v === "si"; setForm({ ...form, lucera: yes, lucera_cantidad: yes ? (form.lucera_cantidad || "") : "" }); }} options={yesNoOptions} disabled={!canEdit} /></Field>
              {form.lucera && <Field label="Cantidad (Lucera)"><Input type="number" value={form.lucera_cantidad || ""} onChange={(v) => setForm({ ...form, lucera_cantidad: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>}
              <Field label="Peso del revestimiento a colocar"><Input type="number" value={form.peso_revestimiento || ""} onChange={(v) => setForm({ ...form, peso_revestimiento: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
            </Row>
          </Section>

          <Section title="Servicios / Contacto">
            <Row>
              <Field label="Servicio de traslado"><SuggestedHint value={measurementSuggestions.traslado} /><Select value={form.traslado ? "si" : "no"} onChange={(v) => setYesNoBool("traslado", v)} options={yesNoOptions} disabled={!canEdit} /></Field>
              <Field label="Servicio de relevamiento de medidas"><SuggestedHint value={measurementSuggestions.relevamiento} /><Select value={form.relevamiento ? "si" : "no"} onChange={(v) => setYesNoBool("relevamiento", v)} options={yesNoOptions} disabled={!canEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Nombre de contacto en obra"><textarea value={form.contacto_obra_nombre || ""} onChange={(e) => setForm({ ...form, contacto_obra_nombre: e.target.value })} style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} disabled={!canEdit} /></Field>
              <Field label="Teléfono de contacto en obra"><Input type="tel" value={form.contacto_obra_tel || ""} onChange={(v) => setForm({ ...form, contacto_obra_tel: v })} style={{ width: "100%" }} disabled={!canEdit} /></Field>
            </Row>
          </Section>

          <Section title="Observaciones"><textarea value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} disabled={!canEdit} /></Section>

          {canEdit ? (
            <div className="card">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={() => mSave.mutate({ submit: false })} disabled={!canEdit || mSave.isPending || rejectM.isPending}>{mSave.isPending ? "Guardando…" : (isTechnical ? "Guardar cambios" : "Guardar")}</Button>
                <Button onClick={() => {
                  try {
                    if (isTechnical) validateTechnicalFinalDimensions(form);
                  } catch (e) {
                    setShareInfo({ tone: "warning", message: e?.message || "Faltan medidas finales." });
                    return;
                  }
                  const st = String(quote?.measurement_status || "").toLowerCase().trim();
                  const token = String(quote?.measurement_share_token || "").trim();
                  const publicPdfUrl = getMedicionPublicPdfUrl(token);
                  const whatsappText = buildMeasurementWhatsappMessage(publicPdfUrl);
                  const whatsappUrl = buildWhatsappUrl(customer?.phone, whatsappText);
                  if (isTechnical && st === "approved") {
                    if (whatsappUrl) {
                      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                      setShareInfo({ tone: "success", message: "Se abrió WhatsApp con el mensaje listo para el cliente.", whatsappUrl, publicPdfUrl });
                      return;
                    }
                    setShareInfo({ tone: "warning", message: `${detailKindLabel} ya aprobado, pero falta un teléfono válido para abrir WhatsApp.`, publicPdfUrl });
                    return;
                  }
                  if (isTechnical) openPendingWhatsappWindow();
                  mSave.mutate({ submit: true });
                }} disabled={!canEdit || mSave.isPending || rejectM.isPending}>
                  {mSave.isPending ? (isTechnical ? "Confirmando…" : "Enviando…") : (isTechnical ? (isTecnicaOnly ? "Confirmar datos técnicos y enviar" : "Aprobar y enviar") : "Enviar a Técnica")}
                </Button>
                {isTechnical && quote.measurement_status === "submitted" && !isTecnicaOnly && <Button variant="ghost" disabled={rejectM.isPending || mSave.isPending} onClick={() => { const msg = window.prompt("Motivo de la corrección:", quote.measurement_review_notes || ""); if (msg === null) return; rejectM.mutate(msg); }}>{rejectM.isPending ? "Devolviendo…" : "Devolver para corregir"}</Button>}
              </div>
              {(mSave.isError || rejectM.isError) && <><div className="spacer" /><div style={{ color: "#d93025", fontSize: 13 }}>{mSave.error?.message || rejectM.error?.message}</div></>}
              {shareInfo?.message && <><div className="spacer" /><div style={{ padding: 12, borderRadius: 10, border: shareInfo.tone === "warning" ? "1px solid #ffe3a3" : "1px solid #bfe6c8", background: shareInfo.tone === "warning" ? "#fff7e6" : "#e7f7ed" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>{shareInfo.tone === "warning" ? "Atención" : "Correcto"}</div><div>{shareInfo.message}</div>{(shareInfo.whatsappUrl || shareInfo.publicPdfUrl) && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{shareInfo.whatsappUrl && <Button variant="secondary" onClick={() => window.open(shareInfo.whatsappUrl, "_blank", "noopener,noreferrer")}>Abrir WhatsApp</Button>}{shareInfo.publicPdfUrl && <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(shareInfo.publicPdfUrl); setShareInfo((prev) => prev ? { ...prev, message: `${prev.message} Link copiado.` } : prev); } catch { window.open(shareInfo.publicPdfUrl, "_blank", "noopener,noreferrer"); } }}>Copiar link PDF</Button>}</div>}</div></>}
            </div>
          ) : (
            <div className="card">
              <div className="muted">Vista solo lectura. Desde Mis presupuestos, Ver medición / Ver detalle técnico abre esta planilla para consulta.</div>
            </div>
          )}
        </>}
      </>}
    </div>
  );
}
