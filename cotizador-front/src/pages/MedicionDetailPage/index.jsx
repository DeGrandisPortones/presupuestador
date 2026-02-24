import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getMeasurement, saveMeasurement } from "../../api/measurements.js";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeEmptyForm(quote) {
  const createdBy = quote?.created_by_full_name || quote?.created_by_username || "";
  return {
    fecha: todayISO(),
    distribuidor: createdBy,
    nro_porton: "",
    ancho_mm: "",
    alto_mm: "",
    parantes: { cant: "", izq: "", der: "" },
    colocacion: "", // dentro_vano | detras_vano | otro
    en_acopio: false,
    lado_motor: "",
    toma_corriente: "",
    anclaje: "", // sin | lateral | frontal | otro
    anclaje_otro: "",
    rebaje_lateral_mm: "",
    rebaje_inferior_mm: "",
    color_sistema: "",
    accionamiento: "", // manual | automatico
    levadizo: "", // coplanar | comun
    estructura_metalica: false,
    tipo_revestimiento: "",
    orientacion_revestimiento: "",
    material_revestimiento: "",
    color_revestimiento: "",
    tubos: [],
    lucera: false,
    lucera_cantidad: "",
    peso_revestimiento: "",
    traslado: false,
    direccion_entrega: "",
    relevamiento: true,
    contacto_obra: "",
    instalacion: false,
    diente_inferior: false,
    mm_superponer: "",
    observaciones: "",
  };
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

function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", userSelect: "none" }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["measurement", quoteId],
    queryFn: () => getMeasurement(quoteId),
    enabled: !!quoteId,
  });

  const quote = q.data;

  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!quote) return;
    const f = quote.measurement_form || makeEmptyForm(quote);
    setForm(f);
  }, [quote]);

  const mSave = useMutation({
    mutationFn: ({ submit }) => saveMeasurement(quoteId, { form, submit }),
    onSuccess: () => q.refetch(),
  });

  const canEdit = !!user?.is_medidor;

  const endCustomer = quote?.end_customer || {};

  const tubosOptions = ["20x10x20", "30x15x30", "40x20x40", "50x25x50"];

  const toggTubos = (t) => {
    const arr = Array.isArray(form?.tubos) ? form.tubos.slice() : [];
    const idx = arr.indexOf(t);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(t);
    setForm({ ...form, tubos: arr });
  };

  if (!user?.is_medidor) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Medición</h2>
          <div className="muted">No tenés permisos (solo Medidor).</div>
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
            <h2 style={{ margin: 0 }}>Medición · Presupuesto #{quoteId}</h2>
            <div className="muted">Completar y luego “Aceptar” para enviar al vendedor.</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Button variant="ghost" onClick={() => navigate("/mediciones")}>Volver</Button>
          </div>
        </div>

        {q.isLoading && <div className="spacer" />}
        {q.isLoading && <div className="muted">Cargando…</div>}
        {q.isError && <div className="spacer" />}
        {q.isError && <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div>}
      </div>

      {quote && (
        <>
          <div className="spacer" />

          <Section title="Membrete">
            <Row>
              <Field label="Cliente">
                <div style={{ fontWeight: 800 }}>{endCustomer.name || "(sin nombre)"}</div>
              </Field>
              <Field label="Teléfono">
                <div>{endCustomer.phone || "—"}</div>
              </Field>
              <Field label="Dirección">
                <div>{endCustomer.address || "—"}</div>
              </Field>
              <Field label="Maps">
                {endCustomer.maps_url ? (
                  <a href={endCustomer.maps_url} target="_blank" rel="noreferrer">Abrir</a>
                ) : (
                  <span className="muted">—</span>
                )}
              </Field>
            </Row>

            {quote.measurement_status === "needs_fix" && quote.measurement_review_notes && (
              <>
                <div className="spacer" />
                <div style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Revisión: corregir</div>
                  <div>{quote.measurement_review_notes}</div>
                </div>
              </>
            )}
          </Section>

          {!form && (
            <div className="card">
              <div className="muted">Inicializando formulario…</div>
            </div>
          )}

          {form && (
            <>
              <Section title="Datos generales">
                <Row>
                  <Field label="Fecha (YYYY-MM-DD)">
                    <Input value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Distribuidor / Vendedor">
                    <Input value={form.distribuidor || ""} onChange={(v) => setForm({ ...form, distribuidor: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="N° portón / Nota de venta">
                    <Input value={form.nro_porton || ""} onChange={(v) => setForm({ ...form, nro_porton: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
              </Section>

              <Section title="Medidas">
                <Row>
                  <Field label="Ancho (mm)">
                    <Input value={form.ancho_mm || ""} onChange={(v) => setForm({ ...form, ancho_mm: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Alto (mm)">
                    <Input value={form.alto_mm || ""} onChange={(v) => setForm({ ...form, alto_mm: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
                <div className="spacer" />
                <Row>
                  <Field label="Parantes - Cant">
                    <Input value={form.parantes?.cant || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes||{}), cant: v } })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Parantes - Izq">
                    <Input value={form.parantes?.izq || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes||{}), izq: v } })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Parantes - Der">
                    <Input value={form.parantes?.der || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes||{}), der: v } })} style={{ width: "100%" }} />
                  </Field>
                </Row>
                <div className="spacer" />
                <Row>
                  <Field label="Tipo colocación">
                    <select
                      value={form.colocacion || ""}
                      onChange={(e) => setForm({ ...form, colocacion: e.target.value })}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                    >
                      <option value="">—</option>
                      <option value="dentro_vano">Dentro del vano</option>
                      <option value="detras_vano">Detrás del vano</option>
                      <option value="otro">Otro</option>
                    </select>
                  </Field>
                  <Field label="Portón en acopio">
                    <Checkbox label="Sí" checked={form.en_acopio} onChange={(v) => setForm({ ...form, en_acopio: v })} />
                  </Field>
                </Row>
              </Section>

              <Section title="Motor / Anclajes / Rebajes">
                <Row>
                  <Field label="Lado motor / soporte">
                    <Input value={form.lado_motor || ""} onChange={(v) => setForm({ ...form, lado_motor: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Toma corriente">
                    <Input value={form.toma_corriente || ""} onChange={(v) => setForm({ ...form, toma_corriente: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
                <div className="spacer" />
                <Row>
                  <Field label="Anclaje">
                    <select
                      value={form.anclaje || ""}
                      onChange={(e) => setForm({ ...form, anclaje: e.target.value })}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                    >
                      <option value="">—</option>
                      <option value="sin">Sin anclaje</option>
                      <option value="lateral">Lateral</option>
                      <option value="frontal">Frontal</option>
                      <option value="otro">Otro</option>
                    </select>
                  </Field>
                  <Field label="Otro (si aplica)">
                    <Input value={form.anclaje_otro || ""} onChange={(v) => setForm({ ...form, anclaje_otro: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
                <div className="spacer" />
                <Row>
                  <Field label="Rebaje lateral (mm)">
                    <Input value={form.rebaje_lateral_mm || ""} onChange={(v) => setForm({ ...form, rebaje_lateral_mm: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Rebaje inferior (mm)">
                    <Input value={form.rebaje_inferior_mm || ""} onChange={(v) => setForm({ ...form, rebaje_inferior_mm: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
              </Section>

              <Section title="Sistema / Revestimiento">
                <Row>
                  <Field label="Color sistema">
                    <Input value={form.color_sistema || ""} onChange={(v) => setForm({ ...form, color_sistema: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Accionamiento">
                    <select
                      value={form.accionamiento || ""}
                      onChange={(e) => setForm({ ...form, accionamiento: e.target.value })}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                    >
                      <option value="">—</option>
                      <option value="manual">Manual</option>
                      <option value="automatico">Automático</option>
                    </select>
                  </Field>
                  <Field label="Levadizo">
                    <select
                      value={form.levadizo || ""}
                      onChange={(e) => setForm({ ...form, levadizo: e.target.value })}
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}
                    >
                      <option value="">—</option>
                      <option value="coplanar">Coplanar</option>
                      <option value="comun">Común</option>
                    </select>
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Estructura metálica">
                    <Checkbox label="Sí" checked={form.estructura_metalica} onChange={(v) => setForm({ ...form, estructura_metalica: v })} />
                  </Field>
                  <Field label="Tipo revestimiento">
                    <Input value={form.tipo_revestimiento || ""} onChange={(v) => setForm({ ...form, tipo_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Orientación">
                    <Input value={form.orientacion_revestimiento || ""} onChange={(v) => setForm({ ...form, orientacion_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Material revestimiento">
                    <Input value={form.material_revestimiento || ""} onChange={(v) => setForm({ ...form, material_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Color revestimiento">
                    <Input value={form.color_revestimiento || ""} onChange={(v) => setForm({ ...form, color_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Peso revestimiento">
                    <Input value={form.peso_revestimiento || ""} onChange={(v) => setForm({ ...form, peso_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>

                <div className="spacer" />

                <div className="muted" style={{ marginBottom: 6 }}>Tubos</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {tubosOptions.map((t) => (
                    <Checkbox
                      key={t}
                      label={t}
                      checked={(form.tubos || []).includes(t)}
                      onChange={() => toggTubos(t)}
                    />
                  ))}
                </div>

                <div className="spacer" />

                <Row>
                  <Field label="Lucera con vidrios">
                    <Checkbox label="Sí" checked={form.lucera} onChange={(v) => setForm({ ...form, lucera: v })} />
                  </Field>
                  <Field label="Cantidad lucera">
                    <Input value={form.lucera_cantidad || ""} onChange={(v) => setForm({ ...form, lucera_cantidad: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
              </Section>

              <Section title="Servicios">
                <Row>
                  <Field label="Traslado">
                    <Checkbox label="Sí" checked={form.traslado} onChange={(v) => setForm({ ...form, traslado: v })} />
                  </Field>
                  <Field label="Dirección entrega">
                    <Input value={form.direccion_entrega || ""} onChange={(v) => setForm({ ...form, direccion_entrega: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Relevamiento medidas">
                    <Checkbox label="Sí" checked={form.relevamiento} onChange={(v) => setForm({ ...form, relevamiento: v })} />
                  </Field>
                  <Field label="Contacto en obra">
                    <Input value={form.contacto_obra || ""} onChange={(v) => setForm({ ...form, contacto_obra: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Instalación">
                    <Checkbox label="Sí" checked={form.instalacion} onChange={(v) => setForm({ ...form, instalacion: v })} />
                  </Field>
                  <Field label="Diente inferior / trampa tierra">
                    <Checkbox label="Sí" checked={form.diente_inferior} onChange={(v) => setForm({ ...form, diente_inferior: v })} />
                  </Field>
                  <Field label="Mm a superponer">
                    <Input value={form.mm_superponer || ""} onChange={(v) => setForm({ ...form, mm_superponer: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
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
                  <Button
                    variant="secondary"
                    onClick={() => mSave.mutate({ submit: false })}
                    disabled={!canEdit || mSave.isPending}
                  >
                    {mSave.isPending ? "Guardando…" : "Guardar"}
                  </Button>

                  <Button
                    onClick={() => mSave.mutate({ submit: true })}
                    disabled={!canEdit || mSave.isPending}
                  >
                    {mSave.isPending ? "Enviando…" : "Aceptar (Enviar)"}
                  </Button>
                </div>

                {mSave.isError && (
                  <>
                    <div className="spacer" />
                    <div style={{ color: "#d93025", fontSize: 13 }}>{mSave.error.message}</div>
                  </>
                )}

                {mSave.isSuccess && (
                  <>
                    <div className="spacer" />
                    <div className="muted">Guardado.</div>
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
