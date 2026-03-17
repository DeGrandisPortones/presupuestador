import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import {
  getDoor,
  getDoorQuotePdfPayload,
  getDoorQuoteSummary,
  listDoorSuppliers,
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

const STATUS_OPTIONS = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "OK", label: "OK" },
  { value: "N/A", label: "N/A" },
];
const GIRO_OPTIONS = [
  { value: "ADENTRO", label: "ADENTRO" },
  { value: "AFUERA", label: "AFUERA" },
];
const MANO_OPTIONS = [
  { value: "IZQUIERDA", label: "IZQUIERDA" },
  { value: "DERECHA", label: "DERECHA" },
];
const ANGULO_OPTIONS = [
  { value: "90", label: "90°" },
  { value: "120", label: "120°" },
  { value: "180", label: "180°" },
  { value: "Otro", label: "Otro" },
];
const INTERFERENCIA_OPTIONS = [
  { value: "Ninguna", label: "Ninguna" },
  { value: "Pared/retorno", label: "Pared/retorno" },
  { value: "Mueble", label: "Mueble" },
  { value: "Escalón/desnivel", label: "Escalón/desnivel" },
  { value: "Baranda/columna", label: "Baranda/columna" },
  { value: "Artefactos", label: "Artefactos" },
  { value: "Otra", label: "Otra" },
];
const ACCESORIO_OPTIONS = [
  { value: "Ninguno", label: "Ninguno" },
  { value: "Tope", label: "Tope" },
  { value: "Retenedor", label: "Retenedor" },
  { value: "Cierrapuertas", label: "Cierrapuertas" },
  { value: "Tope + Retenedor", label: "Tope + Retenedor" },
  { value: "Otro", label: "Otro" },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function textOrDash(v) {
  const s = String(v ?? "").trim();
  return s || "—";
}
function Select({ value, onChange, options, placeholder = "—", disabled = false }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
function Section({ title, children }) {
  return (
    <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}
function Field({ label, children, minWidth = 220 }) {
  return (
    <div style={{ flex: 1, minWidth }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function buildStandardText(form) {
  const sentido = textOrDash(form.sentido_apertura);
  const mano = textOrDash(form.mano_bisagras);
  const angulo = form.angulo_apertura === "Otro"
    ? (String(form.angulo_otro || "").trim() || "Otro")
    : textOrDash(form.angulo_apertura);
  const interferencias = textOrDash(form.interferencias);
  const accesorios = textOrDash(form.accesorios);

  return `Marco de puerta principal (vista exterior): ${mano}, abre hacia ${sentido}, apertura ${angulo}, interferencias: ${interferencias}, accesorios: ${accesorios}.`;
}
function buildReadyForManufacturing(form) {
  return form.checklist.every((row) => row.status === "OK" || row.status === "N/A");
}
function normalizeForm(raw, user) {
  const record = raw && typeof raw === "object" ? { ...raw } : {};
  record.end_customer = record.end_customer && typeof record.end_customer === "object"
    ? { ...record.end_customer }
    : { name: "", phone: "", email: "", address: "", maps_url: "", city: "" };
  record.obra_cliente = record.obra_cliente || record.end_customer.name || "";
  record.fecha = record.fecha || todayISO();
  record.responsable = record.responsable || user?.full_name || user?.username || "";
  record.ancho_marco_mm = record.ancho_marco_mm || "";
  record.alto_marco_mm = record.alto_marco_mm || "";
  record.ipanel_quote_id = record.ipanel_quote_id || "";
  record.ipanel_quote_label = record.ipanel_quote_label || "";
  record.checklist = Array.isArray(record.checklist) ? record.checklist.map((row) => ({
    ...row,
    status: row.status || "Pendiente",
    notes: row.notes || "",
    responsible: row.responsible || record.responsable,
    date: row.date || todayISO(),
    ok: row.ok === true || String(row.status || "").toUpperCase() === "OK",
  })) : [];
  return record;
}
function decisionLabel(v) {
  if (v === "approved") return "Aprobado";
  if (v === "rejected") return "Rechazado";
  return "Pendiente";
}

export default function PuertaChecklistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const q = useQuery({
    queryKey: ["door", id],
    queryFn: () => getDoor(id),
    enabled: !!id,
  });

  const suppliersQ = useQuery({
    queryKey: ["door-suppliers"],
    queryFn: () => listDoorSuppliers(""),
    enabled: !!user?.is_vendedor,
  });

  const door = q.data;
  const [form, setForm] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    if (!door || !user) return;
    setForm(normalizeForm(door.record, user));
  }, [door, user]);

  const ipanelQuoteId = String(form?.ipanel_quote_id || "").trim();
  const ipanelQ = useQuery({
    queryKey: ["quote", "ipanel", ipanelQuoteId],
    queryFn: () => getQuote(ipanelQuoteId),
    enabled: !!ipanelQuoteId,
  });

  const summaryQ = useQuery({
    queryKey: ["door-quote-summary", id, ipanelQuoteId, form?.sale_amount, form?.purchase_amount, form?.ancho_marco_mm, form?.alto_marco_mm],
    queryFn: () => getDoorQuoteSummary(id, "presupuesto"),
    enabled: !!id,
  });

  const authUserId = String(user?.user_id ?? user?.id ?? "");
  const doorOwnerId = String(door?.created_by_user_id ?? "");
  const canSellerEdit = !!user?.is_vendedor && authUserId === doorOwnerId;
  const canCommercialAct = !!user?.is_enc_comercial && door?.status === "pending_approvals" && door?.commercial_decision === "pending";
  const canTechAct = !!user?.is_rev_tecnica && door?.status === "pending_approvals" && door?.technical_decision === "pending";

  const saveM = useMutation({
    mutationFn: () => updateDoor(id, { record: form }),
    onSuccess: (saved) => {
      setForm(normalizeForm(saved.record, user));
      toast.success("Marco de puerta guardado.");
      q.refetch();
      summaryQ.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar el marco de puerta"),
  });

  const submitM = useMutation({
    mutationFn: async () => {
      const saved = await updateDoor(id, { record: form });
      setForm(normalizeForm(saved.record, user));
      return await submitDoor(id);
    },
    onSuccess: () => {
      toast.success("Marco de puerta enviado a aprobación.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo enviar el marco de puerta"),
  });

  const commercialM = useMutation({
    mutationFn: ({ action }) => reviewDoorCommercial(id, { action, notes: reviewNotes }),
    onSuccess: () => {
      toast.success("Revisión comercial registrada.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo registrar la revisión comercial"),
  });

  const techM = useMutation({
    mutationFn: ({ action }) => reviewDoorTechnical(id, { action, notes: reviewNotes }),
    onSuccess: () => {
      toast.success("Revisión técnica registrada.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo registrar la revisión técnica"),
  });

  const summary = useMemo(() => {
    if (!form) return { total: 0, ok: 0, ready: false, standardText: "" };
    const ok = form.checklist.filter((row) => row.ok).length;
    return {
      total: form.checklist.length,
      ok,
      ready: buildReadyForManufacturing(form),
      standardText: buildStandardText(form),
    };
  }, [form]);

  async function handleDoorPdf(mode = "presupuesto") {
    try {
      if (canSellerEdit) {
        await updateDoor(id, { record: form });
      }
      const payload = await getDoorQuotePdfPayload(id, mode);
      if (mode === "proforma") await downloadProformaPdf(payload);
      else await downloadPresupuestoPdf(payload);
    } catch (e) {
      toast.error(e?.message || "No se pudo generar el PDF de puerta");
    }
  }

  if (!user) return null;

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Marco de puerta · {door?.door_code || "—"}</h2>
            <div className="muted">
              Registro de marco de puerta vinculado a Ipanel y/o portón.
              {door?.linked_quote_odoo_name ? ` · Portón: ${door.linked_quote_odoo_name}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {door?.linked_quote_id ? (
              <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>
                Ver presupuesto portón
              </Button>
            ) : null}
            {ipanelQuoteId ? (
              <Button variant="ghost" onClick={() => navigate(`/cotizador/ipanel/${ipanelQuoteId}`)}>
                Ver Ipanel vinculado
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => handleDoorPdf("presupuesto")}>PDF puerta</Button>
            {user?.is_distribuidor ? <Button variant="secondary" onClick={() => handleDoorPdf("proforma")}>PDF proforma puerta</Button> : null}
            <Button variant="ghost" onClick={() => navigate("/puertas")}>Volver</Button>
          </div>
        </div>

        {q.isLoading && <div className="spacer" />}
        {q.isLoading && <div className="muted">Cargando…</div>}
        {q.isError && <div className="spacer" />}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      </div>

      {door && form && (
        <>
          <div className="spacer" />

          <Section title="Estado">
            <div className="muted" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>Estado: <b>{door.status}</b></span>
              <span>Comercial: <b>{decisionLabel(door.commercial_decision)}</b></span>
              <span>Técnica: <b>{decisionLabel(door.technical_decision)}</b></span>
              {door.odoo_sale_order_name ? <span>Venta Odoo: <b>{door.odoo_sale_order_name}</b></span> : null}
              {door.odoo_purchase_order_name ? <span>Compra Odoo: <b>{door.odoo_purchase_order_name}</b></span> : null}
            </div>
          </Section>

          <Section title="Ipanel + Marco de puerta">
            <Row>
              <Field label="Ipanel vinculado">
                <Input value={form.ipanel_quote_label || ipanelQ.data?.odoo_sale_order_name || form.ipanel_quote_id || ""} onChange={(v) => setForm({ ...form, ipanel_quote_label: v })} style={{ width: "100%" }} disabled />
              </Field>
              <Field label="Ancho marco (mm)">
                <Input value={form.ancho_marco_mm || ""} onChange={(v) => setForm({ ...form, ancho_marco_mm: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Alto marco (mm)">
                <Input value={form.alto_marco_mm || ""} onChange={(v) => setForm({ ...form, alto_marco_mm: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
            <div className="spacer" />
            {summaryQ.data ? (
              <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 12, background: "#fff" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Cálculo presupuesto puerta</div>
                <div className="muted">Fórmula: <b>{summaryQ.data.formula}</b></div>
                <div className="spacer" />
                <div className="muted">precio_ipanel: <b>$ {Number(summaryQ.data.variables?.precio_ipanel || 0).toLocaleString("es-AR")}</b></div>
                <div className="muted">precio_compra_marco: <b>$ {Number(summaryQ.data.variables?.precio_compra_marco || 0).toLocaleString("es-AR")}</b></div>
                <div className="muted">precio_venta_marco: <b>$ {Number(summaryQ.data.variables?.precio_venta_marco || 0).toLocaleString("es-AR")}</b></div>
                <div className="spacer" />
                <div style={{ fontWeight: 900, fontSize: 18 }}>Total puerta: $ {Number(summaryQ.data.total || 0).toLocaleString("es-AR")}</div>
              </div>
            ) : <div className="muted">Calculando fórmula de puerta…</div>}
          </Section>

          <Section title="Proveedor / costos del marco">
            <Row>
              <Field label="Proveedor con tag Puerta">
                <Select
                  value={String(form.supplier_odoo_partner_id || "")}
                  onChange={(v) => {
                    const supplier = (suppliersQ.data || []).find((s) => String(s.id) === String(v));
                    setForm({
                      ...form,
                      supplier_odoo_partner_id: v,
                      proveedor: supplier?.name || "",
                    });
                  }}
                  options={(suppliersQ.data || []).map((s) => ({ value: String(s.id), label: s.name }))}
                  placeholder={suppliersQ.isLoading ? "Cargando proveedores..." : "Seleccionar proveedor"}
                  disabled={!canSellerEdit}
                />
              </Field>
              <Field label="Importe venta marco">
                <Input value={form.sale_amount || ""} onChange={(v) => setForm({ ...form, sale_amount: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Importe compra marco">
                <Input value={form.purchase_amount || ""} onChange={(v) => setForm({ ...form, purchase_amount: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
          </Section>

          <Section title="Observaciones">
            <textarea
              value={form.observaciones || ""}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
              disabled={!canSellerEdit}
            />
          </Section>

          {(canCommercialAct || canTechAct) && (
            <Section title="Acciones de revisión">
              <Field label="Observaciones del revisor">
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                />
              </Field>
              <div className="spacer" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canCommercialAct && (
                  <>
                    <Button disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "approve" })}>Aprobar Comercial</Button>
                    <Button variant="danger" disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject" })}>Rechazar Comercial</Button>
                  </>
                )}
                {canTechAct && (
                  <>
                    <Button disabled={techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>Aprobar Técnica</Button>
                    <Button variant="danger" disabled={techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>Rechazar Técnica</Button>
                  </>
                )}
              </div>
            </Section>
          )}

          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canSellerEdit && (
                <>
                  <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || submitM.isPending}>Guardar</Button>
                  <Button variant="primary" onClick={() => submitM.mutate()} disabled={submitM.isPending || saveM.isPending || door.status === "pending_approvals" || door.status === "synced_odoo"}>Enviar a aprobación</Button>
                </>
              )}
              <Button variant="secondary" onClick={() => handleDoorPdf("presupuesto")}>Imprimir presupuesto puerta</Button>
              {user?.is_distribuidor ? <Button variant="secondary" onClick={() => handleDoorPdf("proforma")}>Imprimir proforma puerta</Button> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
