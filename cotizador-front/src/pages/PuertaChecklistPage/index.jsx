import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import {
  getDoor,
  listDoorSuppliers,
  reviewDoorCommercial,
  reviewDoorTechnical,
  submitDoor,
  updateDoor,
} from "../../api/doors.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

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

  return `Puerta principal (vista exterior): ${mano}, abre hacia ${sentido}, apertura ${angulo}, interferencias: ${interferencias}, accesorios: ${accesorios}.`;
}
function buildReadyForManufacturing(form) {
  return form.checklist.every((row) => row.status === "OK" || row.status === "N/A");
}
function normalizeForm(raw, user) {
  const record = raw && typeof raw === "object" ? { ...raw } : {};
  record.end_customer = record.end_customer && typeof record.end_customer === "object"
    ? { ...record.end_customer }
    : { name: "", phone: "", email: "", address: "", maps_url: "" };
  record.obra_cliente = record.obra_cliente || record.end_customer.name || "";
  record.fecha = record.fecha || todayISO();
  record.responsable = record.responsable || user?.full_name || user?.username || "";
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

  const canSellerEdit = !!user?.is_vendedor && String(door?.created_by_user_id || "") === String(user?.user_id || "");
  const canCommercialAct = !!user?.is_enc_comercial && door?.status === "pending_approvals" && door?.commercial_decision === "pending";
  const canTechAct = !!user?.is_rev_tecnica && door?.status === "pending_approvals" && door?.technical_decision === "pending";

  const saveM = useMutation({
    mutationFn: () => updateDoor(id, { record: form }),
    onSuccess: (saved) => {
      setForm(normalizeForm(saved.record, user));
      toast.success("Puerta guardada.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la puerta"),
  });

  const submitM = useMutation({
    mutationFn: async () => {
      const saved = await updateDoor(id, { record: form });
      setForm(normalizeForm(saved.record, user));
      return await submitDoor(id);
    },
    onSuccess: () => {
      toast.success("Puerta enviada a aprobación.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo enviar la puerta"),
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

  if (!user) return null;

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Puerta · {door?.door_code || "—"}</h2>
            <div className="muted">
              Producto independiente o vinculado a portón.
              {door?.linked_quote_odoo_name ? ` · Portón: ${door.linked_quote_odoo_name}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {door?.linked_quote_id ? (
              <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>
                Ver presupuesto portón
              </Button>
            ) : null}
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

          <Section title="Cliente">
            <Row>
              <Field label="Nombre">
                <Input value={form.end_customer?.name || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), name: v }, obra_cliente: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.end_customer?.phone || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), phone: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Email">
                <Input value={form.end_customer?.email || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), email: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Dirección">
                <Input value={form.end_customer?.address || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), address: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Maps URL">
                <Input value={form.end_customer?.maps_url || ""} onChange={(v) => setForm({ ...form, end_customer: { ...(form.end_customer || {}), maps_url: v } })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
          </Section>

          <Section title="Datos del registro">
            <Row>
              <Field label="Obra / Cliente">
                <Input value={form.obra_cliente || ""} onChange={(v) => setForm({ ...form, obra_cliente: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="NV">
                <Input value={form.nv || ""} onChange={(v) => setForm({ ...form, nv: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Asociado a portón">
                <Input value={form.asociado_porton || ""} onChange={(v) => setForm({ ...form, asociado_porton: v })} style={{ width: "100%" }} disabled />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Tipo">
                <Input value={form.tipo || ""} onChange={(v) => setForm({ ...form, tipo: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Vista">
                <Input value={form.vista || ""} onChange={(v) => setForm({ ...form, vista: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
          </Section>

          <Section title="Proveedor / costos">
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
              <Field label="Nombre proveedor">
                <Input value={form.proveedor || ""} onChange={(v) => setForm({ ...form, proveedor: v })} style={{ width: "100%" }} disabled />
              </Field>
              <Field label="NV proveedor">
                <Input value={form.nv_proveedor || ""} onChange={(v) => setForm({ ...form, nv_proveedor: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Importe venta">
                <Input value={form.sale_amount || ""} onChange={(v) => setForm({ ...form, sale_amount: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Importe compra">
                <Input value={form.purchase_amount || ""} onChange={(v) => setForm({ ...form, purchase_amount: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Condiciones proveedor">
                <Input value={form.proveedor_condiciones || ""} onChange={(v) => setForm({ ...form, proveedor_condiciones: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
          </Section>

          <Section title="Definición técnica (desde exterior)">
            <Row>
              <Field label="Sentido de apertura">
                <Select value={form.sentido_apertura || ""} onChange={(v) => setForm({ ...form, sentido_apertura: v })} options={GIRO_OPTIONS} disabled={!canSellerEdit} />
              </Field>
              <Field label="Mano (bisagras)">
                <Select value={form.mano_bisagras || ""} onChange={(v) => setForm({ ...form, mano_bisagras: v })} options={MANO_OPTIONS} disabled={!canSellerEdit} />
              </Field>
              <Field label="Ángulo de apertura">
                <Select value={form.angulo_apertura || ""} onChange={(v) => setForm({ ...form, angulo_apertura: v })} options={ANGULO_OPTIONS} disabled={!canSellerEdit} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Ángulo (si elegiste Otro)">
                <Input value={form.angulo_otro || ""} onChange={(v) => setForm({ ...form, angulo_otro: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Interferencias">
                <Select value={form.interferencias || ""} onChange={(v) => setForm({ ...form, interferencias: v })} options={INTERFERENCIA_OPTIONS} disabled={!canSellerEdit} />
              </Field>
              <Field label="Accesorios">
                <Select value={form.accesorios || ""} onChange={(v) => setForm({ ...form, accesorios: v })} options={ACCESORIO_OPTIONS} disabled={!canSellerEdit} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Motivo / condición no estándar">
                <textarea
                  value={form.motivo_no_estandar || ""}
                  onChange={(e) => setForm({ ...form, motivo_no_estandar: e.target.value })}
                  style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                  disabled={!canSellerEdit}
                />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Tipo de marco">
                <Input value={form.tipo_marco || ""} onChange={(v) => setForm({ ...form, tipo_marco: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Tipo de hoja">
                <Input value={form.tipo_hoja || ""} onChange={(v) => setForm({ ...form, tipo_hoja: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
              <Field label="Lado de cerradura (desde exterior)">
                <Input value={form.lado_cerradura || ""} onChange={(v) => setForm({ ...form, lado_cerradura: v })} style={{ width: "100%" }} disabled={!canSellerEdit} />
              </Field>
            </Row>
          </Section>

          <Section title="Checklist de verificación">
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Sección</th>
                    <th>Ítem</th>
                    <th>Estado</th>
                    <th>Notas / Evidencia</th>
                    <th>Responsable</th>
                    <th>Fecha</th>
                    <th>OK</th>
                  </tr>
                </thead>
                <tbody>
                  {form.checklist.map((row, idx) => (
                    <tr key={`${row.section}-${idx}`}>
                      <td>{row.section}</td>
                      <td style={{ minWidth: 320 }}>{row.item}</td>
                      <td style={{ minWidth: 140 }}>
                        <Select
                          value={row.status}
                          onChange={(v) => {
                            const next = form.checklist.slice();
                            next[idx] = { ...row, status: v, ok: v === "OK" };
                            setForm({ ...form, checklist: next });
                          }}
                          options={STATUS_OPTIONS}
                          placeholder="Estado"
                          disabled={!canSellerEdit}
                        />
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <textarea
                          value={row.notes || ""}
                          onChange={(e) => {
                            const next = form.checklist.slice();
                            next[idx] = { ...row, notes: e.target.value };
                            setForm({ ...form, checklist: next });
                          }}
                          style={{ width: "100%", minHeight: 48, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                          disabled={!canSellerEdit}
                        />
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <Input
                          value={row.responsible || ""}
                          onChange={(v) => {
                            const next = form.checklist.slice();
                            next[idx] = { ...row, responsible: v };
                            setForm({ ...form, checklist: next });
                          }}
                          style={{ width: "100%" }}
                          disabled={!canSellerEdit}
                        />
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <Input
                          type="date"
                          value={row.date || ""}
                          onChange={(v) => {
                            const next = form.checklist.slice();
                            next[idx] = { ...row, date: v };
                            setForm({ ...form, checklist: next });
                          }}
                          style={{ width: "100%" }}
                          disabled={!canSellerEdit}
                        />
                      </td>
                      <td style={{ textAlign: "center", minWidth: 80 }}>
                        <input
                          type="checkbox"
                          checked={!!row.ok}
                          disabled={!canSellerEdit}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const next = form.checklist.slice();
                            next[idx] = { ...row, ok: checked, status: checked ? "OK" : (row.status === "OK" ? "Pendiente" : row.status) };
                            setForm({ ...form, checklist: next });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Resumen">
            <Row>
              <Field label="Código de puerta" minWidth={260}>
                <Input value={door.door_code || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
              <Field label="Total ítems" minWidth={180}>
                <Input value={String(summary.total)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
              <Field label="OK" minWidth={180}>
                <Input value={String(summary.ok)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
              <Field label="Listo para fabricación / compra" minWidth={240}>
                <Input value={summary.ready ? "SI" : "NO"} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
            </Row>
          </Section>

          <Section title="Registro final (copiar / pegar)">
            <Field label="Texto estándar" minWidth={500}>
              <textarea
                value={summary.standardText}
                onChange={() => {}}
                readOnly
                style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#fff" }}
              />
            </Field>
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
                    <Button disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "approve" })}>
                      {commercialM.isPending ? "Procesando..." : "Aprobar Comercial"}
                    </Button>
                    <Button variant="danger" disabled={commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject" })}>
                      Rechazar Comercial
                    </Button>
                  </>
                )}

                {canTechAct && (
                  <>
                    <Button disabled={techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>
                      {techM.isPending ? "Procesando..." : "Aprobar Técnica"}
                    </Button>
                    <Button variant="danger" disabled={techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>
                      Rechazar Técnica
                    </Button>
                  </>
                )}
              </div>
            </Section>
          )}

          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canSellerEdit && (
                <>
                  <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || submitM.isPending}>
                    {saveM.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button variant="primary" onClick={() => submitM.mutate()} disabled={submitM.isPending || saveM.isPending || door.status === "pending_approvals" || door.status === "synced_odoo"}>
                    {submitM.isPending ? "Enviando..." : "Enviar a aprobación"}
                  </Button>
                </>
              )}
              {door?.linked_quote_id ? (
                <Button variant="secondary" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>
                  Volver al portón
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
