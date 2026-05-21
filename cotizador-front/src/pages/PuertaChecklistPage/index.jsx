import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";

import {
  getDoor,
  getDoorQuotePdfPayload,
  getDoorQuoteSummary,
  reviewDoorCommercial,
  reviewDoorTechnical,
  submitDoor,
  updateDoor,
} from "../../api/doors.js";
import { getQuote } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { downloadPresupuestoPdf, downloadProformaPdf } from "../../api/pdf.js";

const STATUS_OPTIONS = ["Pendiente", "OK", "N/A"].map((x) => ({ value: x, label: x }));
const GIRO_OPTIONS = ["ADENTRO", "AFUERA"].map((x) => ({ value: x, label: x }));
const MANO_OPTIONS = ["IZQUIERDA", "DERECHA"].map((x) => ({ value: x, label: x }));
const ANGULO_OPTIONS = ["90", "120", "180", "Otro"].map((x) => ({ value: x, label: x === "Otro" ? x : `${x}°` }));
const INTERFERENCIA_OPTIONS = ["Ninguna", "Pared/retorno", "Mueble", "Escalon/desnivel", "Baranda/columna", "Artefactos", "Otra"].map((x) => ({ value: x, label: x }));
const ACCESORIO_OPTIONS = ["Ninguno", "Tope", "Retenedor", "Cierrapuertas", "Tope + Retenedor", "Otro"].map((x) => ({ value: x, label: x }));
const FULFILLMENT_OPTIONS = [{ value: "acopio", label: "Acopio" }, { value: "produccion", label: "Produccion" }];

function safe(v) { return String(v || "").trim(); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function textOrDash(v) { return safe(v) || "-"; }
function Select({ value, onChange, options, placeholder = "-", disabled = false, style = {} }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%", ...style }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Section({ title, children }) { return <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}><div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>{children}</div>; }
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function Field({ label, children, minWidth = 220, required = false, invalid = false }) { return <div style={{ flex: 1, minWidth }}><div className="muted" style={{ marginBottom: 6, color: invalid ? "#d93025" : undefined }}>{label}{required ? <span style={{ color: "#d93025" }}> *</span> : null}</div>{children}</div>; }
function invalidFieldStyle(invalid) { return invalid ? { border: "1px solid #d93025", background: "#fff5f5" } : {}; }
function normalizeCustomer(c = {}) {
  const out = { ...(c || {}) };
  out.name = safe(out.name || [out.first_name, out.last_name].filter(Boolean).join(" "));
  out.phone = safe(out.phone);
  out.email = safe(out.email);
  out.address = safe(out.address);
  out.city = safe(out.city);
  out.maps_url = safe(out.maps_url);
  return out;
}
function normalizeForm(raw, user) {
  const record = raw && typeof raw === "object" ? { ...raw } : {};
  record.end_customer = normalizeCustomer(record.end_customer || {});
  record.obra_cliente = record.obra_cliente || record.end_customer.name || "";
  record.fecha = record.fecha || todayISO();
  record.responsable = record.responsable || user?.full_name || user?.username || "";
  record.nv = record.nv || "";
  record.tipo = record.tipo || "Puerta principal";
  record.vista = record.vista || "Exterior";
  record.fulfillment_mode = record.fulfillment_mode || "";
  record.sentido_apertura = record.sentido_apertura || "ADENTRO";
  record.mano_bisagras = record.mano_bisagras || "IZQUIERDA";
  record.angulo_apertura = record.angulo_apertura || "90";
  record.angulo_otro = record.angulo_otro || "";
  record.motivo_no_estandar = record.motivo_no_estandar || "";
  record.interferencias = record.interferencias || "Ninguna";
  record.accesorios = record.accesorios || "Ninguno";
  record.tipo_estructura = record.tipo_estructura || record.tipo_marco || "";
  record.tipo_hoja = record.tipo_hoja || "";
  record.lado_cerradura = record.lado_cerradura || "";
  record.ancho_puerta_mm = record.ancho_puerta_mm || record.ancho_marco_mm || "";
  record.alto_puerta_mm = record.alto_puerta_mm || record.alto_marco_mm || "";
  record.structure_quote_id = record.structure_quote_id || "";
  record.structure_quote_label = record.structure_quote_label || "";
  record.ipanel_quote_id = record.ipanel_quote_id || "";
  record.ipanel_quote_label = record.ipanel_quote_label || "";
  record.observaciones = record.observaciones || "";
  record.checklist = Array.isArray(record.checklist) ? record.checklist.map((row) => ({ ...row, status: row.status || "Pendiente", notes: row.notes || "", responsible: row.responsible || record.responsable, date: row.date || todayISO(), ok: row.ok === true || String(row.status || "").toUpperCase() === "OK" })) : [];
  return record;
}
function isMissing(form, key) {
  if (key === "linked_quote_id") return false;
  if (key === "end_customer.name") return !safe(form?.end_customer?.name || form?.obra_cliente);
  if (key === "end_customer.phone") return !safe(form?.end_customer?.phone);
  if (key === "structure_quote_id") return !safe(form?.structure_quote_id);
  if (key === "ipanel_quote_id") return !safe(form?.ipanel_quote_id);
  if (key === "fulfillment_mode") return !["acopio", "produccion"].includes(safe(form?.fulfillment_mode).toLowerCase());
  return false;
}
function decisionLabel(v) { if (v === "approved") return "Aprobado"; if (v === "rejected") return "Rechazado"; return "Pendiente"; }
function buildStandardText(form) {
  const sentido = textOrDash(form.sentido_apertura);
  const mano = textOrDash(form.mano_bisagras);
  const angulo = form.angulo_apertura === "Otro" ? (safe(form.angulo_otro) || "Otro") : textOrDash(form.angulo_apertura);
  return `Puerta principal (vista exterior): ${mano}, abre hacia ${sentido}, apertura ${angulo}, interferencias: ${textOrDash(form.interferencias)}, accesorios: ${textOrDash(form.accesorios)}.`;
}
function buildReady(form) { return (form.checklist || []).every((row) => row.status === "OK" || row.status === "N/A"); }
function structureEditorKind(quote, door) {
  const kind = safe(quote?.catalog_kind || door?.record?.structure_catalog_kind || "puerta").toLowerCase();
  return kind === "puerta" ? "puerta" : "otros";
}

export default function PuertaChecklistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const searchParams = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const returnToPanel = searchParams.get("return_to_panel") === "1" || searchParams.get("door_workflow") === "1";

  const q = useQuery({ queryKey: ["door", id], queryFn: () => getDoor(id), enabled: !!id });
  const door = q.data;
  const [form, setForm] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => { if (door && user) setForm(normalizeForm(door.record, user)); }, [door, user]);

  const structureQuoteId = safe(form?.structure_quote_id || door?.structure_quote_id);
  const ipanelQuoteId = safe(form?.ipanel_quote_id);
  const structureQ = useQuery({ queryKey: ["quote", "door-structure", structureQuoteId], queryFn: () => getQuote(structureQuoteId), enabled: !!structureQuoteId });
  const ipanelQ = useQuery({ queryKey: ["quote", "door-ipanel", ipanelQuoteId], queryFn: () => getQuote(ipanelQuoteId), enabled: !!ipanelQuoteId });
  const summaryQ = useQuery({ queryKey: ["door-quote-summary", id, form?.ancho_puerta_mm, form?.alto_puerta_mm, structureQuoteId, ipanelQuoteId], queryFn: () => getDoorQuoteSummary(id, "presupuesto"), enabled: !!id });

  const authUserId = String(user?.user_id ?? user?.id ?? "");
  const canSellerEdit = !!user?.is_vendedor && authUserId === String(door?.created_by_user_id ?? "");
  const canCommercialAct = !!user?.is_enc_comercial && door?.status === "pending_approvals" && door?.commercial_decision === "pending";
  const canTechAct = !!user?.is_rev_tecnica && door?.status === "pending_approvals" && door?.technical_decision === "pending";
  const confirmMissing = useMemo(() => form ? ["end_customer.name", "end_customer.phone", "structure_quote_id", "ipanel_quote_id", "fulfillment_mode"].filter((key) => isMissing(form, key)) : [], [form]);
  const pdfReady = confirmMissing.length === 0 && !!door?.linked_quote_id;
  const labels = { "end_customer.name": "Nombre del cliente", "end_customer.phone": "Telefono del cliente", structure_quote_id: "Estructura vinculada", ipanel_quote_id: "Ipanel vinculado", fulfillment_mode: "Destino" };

  function continueDoorWorkflow(savedDoor) { if (!returnToPanel) return false; navigate(`/puertas/${savedDoor?.id || id}`); return true; }

  const saveM = useMutation({
    mutationFn: () => updateDoor(id, { record: form }),
    onSuccess: (saved) => { setForm(normalizeForm(saved.record, user)); q.refetch(); summaryQ.refetch(); if (continueDoorWorkflow(saved)) { toast.success("Datos tecnicos guardados. Volviendo al panel."); return; } toast.success("Datos tecnicos de puerta guardados."); },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la puerta"),
  });
  const submitM = useMutation({
    mutationFn: async () => { const saved = await updateDoor(id, { record: form }); setForm(normalizeForm(saved.record, user)); return await submitDoor(id); },
    onSuccess: (saved) => { q.refetch(); if (continueDoorWorkflow(saved)) { toast.success("Puerta guardada. Volviendo al panel."); return; } toast.success("Puerta enviada a aprobacion."); },
    onError: (e) => toast.error(e?.message || "No se pudo enviar la puerta"),
  });
  const commercialM = useMutation({ mutationFn: ({ action }) => reviewDoorCommercial(id, { action, notes: reviewNotes }), onSuccess: () => { toast.success("Revision comercial registrada."); q.refetch(); }, onError: (e) => toast.error(e?.message || "No se pudo registrar la revision comercial") });
  const techM = useMutation({ mutationFn: ({ action }) => reviewDoorTechnical(id, { action, notes: reviewNotes }), onSuccess: () => { toast.success("Revision tecnica registrada."); q.refetch(); }, onError: (e) => toast.error(e?.message || "No se pudo registrar la revision tecnica") });

  const summary = useMemo(() => {
    if (!form) return { total: 0, ok: 0, ready: false, standardText: "" };
    const ok = form.checklist.filter((row) => row.ok).length;
    return { total: form.checklist.length, ok, ready: buildReady(form), standardText: buildStandardText(form) };
  }, [form]);

  async function handleDoorPdf(mode = "presupuesto") {
    try {
      if (!pdfReady) { toast.error("Completa porton vinculado, cliente, estructura, Ipanel y destino para habilitar el PDF."); return; }
      if (canSellerEdit) await updateDoor(id, { record: form });
      const payload = await getDoorQuotePdfPayload(id, mode);
      const payloadWithSeller = { ...(payload || {}), seller_name: user?.full_name || user?.username || "" };
      if (mode === "proforma") await downloadProformaPdf(payloadWithSeller);
      else await downloadPresupuestoPdf(payloadWithSeller);
    } catch (e) { toast.error(e?.message || "No se pudo generar el PDF de puerta"); }
  }

  if (!user) return null;

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Datos tecnicos puerta · {door?.door_code || "-"}</h2>
            <div className="muted">Registro tecnico de la puerta vinculada a estructura, Ipanel y porton.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {door?.linked_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver porton</Button> : null}
            {structureQuoteId ? <Button variant="ghost" onClick={() => navigate(`/cotizador/${structureEditorKind(structureQ.data, door)}/${structureQuoteId}`)}>Ver estructura</Button> : null}
            {ipanelQuoteId ? <Button variant="ghost" onClick={() => navigate(`/cotizador/ipanel/${ipanelQuoteId}`)}>Ver Ipanel</Button> : null}
            <Button variant="secondary" disabled={!pdfReady} onClick={() => handleDoorPdf("presupuesto")}>PDF puerta</Button>
            {user?.is_distribuidor ? <Button variant="secondary" disabled={!pdfReady} onClick={() => handleDoorPdf("proforma")}>PDF proforma puerta</Button> : null}
            <Button variant="ghost" onClick={() => navigate(`/puertas/${id}`)}>Volver a la puerta</Button>
          </div>
        </div>
        {q.isLoading && <><div className="spacer" /><div className="muted">Cargando...</div></>}
        {q.isError && <><div className="spacer" /><div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div></>}
      </div>

      {door && form && (
        <>
          <div className="spacer" />
          <Section title="Estado">
            <div className="muted" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>Estado: <b>{door.status}</b></span>
              <span>Comercial: <b>{decisionLabel(door.commercial_decision)}</b></span>
              <span>Tecnica: <b>{decisionLabel(door.technical_decision)}</b></span>
              <span>Porton: <b>{door.linked_quote_odoo_name || door.linked_quote_number || form.asociado_porton || "Sin vincular"}</b></span>
              {door.odoo_sale_order_name ? <span>Venta Odoo: <b>{door.odoo_sale_order_name}</b></span> : null}
            </div>
          </Section>

          {canSellerEdit && (!door.linked_quote_id || confirmMissing.length > 0) && (
            <Section title="Pendientes para confirmar">
              <div style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5" }}>
                {!door.linked_quote_id ? <div style={{ color: "#b42318", marginBottom: 4 }}>• Porton vinculado</div> : null}
                {confirmMissing.map((fieldKey) => <div key={fieldKey} style={{ color: "#b42318", marginBottom: 4 }}>• {labels[fieldKey] || fieldKey}</div>)}
              </div>
            </Section>
          )}

          <Section title="Cliente">
            <Row>
              <Field label="Nombre" required invalid={canSellerEdit && isMissing(form, "end_customer.name")}>
                <Input value={form.end_customer?.name || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), name: v }, obra_cliente: v })} style={{ width: "100%", ...invalidFieldStyle(canSellerEdit && isMissing(form, "end_customer.name")) }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Telefono" required invalid={canSellerEdit && isMissing(form, "end_customer.phone")}>
                <Input value={form.end_customer?.phone || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), phone: v } })} style={{ width: "100%", ...invalidFieldStyle(canSellerEdit && isMissing(form, "end_customer.phone")) }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Email"><Input value={form.end_customer?.email || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), email: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Direccion"><Input value={form.end_customer?.address || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), address: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Localidad"><Input value={form.end_customer?.city || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), city: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Maps URL"><Input value={form.end_customer?.maps_url || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), maps_url: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
            </Row>
          </Section>

          <Section title="Datos del registro">
            <Row>
              <Field label="Obra / Cliente"><Input value={form.obra_cliente || ""} onChange={(v) => setForm({ ...form, obra_cliente: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="NV"><Input value={form.nv || ""} onChange={(v) => setForm({ ...form, nv: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Asociado a porton"><Input value={form.asociado_porton || ""} onChange={(v) => setForm({ ...form, asociado_porton: v })} style={{ width: "100%" }} disabled /></Field>
              <Field label="Destino" required invalid={canSellerEdit && isMissing(form, "fulfillment_mode")}>
                <Select value={safe(form.fulfillment_mode).toLowerCase()} onChange={(v) => setForm({ ...form, fulfillment_mode: v })} options={FULFILLMENT_OPTIONS} placeholder="Seleccionar destino" disabled={!canSellerEdit || !!door.linked_quote_id} style={invalidFieldStyle(canSellerEdit && isMissing(form, "fulfillment_mode"))} />
              </Field>
            </Row>
            {door.linked_quote_id ? <div className="muted" style={{ marginTop: 8 }}>El destino de la puerta vinculada se toma del presupuesto del porton.</div> : null}
          </Section>

          <Section title="Estructura + Ipanel">
            <Row>
              <Field label="Estructura vinculada" required invalid={canSellerEdit && isMissing(form, "structure_quote_id")}><Input value={form.structure_quote_label || structureQ.data?.quote_number || form.structure_quote_id || ""} onChange={(v) => setForm({ ...form, structure_quote_label: v })} style={{ width: "100%", ...invalidFieldStyle(canSellerEdit && isMissing(form, "structure_quote_id")) }} disabled /></Field>
              <Field label="Ipanel vinculado" required invalid={canSellerEdit && isMissing(form, "ipanel_quote_id")}><Input value={form.ipanel_quote_label || ipanelQ.data?.quote_number || form.ipanel_quote_id || ""} onChange={(v) => setForm({ ...form, ipanel_quote_label: v })} style={{ width: "100%", ...invalidFieldStyle(canSellerEdit && isMissing(form, "ipanel_quote_id")) }} disabled /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Ancho puerta (mm)"><Input value={form.ancho_puerta_mm || ""} onChange={(v) => setForm({ ...form, ancho_puerta_mm: v, ancho_marco_mm: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Alto puerta (mm)"><Input value={form.alto_puerta_mm || ""} onChange={(v) => setForm({ ...form, alto_puerta_mm: v, alto_marco_mm: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
            </Row>
            <div className="spacer" />
            {summaryQ.data ? (
              <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 12, background: "#fff" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Calculo presupuesto puerta</div>
                <div className="muted">precio_estructura: <b>$ {Number(summaryQ.data.variables?.precio_estructura || 0).toLocaleString("es-AR")}</b></div>
                <div className="muted">precio_ipanel: <b>$ {Number(summaryQ.data.variables?.precio_ipanel || 0).toLocaleString("es-AR")}</b></div>
                {summaryQ.data.technical_dimensions?.ipanel_width_mm ? <div className="muted">Ipanel calculado: <b>{summaryQ.data.technical_dimensions.ipanel_width_mm} x {summaryQ.data.technical_dimensions.ipanel_height_mm} mm</b></div> : null}
                <div className="spacer" />
                <div style={{ fontWeight: 900, fontSize: 18 }}>Total puerta: $ {Number(summaryQ.data.total || 0).toLocaleString("es-AR")}</div>
              </div>
            ) : <div className="muted">Calculando puerta...</div>}
          </Section>

          <Section title="Definicion tecnica (desde exterior)">
            <Row>
              <Field label="Sentido de apertura"><Select value={form.sentido_apertura || ""} onChange={(v) => setForm({ ...form, sentido_apertura: v })} options={GIRO_OPTIONS} disabled={!canSellerEdit} /></Field>
              <Field label="Mano (bisagras)"><Select value={form.mano_bisagras || ""} onChange={(v) => setForm({ ...form, mano_bisagras: v })} options={MANO_OPTIONS} disabled={!canSellerEdit} /></Field>
              <Field label="Angulo de apertura"><Select value={form.angulo_apertura || ""} onChange={(v) => setForm({ ...form, angulo_apertura: v })} options={ANGULO_OPTIONS} disabled={!canSellerEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Angulo (si elegiste Otro)"><Input value={form.angulo_otro || ""} onChange={(v) => setForm({ ...form, angulo_otro: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Interferencias"><Select value={form.interferencias || ""} onChange={(v) => setForm({ ...form, interferencias: v })} options={INTERFERENCIA_OPTIONS} disabled={!canSellerEdit} /></Field>
              <Field label="Accesorios"><Select value={form.accesorios || ""} onChange={(v) => setForm({ ...form, accesorios: v })} options={ACCESORIO_OPTIONS} disabled={!canSellerEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Tipo de estructura"><Input value={form.tipo_estructura || ""} onChange={(v) => setForm({ ...form, tipo_estructura: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Tipo de hoja"><Input value={form.tipo_hoja || ""} onChange={(v) => setForm({ ...form, tipo_hoja: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
              <Field label="Lado de cerradura (desde exterior)"><Input value={form.lado_cerradura || ""} onChange={(v) => setForm({ ...form, lado_cerradura: v })} style={{ width: "100%" }} disabled={!canSellerEdit} /></Field>
            </Row>
            <div className="spacer" />
            <Field label="Motivo / condicion no estandar"><textarea value={form.motivo_no_estandar || ""} onChange={(e) => setForm({ ...form, motivo_no_estandar: e.target.value })} style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} disabled={!canSellerEdit} /></Field>
          </Section>

          <Section title="Checklist de verificacion">
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Seccion</th><th>Item</th><th>Estado</th><th>Notas</th><th>Responsable</th><th>Fecha</th><th>OK</th></tr></thead>
                <tbody>
                  {form.checklist.map((row, idx) => (
                    <tr key={`${row.section}-${idx}`}>
                      <td>{row.section}</td><td style={{ minWidth: 320 }}>{row.item}</td>
                      <td style={{ minWidth: 140 }}><Select value={row.status} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, status: v, ok: v === "OK" }; setForm({ ...form, checklist: next }); }} options={STATUS_OPTIONS} placeholder="Estado" disabled={!canSellerEdit} /></td>
                      <td style={{ minWidth: 260 }}><textarea value={row.notes || ""} onChange={(e) => { const next = form.checklist.slice(); next[idx] = { ...row, notes: e.target.value }; setForm({ ...form, checklist: next }); }} style={{ width: "100%", minHeight: 48, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} disabled={!canSellerEdit} /></td>
                      <td style={{ minWidth: 180 }}><Input value={row.responsible || ""} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, responsible: v }; setForm({ ...form, checklist: next }); }} style={{ width: "100%" }} disabled={!canSellerEdit} /></td>
                      <td style={{ minWidth: 160 }}><Input type="date" value={row.date || ""} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, date: v }; setForm({ ...form, checklist: next }); }} style={{ width: "100%" }} disabled={!canSellerEdit} /></td>
                      <td style={{ textAlign: "center", minWidth: 80 }}><input type="checkbox" checked={!!row.ok} disabled={!canSellerEdit} onChange={(e) => { const checked = e.target.checked; const next = form.checklist.slice(); next[idx] = { ...row, ok: checked, status: checked ? "OK" : (row.status === "OK" ? "Pendiente" : row.status) }; setForm({ ...form, checklist: next }); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Resumen">
            <Row>
              <Field label="Codigo de puerta"><Input value={door.door_code || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Total items"><Input value={String(summary.total)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="OK"><Input value={String(summary.ok)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Listo para fabricacion"><Input value={summary.ready ? "SI" : "NO"} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
            </Row>
          </Section>

          <Section title="Registro final (copiar / pegar)"><Field label="Texto estandar" minWidth={500}><textarea value={summary.standardText} onChange={() => {}} readOnly style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#fff" }} /></Field></Section>
          <Section title="Observaciones"><textarea value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} disabled={!canSellerEdit} /></Section>

          {(canCommercialAct || canTechAct) && (
            <Section title="Acciones de revision">
              <Field label="Observaciones del revisor"><textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} /></Field>
              <div className="spacer" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canCommercialAct && <><Button disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "approve" })}>Aprobar Comercial</Button><Button variant="danger" disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject" })}>Rechazar Comercial</Button></>}
                {canTechAct && <><Button disabled={techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>Aprobar Tecnica</Button><Button variant="danger" disabled={techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>Rechazar Tecnica</Button></>}
              </div>
            </Section>
          )}

          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canSellerEdit && <><Button onClick={() => saveM.mutate()} disabled={saveM.isPending || submitM.isPending}>Guardar</Button><Button variant="primary" onClick={() => submitM.mutate()} disabled={saveM.isPending || submitM.isPending || !pdfReady}>{submitM.isPending ? "Enviando..." : "Enviar a aprobacion"}</Button></>}
              <Button variant="secondary" disabled={!pdfReady} onClick={() => handleDoorPdf("presupuesto")}>Imprimir presupuesto puerta</Button>
              {user?.is_distribuidor ? <Button variant="secondary" disabled={!pdfReady} onClick={() => handleDoorPdf("proforma")}>Imprimir proforma puerta</Button> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
