import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { getQuote, reviewCommercial, reviewTechnical, createRevisionQuote } from "../../api/quotes.js";
import { listDoorsByQuote } from "../../api/doors.js";
import { downloadMedicionPdf } from "../../api/pdf.js";
import { getBillingOptions } from "../../api/odoo.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { formatARS } from "../../domain/quote/pricing.js";
import MeasurementReadOnlyView from "../../components/MeasurementReadOnlyView.jsx";

function quoteEditorPath(quote) {
  const kind = String(quote?.payload?.quote_subkind || quote?.catalog_kind || "porton").toLowerCase();
  if (kind === "ipanel") return `/cotizador/ipanel/${quote.id}`;
  if (kind === "otros") return `/cotizador/otros/${quote.id}`;
  return `/cotizador/${quote.id}`;
}
function pillStyle(bg, border) { return { padding: "2px 8px", borderRadius: 999, background: bg, border: `1px solid ${border}`, fontSize: 12, fontWeight: 800 }; }
function measurementStatusLabel(s) { if (s === "pending") return "Pendiente"; if (s === "submitted") return "Enviada"; if (s === "needs_fix") return "A corregir"; if (s === "approved") return "Aprobada"; if (s === "none" || !s) return "Pendiente"; return s; }
function hasMeasurementForPdf(q) { return !!q?.measurement_form || !!q?.measurement_source_quote_id || ["submitted", "needs_fix", "approved"].includes(q?.measurement_status); }
function decisionLabel(d) { if (d === "approved") return "Aprobado"; if (d === "rejected") return "Rechazado"; return "Pendiente"; }
function displayQuoteNumber(quote, fallbackId = null) { if (quote?.quote_number !== null && quote?.quote_number !== undefined && String(quote.quote_number).trim()) return String(quote.quote_number); if (quote?.odoo_sale_order_name) return String(quote.odoo_sale_order_name); return fallbackId ? String(fallbackId).slice(0, 8) : "—"; }
function normalizeBillingText(value) {
  return String(value || "").trim();
}
function normalizeBillingTypeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}
function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}
function sanitizeDocumentNumber(value, identificationTypeName) {
  const raw = normalizeBillingText(value);
  const key = normalizeBillingTypeKey(identificationTypeName);
  if (["cuit", "cuil", "dni"].includes(key)) return digitsOnly(raw);
  return raw;
}
function isValidCuitCuil(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * weights[i];
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === Number(digits[10]);
}
function validateBillingDocument(value) {
  const typeName = normalizeBillingText(value?.identification_type_name);
  const typeKey = normalizeBillingTypeKey(typeName);
  const vatRaw = normalizeBillingText(value?.vat);
  if (!typeKey || !vatRaw) return null;
  const digits = digitsOnly(vatRaw);
  if (typeKey === "cuit" || typeKey === "cuil") {
    if (digits.length !== 11) return `El ${typeName} debe tener 11 dígitos.`;
    if (!isValidCuitCuil(digits)) return `El ${typeName} ingresado no es válido.`;
  }
  if (typeKey === "dni") {
    if (digits.length < 7 || digits.length > 8) return "El DNI debe tener 7 u 8 dígitos.";
  }
  return null;
}
function emptyBillingCustomer(source = {}) {
  const identificationTypeName = normalizeBillingText(source?.identification_type_name || "");
  return {
    name: normalizeBillingText(source?.name || ""),
    vat: sanitizeDocumentNumber(source?.vat || "", identificationTypeName),
    email: normalizeBillingText(source?.email || ""),
    phone: normalizeBillingText(source?.phone || ""),
    address: normalizeBillingText(source?.address || source?.street || ""),
    city: normalizeBillingText(source?.city || ""),
    identification_type_id: source?.identification_type_id ? String(source.identification_type_id) : "",
    identification_type_name: identificationTypeName,
    afip_responsibility_type_id: source?.afip_responsibility_type_id ? String(source.afip_responsibility_type_id) : "",
    afip_responsibility_type_name: normalizeBillingText(source?.afip_responsibility_type_name || ""),
  };
}
function hasBillingCustomerData(customer) {
  if (!customer) return false;
  return [
    customer.name,
    customer.vat,
    customer.email,
    customer.phone,
    customer.address,
    customer.city,
    customer.identification_type_id,
    customer.afip_responsibility_type_id,
  ].some((value) => String(value || "").trim());
}
function billingSummary(customer) {
  if (!hasBillingCustomerData(customer)) return "Se facturará con los datos del cliente cargado.";
  return [
    customer.name,
    customer.identification_type_name || "",
    customer.vat ? `N° ${customer.vat}` : "",
    customer.afip_responsibility_type_name || "",
    customer.address,
    customer.city,
  ].filter(Boolean).join(" · ");
}
function normalizeBillingSelectionValue(list, idValue) {
  const id = String(idValue || "").trim();
  if (!id) return null;
  return (Array.isArray(list) ? list : []).find((item) => String(item?.id || "") === id) || null;
}

function BillingModal({
  value,
  onChange,
  onClose,
  onConfirm,
  loading,
  requiresBilling = false,
  billingOptions,
  optionsLoading = false,
  optionsError = null,
}) {
  const identificationTypes = Array.isArray(billingOptions?.identification_types) ? billingOptions.identification_types : [];
  const afipResponsibilityTypes = Array.isArray(billingOptions?.afip_responsibility_types) ? billingOptions.afip_responsibility_types : [];

  const selectedIdentificationType = normalizeBillingSelectionValue(identificationTypes, value.identification_type_id);
  const selectedAfipResponsibilityType = normalizeBillingSelectionValue(afipResponsibilityTypes, value.afip_responsibility_type_id);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }} onClick={() => { if (!loading) onClose(); }}>
      <div className="card" style={{ width: "100%", maxWidth: 860, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Datos fiscales de facturación</div>
        <div className="muted" style={{ marginBottom: 16 }}>
          {requiresBilling ? "Para esta condición debés cargar los datos fiscales de facturación antes de aprobar." : "Si no cargás estos datos, se facturará con los datos del cliente cargado en el presupuesto."}
        </div>

        {optionsError ? <div style={{ color: "#d93025", fontSize: 13, marginBottom: 12 }}>{optionsError}</div> : null}
        {optionsLoading ? <div className="muted" style={{ marginBottom: 12 }}>Cargando opciones fiscales desde Odoo…</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Razón social / nombre fiscal</div>
            <Input value={value.name} onChange={(v) => onChange({ ...value, name: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Tipo de identificación</div>
            <select
              value={value.identification_type_id}
              onChange={(e) => {
                const selected = normalizeBillingSelectionValue(identificationTypes, e.target.value);
                onChange({
                  ...value,
                  identification_type_id: String(e.target.value || ""),
                  identification_type_name: selected?.name || "",
                });
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
            >
              <option value="">Seleccionar…</option>
              {identificationTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Número de identificación</div>
            <Input value={value.vat} onChange={(v) => onChange({ ...value, vat: sanitizeDocumentNumber(v, value.identification_type_name) })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Tipo de responsabilidad AFIP</div>
            <select
              value={value.afip_responsibility_type_id}
              onChange={(e) => {
                const selected = normalizeBillingSelectionValue(afipResponsibilityTypes, e.target.value);
                onChange({
                  ...value,
                  afip_responsibility_type_id: String(e.target.value || ""),
                  afip_responsibility_type_name: selected?.name || "",
                });
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
            >
              <option value="">Seleccionar…</option>
              {afipResponsibilityTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Correo</div>
            <Input value={value.email} onChange={(v) => onChange({ ...value, email: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Teléfono</div>
            <Input value={value.phone} onChange={(v) => onChange({ ...value, phone: v })} style={{ width: "100%" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="muted" style={{ marginBottom: 6 }}>Dirección fiscal</div>
            <Input value={value.address} onChange={(v) => onChange({ ...value, address: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Localidad</div>
            <Input value={value.city} onChange={(v) => onChange({ ...value, city: v })} style={{ width: "100%" }} />
          </div>
        </div>

        {(selectedIdentificationType || selectedAfipResponsibilityType) ? (
          <div className="muted" style={{ marginTop: 12 }}>
            {[selectedIdentificationType?.name ? `Documento: ${selectedIdentificationType.name}` : "", selectedAfipResponsibilityType?.name ? `AFIP: ${selectedAfipResponsibilityType.name}` : ""].filter(Boolean).join(" · ")}
          </div>
        ) : null}

        <div className="muted" style={{ marginTop: 12 }}>
          {requiresBilling ? "Estos datos son obligatorios para aprobar esta condición." : "Dejá todos los campos vacíos si querés facturar con el cliente del presupuesto."}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={loading || (requiresBilling && optionsLoading)}>{loading ? "Aprobando..." : "Aprobar Comercial"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function QuoteDetailPage() {
  const params = useParams();
  const quoteId = params.id ? String(params.id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [notes, setNotes] = useState("");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingCustomer, setBillingCustomer] = useState(emptyBillingCustomer());

  const q = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getQuote(quoteId), enabled: !!quoteId });
  const linkedDoorsQ = useQuery({ queryKey: ["doors", "by-quote", quoteId], queryFn: () => listDoorsByQuote(quoteId), enabled: !!quoteId });
  const quote = q.data;
  const isRevision = (quote?.quote_kind || "original") === "copy";
  const canCommercial = !!user?.is_enc_comercial && quote?.created_by_role === "vendedor" && !isRevision;
  const canTech = !!user?.is_rev_tecnica && !isRevision;
  const canCommercialAct = canCommercial && quote?.status === "pending_approvals" && quote?.commercial_decision === "pending";
  const canTechAct = canTech && quote?.status === "pending_approvals" && quote?.technical_decision === "pending";
  const conditionMode = String(quote?.payload?.condition_mode || "cond1").trim();
  const requiresCommercialBillingData = quote?.created_by_role === "vendedor" && ["cond1", "special"].includes(conditionMode);
  const billingOptionsQ = useQuery({
    queryKey: ["billing-options"],
    queryFn: () => getBillingOptions(),
    enabled: billingModalOpen && canCommercialAct && requiresCommercialBillingData,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => { setBillingCustomer(emptyBillingCustomer(quote?.payload?.billing_customer || {})); }, [quote?.id, quote?.payload?.billing_customer]);

  const effectiveKind = String(quote?.payload?.quote_subkind || quote?.catalog_kind || "porton").toLowerCase();
  const showMeasurement = effectiveKind === "porton" && (!!quote?.requires_measurement || (quote?.status === "synced_odoo" && quote?.fulfillment_mode === "produccion"));
  const approvalReturnPath = useMemo(() => { const from = location.state?.from; if (typeof from === "string" && from.trim()) return from; if (canTech && !user?.is_vendedor && !user?.is_distribuidor) return "/aprobacion/tecnica"; if (canCommercial && !user?.is_vendedor && !user?.is_distribuidor) return "/aprobacion/comercial"; return "/presupuestos"; }, [location.state, canTech, canCommercial, user]);

  const commercialM = useMutation({ mutationFn: ({ action, billingCustomer: nextBillingCustomer }) => reviewCommercial(quoteId, { action, notes, billingCustomer: nextBillingCustomer }), onSuccess: () => navigate(approvalReturnPath) });
  const revisionM = useMutation({ mutationFn: () => createRevisionQuote(quoteId), onSuccess: (newQuote) => { if (!newQuote?.id) return; navigate(quoteEditorPath(newQuote)); } });
  const techM = useMutation({ mutationFn: ({ action }) => reviewTechnical(quoteId, { action, notes }), onSuccess: () => navigate(approvalReturnPath) });

  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const rejectionBoxes = useMemo(() => { if (!quote) return []; const arr = []; if (quote.commercial_decision === "rejected") arr.push({ title: "Rechazo Comercial", body: quote.commercial_notes || "(sin motivo)" }); if (quote.technical_decision === "rejected") arr.push({ title: "Rechazo Técnica", body: quote.technical_notes || "(sin motivo)" }); return arr; }, [quote]);

  function handleCommercialApproveClick() {
    if (requiresCommercialBillingData) {
      setBillingModalOpen(true);
      return;
    }
    commercialM.mutate({ action: "approve", billingCustomer: null });
  }

  function confirmCommercialApproval() {
    const normalized = emptyBillingCustomer(billingCustomer);
    if (requiresCommercialBillingData) {
      const missing = [];
      if (!normalized.name) missing.push("razón social / nombre fiscal");
      if (!normalized.identification_type_id) missing.push("tipo de identificación");
      if (!normalized.vat) missing.push("número de identificación");
      if (!normalized.afip_responsibility_type_id) missing.push("tipo de responsabilidad AFIP");
      if (!normalized.phone) missing.push("teléfono");
      if (!normalized.address) missing.push("dirección fiscal");
      if (!normalized.city) missing.push("localidad");
      if (missing.length) {
        window.alert(`Completá los datos fiscales obligatorios: ${missing.join(", ")}.`);
        return;
      }
    } else if (hasBillingCustomerData(normalized) && !normalized.name) {
      window.alert("Si cargás datos fiscales, completá al menos la razón social / nombre fiscal.");
      return;
    }
    commercialM.mutate({ action: "approve", billingCustomer: hasBillingCustomerData(normalized) ? normalized : null });
  }

  return (
    <div className="container">
      {billingModalOpen ? <BillingModal value={billingCustomer} onChange={setBillingCustomer} onClose={() => setBillingModalOpen(false)} onConfirm={confirmCommercialApproval} loading={commercialM.isPending} requiresBilling={requiresCommercialBillingData} billingOptions={billingOptionsQ.data} optionsLoading={billingOptionsQ.isLoading || billingOptionsQ.isFetching} optionsError={billingOptionsQ.isError ? billingOptionsQ.error.message : null} /> : null}
      <div className="card">
        <h2 style={{ margin: 0 }}>{isRevision ? "Ajuste" : "Presupuesto"} #{displayQuoteNumber(quote, quoteId)}</h2>
        {q.isLoading ? <div className="muted">Cargando...</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div> : null}
        {quote ? (<>
          <div className="spacer" />
          <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>Estado: <b>{isRevision ? (quote.final_status || quote.status) : quote.status}</b></span>
            <span>· Número: <b>{displayQuoteNumber(quote, quoteId)}</b></span>
            <span>· Creado por: <b>{quote.created_by_role}</b></span>
            <span>· Destino: <b>{quote.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</b></span>
            {!isRevision && quote.status === "synced_odoo" ? <span style={pillStyle("#e7f7ed", "#bfe6c8")}>En Odoo: {quote.odoo_sale_order_name || `SO#${quote.odoo_sale_order_id}`}</span> : null}
            {isRevision && quote.final_sale_order_name ? <span style={pillStyle("#e7f7ed", "#bfe6c8")}>Odoo final: {quote.final_sale_order_name}</span> : null}
            {isRevision && quote.final_absorbed_by_company ? <span style={pillStyle("#fff7e6", "#ffd9a8")}>Diferencia absorbida por empresa</span> : null}
            {quote.status === "syncing_odoo" ? <span style={pillStyle("#fff7e6", "#ffd9a8")}>Sincronizando a Odoo…</span> : null}
            {quote.status === "pending_approvals" && !isRevision ? <span style={pillStyle("#eef4ff", "#c7dafc")}>En aprobación</span> : null}
          </div>
          {!!rejectionBoxes.length ? <><div className="spacer" />{rejectionBoxes.map((b) => <div key={b.title} style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5", marginBottom: 10 }}><div style={{ fontWeight: 900, marginBottom: 6 }}>{b.title}</div><div>{b.body}</div></div>)}</> : null}
          <div className="spacer" />
          <div className="row">
            <div style={{ flex: 1 }}><div className="muted">Cliente</div><div style={{ fontWeight: 700 }}>{quote.end_customer?.name || "(sin nombre)"}</div><div className="muted">{quote.end_customer?.phone || ""}</div><div className="muted">{quote.end_customer?.address || ""}</div>{isRevision && quote.parent_quote_id ? <div className="muted">Ref. original: <b>{String(quote.parent_quote_id).slice(0, 8)}</b></div> : null}</div>
            <div style={{ flex: 1 }}><div className="muted">Observaciones</div><div>{quote.note || <span className="muted">(sin notas)</span>}</div>{isRevision && typeof quote.final_difference_amount === "number" ? <div className="muted" style={{ marginTop: 8 }}>Diferencia final: <b>{formatARS(quote.final_difference_amount)}</b></div> : null}</div>
            <div style={{ flex: 1 }}><div className="muted">Facturación</div><div>{billingSummary(emptyBillingCustomer(quote.payload?.billing_customer || {}))}</div><div className="muted" style={{ marginTop: 6 }}>Condición: <b>{conditionMode === "cond1" ? "Condición 1" : conditionMode === "cond2" ? "Condición 2" : "Especial"}</b></div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "flex-end" }}>
              {((!isRevision && quote.status === "draft") || (isRevision && !["syncing_odoo", "synced_odoo"].includes(quote.final_status || ""))) ? <Button onClick={() => navigate(quoteEditorPath(quote))}>{isRevision ? "Editar final" : "Editar"}</Button> : null}
              {!isRevision && quote.final_copy_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${quote.final_copy_id}`)}>Ver final</Button> : null}
              {((user?.is_vendedor || user?.is_distribuidor) && String(quote.created_by_user_id) === String(user.user_id) && !isRevision && quote.status === "synced_odoo" && hasMeasurementForPdf(quote) && !quote.final_copy_id) ? <Button variant="ghost" disabled={revisionM.isPending} onClick={() => revisionM.mutate()} title="Crear un nuevo presupuesto (ajuste) referenciado a este">{revisionM.isPending ? "Creando…" : "Crear ajuste"}</Button> : null}
              {isRevision && quote.parent_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${quote.parent_quote_id}`)}>Ver original</Button> : null}
              <Button variant="ghost" onClick={() => navigate(approvalReturnPath)}>Volver</Button>
            </div>
          </div>
          <div className="spacer" />
          {!!linkedDoorsQ.data?.length && !isRevision ? <div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900, marginBottom: 8 }}>Puertas vinculadas</div><table><thead><tr><th>Código</th><th>Cliente</th><th>Estado</th><th>Venta Odoo</th><th>Compra Odoo</th><th></th></tr></thead><tbody>{linkedDoorsQ.data.map((d) => <tr key={d.id}><td>{d.door_code}</td><td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td><td>{d.status}</td><td>{d.odoo_sale_order_name || "—"}</td><td>{d.odoo_purchase_order_name || "—"}</td><td className="right"><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Ver puerta</Button></td></tr>)}</tbody></table></div> : null}
          <div className="spacer" />
          {!isRevision ? <div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900, marginBottom: 6 }}>Aprobaciones</div><div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><span>Comercial: <b>{decisionLabel(quote.commercial_decision)}</b>{quote.commercial_decision === "rejected" && quote.commercial_notes ? ` · ${quote.commercial_notes}` : ""}</span><span>Técnica: <b>{decisionLabel(quote.technical_decision)}</b>{quote.technical_decision === "rejected" && quote.technical_notes ? ` · ${quote.technical_notes}` : ""}</span></div></div> : null}
          {showMeasurement && !isRevision ? <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><div style={{ fontWeight: 900 }}>Planilla de medición</div><div className="muted">Estado: <b>{measurementStatusLabel(quote.measurement_status)}</b></div></div>{hasMeasurementForPdf(quote) ? <Button variant="secondary" onClick={() => downloadMedicionPdf(quote.id)}>Descargar PDF</Button> : null}</div><div className="spacer" />{quote.measurement_form ? <MeasurementReadOnlyView quote={quote} /> : null}</div></> : null}
          <h3 style={{ marginTop: 0 }}>Ítems</h3>
          {!lines.length ? <div className="muted">Sin ítems</div> : null}
          {!!lines.length ? <table><thead><tr><th>Producto</th><th className="right">Cant.</th><th className="right">Base</th><th className="right">Total</th></tr></thead><tbody>{lines.map((l, idx) => { const qty = Number(l.qty || 0); const base = Number(l.basePrice ?? l.price ?? 0); const total = qty * base; return <tr key={`${l.product_id}-${idx}`}><td><div style={{ fontWeight: 700 }}>{l.name || `Producto ${l.product_id}`}</div><div className="muted">ID: {l.product_id} {l.code ? `| ${l.code}` : ""}</div></td><td className="right">{qty}</td><td className="right">{formatARS(base)}</td><td className="right" style={{ fontWeight: 800 }}>{formatARS(total)}</td></tr>; })}</tbody></table> : null}
          {(canCommercial || canTech) ? <><div className="spacer" /><div className="card" style={{ background: "#fafafa" }}><div style={{ fontWeight: 900 }}>Acciones de revisión</div><div className="muted">Solo si está en <b>pending_approvals</b> y tu decisión está en <b>pending</b>.</div><div className="spacer" /><div className="muted">Observaciones del revisor</div><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo si rechaza / notas si aprueba…" style={{ width: "100%", minHeight: 60, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none", resize: "vertical" }} /><div className="spacer" /><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{canCommercial ? <><Button disabled={!canCommercialAct || commercialM.isPending} onClick={handleCommercialApproveClick}>{commercialM.isPending ? "Procesando..." : "Aprobar Comercial"}</Button><Button variant="danger" disabled={!canCommercialAct || commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject", billingCustomer: null })}>Rechazar Comercial</Button></> : null}{canTech ? <><Button disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>{techM.isPending ? "Procesando..." : "Aprobar Técnica"}</Button><Button variant="danger" disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>Rechazar Técnica</Button></> : null}</div></div></> : null}
        </>) : null}
      </div>
    </div>
  );
}
