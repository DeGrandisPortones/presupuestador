import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { getDoor, updateDoor } from "../../api/doors.js";
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

function buildEmptyForm(door, user) {
  const responsible = user?.full_name || user?.username || "";
  const linkedQuoteCode = String(door?.linked_quote_odoo_name || "").trim();
  return {
    obra_cliente: door?.linked_quote_end_customer?.name || "",
    nv: "",
    tipo: "Puerta principal",
    vista: "Exterior",
    responsable: responsible,
    proveedor: "GRIVEL",
    fecha: todayISO(),
    nv_proveedor: "",
    asociado_porton: linkedQuoteCode || "",
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
    checklist: buildDefaultChecklist(responsible),
  };
}

function normalizeForm(raw, door, user) {
  const responsible = user?.full_name || user?.username || "";
  const base = buildEmptyForm(door, user);
  const form = raw && typeof raw === "object" ? { ...base, ...raw } : base;
  form.tipo = form.tipo || "Puerta principal";
  form.vista = form.vista || "Exterior";
  form.proveedor = form.proveedor || "GRIVEL";
  form.fecha = form.fecha || todayISO();
  form.asociado_porton = form.asociado_porton || door?.linked_quote_odoo_name || "";
  form.checklist = normalizeChecklist(form.checklist, form.responsable || responsible);
  return form;
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

  const door = q.data;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!door || !user) return;
    setForm(normalizeForm(door.record, door, user));
  }, [door, user]);

  const saveM = useMutation({
    mutationFn: () => updateDoor(id, { record: form }),
    onSuccess: (saved) => {
      setForm(normalizeForm(saved.record, saved, user));
      toast.success("Checklist de puerta guardado.");
      q.refetch();
    },
    onError: (e) => toast.error(e?.message || "No se pudo guardar la puerta"),
  });

  const summary = useMemo(() => {
    if (!form) return { total: CHECKLIST_ITEMS.length, ok: 0, ready: false, standardText: "" };
    const ok = form.checklist.filter((row) => row.ok).length;
    const ready = buildReadyForManufacturing(form);
    return {
      total: form.checklist.length,
      ok,
      ready,
      standardText: buildStandardText(form),
    };
  }, [form]);

  const canEdit = !!user?.is_vendedor;

  if (!user?.is_vendedor) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Puerta</h2>
          <div className="muted">No tenés permisos (solo Vendedor).</div>
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
            <h2 style={{ margin: 0 }}>Puerta · {door?.door_code || "—"}</h2>
            <div className="muted">
              Checklist basado en la hoja “Checklist” del archivo de puerta.
              {door?.linked_quote_odoo_name ? ` · Vinculado al portón ${door.linked_quote_odoo_name}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            {door?.linked_quote_id ? (
              <Button variant="ghost" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>
                Ver presupuesto portón
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => navigate("/presupuestos")}>Volver</Button>
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

          <Section title="Datos del registro">
            <Row>
              <Field label="Obra / Cliente">
                <Input value={form.obra_cliente || ""} onChange={(v) => setForm({ ...form, obra_cliente: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Tipo">
                <Input value={form.tipo || ""} onChange={(v) => setForm({ ...form, tipo: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Vista">
                <Input value={form.vista || ""} onChange={(v) => setForm({ ...form, vista: v })} style={{ width: "100%" }} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="NV">
                <Input value={form.nv || ""} onChange={(v) => setForm({ ...form, nv: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Responsable">
                <Input value={form.responsable || ""} onChange={(v) => setForm({ ...form, responsable: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Proveedor">
                <Input value={form.proveedor || ""} onChange={(v) => setForm({ ...form, proveedor: v })} style={{ width: "100%" }} />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Fecha">
                <Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="NV proveedor">
                <Input value={form.nv_proveedor || ""} onChange={(v) => setForm({ ...form, nv_proveedor: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Asociado a un portón">
                <Input value={form.asociado_porton || ""} onChange={(v) => setForm({ ...form, asociado_porton: v })} style={{ width: "100%" }} />
              </Field>
            </Row>
          </Section>

          <Section title="Definición técnica (desde exterior)">
            <Row>
              <Field label="Sentido de apertura">
                <Select
                  value={form.sentido_apertura || ""}
                  onChange={(v) => setForm({ ...form, sentido_apertura: v })}
                  options={GIRO_OPTIONS}
                />
              </Field>
              <Field label="Mano (bisagras)">
                <Select
                  value={form.mano_bisagras || ""}
                  onChange={(v) => setForm({ ...form, mano_bisagras: v })}
                  options={MANO_OPTIONS}
                />
              </Field>
              <Field label="Ángulo de apertura">
                <Select
                  value={form.angulo_apertura || ""}
                  onChange={(v) => setForm({ ...form, angulo_apertura: v })}
                  options={ANGULO_OPTIONS}
                />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Ángulo (si elegiste Otro)">
                <Input value={form.angulo_otro || ""} onChange={(v) => setForm({ ...form, angulo_otro: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Interferencias">
                <Select
                  value={form.interferencias || ""}
                  onChange={(v) => setForm({ ...form, interferencias: v })}
                  options={INTERFERENCIA_OPTIONS}
                />
              </Field>
              <Field label="Accesorios">
                <Select
                  value={form.accesorios || ""}
                  onChange={(v) => setForm({ ...form, accesorios: v })}
                  options={ACCESORIO_OPTIONS}
                />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Motivo / condición no estándar">
                <textarea
                  value={form.motivo_no_estandar || ""}
                  onChange={(e) => setForm({ ...form, motivo_no_estandar: e.target.value })}
                  style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                />
              </Field>
            </Row>

            <div className="spacer" />

            <Row>
              <Field label="Tipo de marco">
                <Input value={form.tipo_marco || ""} onChange={(v) => setForm({ ...form, tipo_marco: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Tipo de hoja">
                <Input value={form.tipo_hoja || ""} onChange={(v) => setForm({ ...form, tipo_hoja: v })} style={{ width: "100%" }} />
              </Field>
              <Field label="Lado de cerradura (desde exterior)">
                <Input value={form.lado_cerradura || ""} onChange={(v) => setForm({ ...form, lado_cerradura: v })} style={{ width: "100%" }} />
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
                        />
                      </td>
                      <td style={{ textAlign: "center", minWidth: 80 }}>
                        <input
                          type="checkbox"
                          checked={!!row.ok}
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
            />
          </Section>

          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button onClick={() => saveM.mutate()} disabled={!canEdit || saveM.isPending}>
                {saveM.isPending ? "Guardando..." : "Guardar"}
              </Button>
              {door?.linked_quote_id ? (
                <Button variant="secondary" onClick={() => navigate(`/presupuestos/${door.linked_quote_id}`)}>
                  Volver al portón
                </Button>
              ) : null}
            </div>

            {saveM.isError && (
              <>
                <div className="spacer" />
                <div style={{ color: "#d93025", fontSize: 13 }}>{saveM.error.message}</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
