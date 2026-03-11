import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createDoor,
  getDoor,
  listDoorSuppliers,
  reviewDoorCommercial,
  reviewDoorTechnical,
  submitDoor,
  updateDoor,
} from "../../api/doors.js";
import { listQuotes } from "../../api/quotes.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

const CHECKLIST_ITEMS = [
  { section: "A", item: "Confirmar que es puerta principal de acceso." },
  { section: "A", item: "Confirmar lado de vista: EXTERIOR (parado afuera mirando la puerta)." },
  { section: "B", item: "Definir sentido de giro: ABRE HACIA ADENTRO o ABRE HACIA AFUERA." },
  { section: "B", item: "Si no es estándar, registrar motivo (seguridad, evacuación, viento, interferencias, etc.)." },
  { section: "C", item: "Definir mano desde exterior: bisagras a IZQUIERDA = MI; bisagras a DERECHA = MD." },
  { section: "C", item: "Confirmar picaporte/cerradura del lado opuesto a bisagras." },
  { section: "D", item: "Confirmar ángulo requerido (90° default / 120° / 180° / otro)." },
  { section: "D", item: "Verificar interferencias (pared, mueble, escalón, baranda, artefactos, etc.)." },
  { section: "D", item: "Definir accesorios (tope, retenedor, cierrapuertas) según condiciones." },
  { section: "E", item: "Tipo de marco definido (madera/chapa/aluminio/u otro)." },
  { section: "E", item: "Tipo de hoja definido (ciega/vidriada/seguridad/u otro)." },
  { section: "E", item: "Lado de cerradura visto desde exterior definido (izquierda/derecha)." },
  { section: "E", item: "Compatibilidad de cerradura/manija con mano (MI/MD) y sentido (adentro/afuera)." },
  { section: "F", item: "Generar texto estándar final y revisar consistencia contra lo observado." },
  { section: "F", item: "Validar definición con obra/cliente antes de fabricación/compra." },
];

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

function formatARS(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "$ 0";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);
}

function Select({ value, onChange, options, placeholder = "—" }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
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

function buildDefaultChecklist(responsable = "") {
  return CHECKLIST_ITEMS.map((it) => ({
    ...it,
    status: "Pendiente",
    notes: "",
    responsible: responsable,
    date: todayISO(),
    ok: false,
  }));
}

function normalizeChecklist(list, fallbackResponsible) {
  const arr = Array.isArray(list) ? list : [];
  return CHECKLIST_ITEMS.map((base, idx) => {
    const cur = arr[idx] || {};
    return {
      section: base.section,
      item: base.item,
      status: cur.status || "Pendiente",
      notes: cur.notes || "",
      responsible: cur.responsible || fallbackResponsible || "",
      date: cur.date || todayISO(),
      ok: cur.ok === true || String(cur.status || "").toUpperCase() === "OK",
    };
  });
}

function buildStandardText(form) {
  const sentido = textOrDash(form.sentido_apertura);
  const mano = textOrDash(form.mano_bisagras);
  const angulo = form.angulo_apertura === "Otro" ? (String(form.angulo_otro || "").trim() || "Otro") : textOrDash(form.angulo_apertura);
  const interferencias = textOrDash(form.interferencias);
  const accesorios = textOrDash(form.accesorios);
  return `Puerta principal (vista exterior): ${mano}, abre hacia ${sentido}, apertura ${angulo}, interferencias: ${interferencias}, accesorios: ${accesorios}.`;
}

function buildReadyForManufacturing(form) {
  return form.checklist.every((row) => row.status === "OK" || row.status === "N/A");
}

function buildEmptyForm(user) {
  const responsible = user?.full_name || user?.username || "";
  return {
    obra_cliente: "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    proveedor: "",
    fecha: todayISO(),
    nv_proveedor: "",
    asociado_porton: "",
    linked_quote_id: "",
    sentido_apertura: "ADENTRO",
    mano_bisagras: "IZQUIERDA",
    angulo_apertura: "90",
    angulo_otro: "",
    motivo_no_estandar: "",
    interferencias: "Ninguna",
    accesorios: "Ninguno",
    tipo_marco: "",
    tipo_hoja: "",
    lado_cerradura: "",
    observaciones: "",
    sale_amount: "",
    purchase_amount: "",
    conditions_text: "",
    supplier_partner_id: "",
    supplier_name: "",
    end_customer: { name: "", phone: "", email: "", address: "", maps_url: "" },
    checklist: buildDefaultChecklist(responsible),
  };
}

function normalizeForm(raw, door, user) {
  const base = buildEmptyForm(user);
  const form = raw && typeof raw === "object" ? { ...base, ...raw } : base;
  form.end_customer = { ...base.end_customer, ...(raw?.end_customer || door?.end_customer || {}) };
  form.obra_cliente = form.obra_cliente || form.end_customer.name || "";
  form.proveedor = form.proveedor || door?.supplier_name || "";
  form.supplier_partner_id = form.supplier_partner_id || door?.supplier_partner_id || "";
  form.supplier_name = form.supplier_name || door?.supplier_name || "";
  form.sale_amount = form.sale_amount || (door?.sale_amount != null ? String(door.sale_amount) : "");
  form.purchase_amount = form.purchase_amount || (door?.purchase_amount != null ? String(door.purchase_amount) : "");
  form.conditions_text = form.conditions_text || door?.conditions_text || "";
  form.linked_quote_id = form.linked_quote_id || door?.linked_quote_id || "";
  form.asociado_porton = form.asociado_porton || door?.linked_quote_odoo_name || "";
  form.checklist = normalizeChecklist(form.checklist, form.responsable || user?.full_name || user?.username || "");
  return form;
}

function statusLabel(door) {
  if (door?.status === "pending_approvals") return "En aprobación";
  if (door?.status === "syncing_odoo") return "Sincronizando a Odoo";
  if (door?.status === "synced_odoo") return "En Odoo";
  return door?.status || "draft";
}

export default function PuertaChecklistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isNew = !id || id === "nueva";

  const [form, setForm] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [createdDoorId, setCreatedDoorId] = useState(null);
  const createOnceRef = useRef(false);

  const mineQuotesQ = useQuery({
    queryKey: ["quotes", "mine", "for-door-link"],
    queryFn: () => listQuotes({ scope: "mine" }),
    enabled: !!user?.is_vendedor,
  });

  const suppliersQ = useQuery({
    queryKey: ["door-suppliers"],
    queryFn: () => listDoorSuppliers(""),
    enabled: !!user?.is_vendedor,
  });

  const createM = useMutation({
    mutationFn: () => createDoor({}),
    onSuccess: (door) => {
      setCreatedDoorId(door.id);
      setForm(normalizeForm(door.record, door, user));
      navigate(`/puertas/${door.id}`, { replace: true });
    },
    onError: (e) => toast.error(e?.message || "No se pudo crear la puerta"),
  });

  const q = useQuery({
    queryKey: ["door", createdDoorId || id],
    queryFn: () => getDoor(createdDoorId || id),
    enabled: !!(createdDoorId || (id && id !== "nueva")),
  });

  const door = q.data;

  useEffect(() => {
    if (isNew && user?.is_vendedor && !createdDoorId && !createM.isPending && !createOnceRef.current) {
      createOnceRef.current = true;
      createM.mutate();
    }
  }, [isNew, user?.is_vendedor, createdDoorId, createM.isPending]);

  useEffect(() => {
    if (!door || !user) return;
    setForm(normalizeForm(door.record, door, user));
  }, [door, user]);

  const saveM = useMutation({
    mutationFn: () => updateDoor(door.id, { record: form }),
    onSuccess: (saved) => {
      setForm(normalizeForm(saved.record, saved, user));
      toast.success("Puerta guardada.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la puerta"),
  });

  const submitM = useMutation({
    mutationFn: () => submitDoor(door.id),
    onSuccess: (saved) => {
      setForm(normalizeForm(saved.record, saved, user));
      toast.success("Puerta enviada a aprobación.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo confirmar la puerta"),
  });

  const commercialM = useMutation({
    mutationFn: ({ action }) => reviewDoorCommercial(door.id, { action, notes: reviewNotes }),
    onSuccess: (saved) => {
      setReviewNotes("");
      setForm(normalizeForm(saved.record, saved, user));
      q.refetch();
    },
  });

  const techM = useMutation({
    mutationFn: ({ action }) => reviewDoorTechnical(door.id, { action, notes: reviewNotes }),
    onSuccess: (saved) => {
      setReviewNotes("");
      setForm(normalizeForm(saved.record, saved, user));
      q.refetch();
    },
  });

  const summary = useMemo(() => {
    if (!form) return { total: CHECKLIST_ITEMS.length, ok: 0, ready: false, standardText: "" };
    const ok = form.checklist.filter((row) => row.ok).length;
    return {
      total: form.checklist.length,
      ok,
      ready: buildReadyForManufacturing(form),
      standardText: buildStandardText(form),
    };
  }, [form]);

  const canEdit = !!user?.is_vendedor && !!door && String(door.created_by_user_id) === String(user.user_id) && ["draft", "pending_approvals"].includes(door.status);
  const canSubmit = !!user?.is_vendedor && !!door && String(door.created_by_user_id) === String(user.user_id) && door.status === "draft";
  const canCommercialAct = !!user?.is_enc_comercial && door?.status === "pending_approvals" && door?.commercial_decision === "pending";
  const canTechAct = !!user?.is_rev_tecnica && door?.status === "pending_approvals" && door?.technical_decision === "pending";

  const linkableQuotes = useMemo(() => (mineQuotesQ.data || []).filter((x) => (x.catalog_kind || "porton") === "porton"), [mineQuotesQ.data]);
  const supplierOptions = useMemo(() => (suppliersQ.data || []).map((x) => ({ value: String(x.id), label: x.name })), [suppliersQ.data]);

  if (!(user?.is_vendedor || user?.is_enc_comercial || user?.is_rev_tecnica)) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Puerta</h2>
          <div className="muted">No tenés permisos para ver puertas.</div>
          <div className="spacer" />
          <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Puerta · {door?.door_code || "Nueva"}</h2>
            <div className="muted">
              {door ? `Estado: ${statusLabel(door)}` : "Creando puerta..."}
              {door?.linked_quote_odoo_name ? ` · Vinculada al portón ${door.linked_quote_odoo_name}` : " · Puerta aislada o vinculable"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {door?.linked_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver portón</Button> : null}
            <Button variant="ghost" onClick={() => navigate("/menu")}>Volver</Button>
          </div>
        </div>
        {createM.isPending && <div className="spacer" />}
        {createM.isPending && <div className="muted">Inicializando puerta…</div>}
        {q.isLoading && !createM.isPending && <div className="spacer" />}
        {q.isLoading && !createM.isPending && <div className="muted">Cargando…</div>}
        {q.isError && <div className="spacer" />}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      </div>

      {door && form && (
        <>
          <div className="spacer" />

          <Section title="Cliente / Obra">
            <Row>
              <Field label="Cliente / Obra">
                <Input value={form.end_customer.name || ""} onChange={(v) => setForm({ ...form, obra_cliente: v, end_customer: { ...form.end_customer, name: v } })} style={{ width: "100%" }} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.end_customer.phone || ""} onChange={(v) => setForm({ ...form, end_customer: { ...form.end_customer, phone: v } })} style={{ width: "100%" }} />
              </Field>
              <Field label="Email">
                <Input value={form.end_customer.email || ""} onChange={(v) => setForm({ ...form, end_customer: { ...form.end_customer, email: v } })} style={{ width: "100%" }} />
              </Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Dirección" minWidth={420}>
                <Input value={form.end_customer.address || ""} onChange={(v) => setForm({ ...form, end_customer: { ...form.end_customer, address: v } })} style={{ width: "100%" }} />
              </Field>
              <Field label="Google Maps" minWidth={320}>
                <Input value={form.end_customer.maps_url || ""} onChange={(v) => setForm({ ...form, end_customer: { ...form.end_customer, maps_url: v } })} style={{ width: "100%" }} />
              </Field>
            </Row>
          </Section>

          <Section title="Vinculación / Proveedor / Importes">
            <Row>
              <Field label="Vincular a presupuesto de portón (opcional)">
                <Select
                  value={String(form.linked_quote_id || "")}
                  onChange={(v) => {
                    const selected = linkableQuotes.find((x) => String(x.id) === String(v));
                    setForm({
                      ...form,
                      linked_quote_id: v || "",
                      asociado_porton: selected?.odoo_sale_order_name || "",
                    });
                  }}
                  options={linkableQuotes.map((x) => ({ value: String(x.id), label: `${x.odoo_sale_order_name || String(x.id).slice(0, 8)} · ${x.end_customer?.name || "(sin nombre)"}` }))}
                  placeholder="Puerta aislada"
                />
              </Field>
              <Field label="Proveedor (tag Puerta)">
                <Select
                  value={String(form.supplier_partner_id || "")}
                  onChange={(v) => {
                    const selected = (suppliersQ.data || []).find((x) => String(x.id) === String(v));
                    setForm({ ...form, supplier_partner_id: v, supplier_name: selected?.name || "", proveedor: selected?.name || "" });
                  }}
                  options={supplierOptions}
                  placeholder="Seleccionar proveedor"
                />
              </Field>
              <Field label="Proveedor elegido">
                <Input value={form.supplier_name || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Monto de venta puerta">
                <Input type="number" value={form.sale_amount || ""} onChange={(v) => setForm({ ...form, sale_amount: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Costo compra proveedor">
                <Input type="number" value={form.purchase_amount || ""} onChange={(v) => setForm({ ...form, purchase_amount: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Código puerta">
                <Input value={door.door_code || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
              </Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Condiciones de la puerta" minWidth={500}>
                <textarea value={form.conditions_text || ""} onChange={(e) => setForm({ ...form, conditions_text: e.target.value })} style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} />
              </Field>
            </Row>
          </Section>

          <Section title="Datos del registro">
            <Row>
              <Field label="NV"><Input value={form.nv || ""} onChange={(v) => setForm({ ...form, nv: v })} style={{ width: "100%" }} /></Field>
              <Field label="Tipo"><Input value={form.tipo || ""} onChange={(v) => setForm({ ...form, tipo: v })} style={{ width: "100%" }} /></Field>
              <Field label="Vista"><Input value={form.vista || ""} onChange={(v) => setForm({ ...form, vista: v })} style={{ width: "100%" }} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Responsable"><Input value={form.responsable || ""} onChange={(v) => setForm({ ...form, responsable: v })} style={{ width: "100%" }} /></Field>
              <Field label="Fecha"><Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} /></Field>
              <Field label="NV proveedor"><Input value={form.nv_proveedor || ""} onChange={(v) => setForm({ ...form, nv_proveedor: v })} style={{ width: "100%" }} /></Field>
            </Row>
          </Section>

          <Section title="Definición técnica (desde exterior)">
            <Row>
              <Field label="Sentido de apertura"><Select value={form.sentido_apertura || ""} onChange={(v) => setForm({ ...form, sentido_apertura: v })} options={GIRO_OPTIONS} /></Field>
              <Field label="Mano (bisagras)"><Select value={form.mano_bisagras || ""} onChange={(v) => setForm({ ...form, mano_bisagras: v })} options={MANO_OPTIONS} /></Field>
              <Field label="Ángulo de apertura"><Select value={form.angulo_apertura || ""} onChange={(v) => setForm({ ...form, angulo_apertura: v })} options={ANGULO_OPTIONS} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Ángulo (si elegiste Otro)"><Input value={form.angulo_otro || ""} onChange={(v) => setForm({ ...form, angulo_otro: v })} style={{ width: "100%" }} /></Field>
              <Field label="Interferencias"><Select value={form.interferencias || ""} onChange={(v) => setForm({ ...form, interferencias: v })} options={INTERFERENCIA_OPTIONS} /></Field>
              <Field label="Accesorios"><Select value={form.accesorios || ""} onChange={(v) => setForm({ ...form, accesorios: v })} options={ACCESORIO_OPTIONS} /></Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Motivo / condición no estándar" minWidth={500}>
                <textarea value={form.motivo_no_estandar || ""} onChange={(e) => setForm({ ...form, motivo_no_estandar: e.target.value })} style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} />
              </Field>
            </Row>
            <div className="spacer" />
            <Row>
              <Field label="Tipo de marco"><Input value={form.tipo_marco || ""} onChange={(v) => setForm({ ...form, tipo_marco: v })} style={{ width: "100%" }} /></Field>
              <Field label="Tipo de hoja"><Input value={form.tipo_hoja || ""} onChange={(v) => setForm({ ...form, tipo_hoja: v })} style={{ width: "100%" }} /></Field>
              <Field label="Lado de cerradura (desde exterior)"><Input value={form.lado_cerradura || ""} onChange={(v) => setForm({ ...form, lado_cerradura: v })} style={{ width: "100%" }} /></Field>
            </Row>
          </Section>

          <Section title="Checklist de verificación">
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr><th>Sección</th><th>Ítem</th><th>Estado</th><th>Notas / Evidencia</th><th>Responsable</th><th>Fecha</th><th>OK</th></tr>
                </thead>
                <tbody>
                  {form.checklist.map((row, idx) => (
                    <tr key={`${row.section}-${idx}`}>
                      <td>{row.section}</td>
                      <td style={{ minWidth: 320 }}>{row.item}</td>
                      <td style={{ minWidth: 140 }}>
                        <Select value={row.status} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, status: v, ok: v === "OK" }; setForm({ ...form, checklist: next }); }} options={STATUS_OPTIONS} placeholder="Estado" />
                      </td>
                      <td style={{ minWidth: 260 }}>
                        <textarea value={row.notes || ""} onChange={(e) => { const next = form.checklist.slice(); next[idx] = { ...row, notes: e.target.value }; setForm({ ...form, checklist: next }); }} style={{ width: "100%", minHeight: 48, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} />
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <Input value={row.responsible || ""} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, responsible: v }; setForm({ ...form, checklist: next }); }} style={{ width: "100%" }} />
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <Input type="date" value={row.date || ""} onChange={(v) => { const next = form.checklist.slice(); next[idx] = { ...row, date: v }; setForm({ ...form, checklist: next }); }} style={{ width: "100%" }} />
                      </td>
                      <td style={{ textAlign: "center", minWidth: 80 }}>
                        <input type="checkbox" checked={!!row.ok} onChange={(e) => { const checked = e.target.checked; const next = form.checklist.slice(); next[idx] = { ...row, ok: checked, status: checked ? "OK" : (row.status === "OK" ? "Pendiente" : row.status) }; setForm({ ...form, checklist: next }); }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Resumen">
            <Row>
              <Field label="Código de puerta" minWidth={240}><Input value={door.door_code || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Monto venta" minWidth={200}><Input value={formatARS(form.sale_amount)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Costo compra" minWidth={200}><Input value={formatARS(form.purchase_amount)} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
              <Field label="Listo para fabricación / compra" minWidth={240}><Input value={summary.ready ? "SI" : "NO"} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} /></Field>
            </Row>
          </Section>

          <Section title="Registro final (copiar / pegar)">
            <Field label="Texto estándar" minWidth={500}>
              <textarea value={summary.standardText} onChange={() => {}} readOnly style={{ width: "100%", minHeight: 80, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#fff" }} />
            </Field>
          </Section>

          <Section title="Observaciones">
            <textarea value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} />
          </Section>

          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => saveM.mutate()} disabled={!canEdit || saveM.isPending}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
              {canSubmit && <Button variant="primary" onClick={() => submitM.mutate()} disabled={submitM.isPending}>{submitM.isPending ? "Confirmando..." : "Confirmar puerta"}</Button>}
              {door?.linked_quote_id ? <Button variant="secondary" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>Ver portón vinculado</Button> : null}
            </div>
            {(saveM.isError || submitM.isError) && <div className="spacer" />}
            {saveM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>}
            {submitM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{submitM.error.message}</div>}
          </div>

          {(canCommercialAct || canTechAct || door?.status === "synced_odoo") && (
            <>
              <div className="spacer" />
              <div className="card" style={{ background: "#fafafa" }}>
                <div style={{ fontWeight: 900 }}>Aprobaciones / Odoo</div>
                <div className="muted">Comercial: <b>{door?.commercial_decision || "pending"}</b> · Técnica: <b>{door?.technical_decision || "pending"}</b></div>
                {door?.status === "synced_odoo" && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Venta Odoo: <b>{door?.odoo_sale_order_name || "—"}</b> · Compra Odoo: <b>{door?.odoo_purchase_order_name || "—"}</b>
                  </div>
                )}
                {(canCommercialAct || canTechAct) && (
                  <>
                    <div className="spacer" />
                    <div className="muted">Observaciones del revisor</div>
                    <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} style={{ width: "100%", minHeight: 60, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }} />
                    <div className="spacer" />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {canCommercialAct && (
                        <>
                          <Button onClick={() => commercialM.mutate({ action: "approve" })} disabled={commercialM.isPending}>Aprobar Comercial</Button>
                          <Button variant="danger" onClick={() => commercialM.mutate({ action: "reject" })} disabled={commercialM.isPending}>Rechazar Comercial</Button>
                        </>
                      )}
                      {canTechAct && (
                        <>
                          <Button onClick={() => techM.mutate({ action: "approve" })} disabled={techM.isPending}>Aprobar Técnica (envía a Odoo)</Button>
                          <Button variant="danger" onClick={() => techM.mutate({ action: "reject" })} disabled={techM.isPending}>Rechazar Técnica</Button>
                        </>
                      )}
                    </div>
                    {(commercialM.isError || techM.isError) && <div className="spacer" />}
                    {commercialM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{commercialM.error.message}</div>}
                    {techM.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{techM.error.message}</div>}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
