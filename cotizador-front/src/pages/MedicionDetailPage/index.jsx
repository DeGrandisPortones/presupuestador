import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { getMedicionPublicPdfUrl } from "../../api/pdf.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import { getMeasurement, saveMeasurement } from "../../api/measurements.js";
import {
  buildMeasurementWhatsappMessage,
  buildWhatsappUrl,
} from "../../utils/whatsapp.js";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  if ((f.ancho_mm || f.alto_mm) && !raw?.esquema) {
    if (f.alto_mm && !f.esquema.alto[1]) f.esquema.alto[1] = String(f.alto_mm);
    if (f.ancho_mm && !f.esquema.ancho[1]) f.esquema.ancho[1] = String(f.ancho_mm);
  }

  if (f.estructura_metalica !== undefined && typeof f.estructura_metalica !== "boolean") f.estructura_metalica = isYes(f.estructura_metalica);
  if (f.lucera !== undefined && typeof f.lucera !== "boolean") f.lucera = isYes(f.lucera);
  if (f.traslado !== undefined && typeof f.traslado !== "boolean") f.traslado = isYes(f.traslado);
  if (f.relevamiento !== undefined && typeof f.relevamiento !== "boolean") f.relevamiento = isYes(f.relevamiento);

  if (f.color_revestimiento !== "Otros") {
    f.color_revestimiento_otro = f.color_revestimiento_otro || "";
  }

  return f;
}

function makeEmptyForm(quote) {
  return {
    fecha: todayISO(),
    distribuidor: deriveDistribuidor(quote),
    nro_porton: "",
    parantes: { cant: "" },
    lado_puerta: "",
    lado_motor: "",
    toma_corriente: "",
    esquema: { alto: ["", "", ""], ancho: ["", "", ""] },
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

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const whatsappWindowRef = useRef(null);

  const q = useQuery({
    queryKey: ["measurement", quoteId],
    queryFn: () => getMeasurement(quoteId),
    enabled: !!quoteId,
  });

  const quote = q.data;
  const endCustomer = quote?.end_customer || {};

  const [form, setForm] = useState(null);
  const [shareInfo, setShareInfo] = useState(null);

  useEffect(() => {
    if (!quote) return;
    const f = quote.measurement_form ? normalizeMeasurementForm(quote.measurement_form, quote) : makeEmptyForm(quote);
    setForm(f);
  }, [quote]);

  function closePendingWhatsappWindow() {
    try {
      if (whatsappWindowRef.current && !whatsappWindowRef.current.closed) {
        whatsappWindowRef.current.close();
      }
    } catch {
      // noop
    }
    whatsappWindowRef.current = null;
  }

  function openPendingWhatsappWindow() {
    try {
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`
          <title>Preparando WhatsApp</title>
          <div style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
            <h3 style="margin: 0 0 8px;">Preparando WhatsApp...</h3>
            <p style="margin: 0;">Guardando la medición y generando el mensaje para el cliente.</p>
          </div>
        `);
        win.document.close();
      }
      whatsappWindowRef.current = win;
      return win;
    } catch {
      whatsappWindowRef.current = null;
      return null;
    }
  }

  const mSave = useMutation({
    mutationFn: ({ submit }) => saveMeasurement(quoteId, { form, submit }),
    onMutate: () => setShareInfo(null),
    onSuccess: async (savedQuote, variables) => {
      await q.refetch();

      if (!variables?.submit) {
        setShareInfo({ tone: "success", message: "Medición guardada." });
        return;
      }

      const token = savedQuote?.measurement_share_token;
      const publicPdfUrl = getMedicionPublicPdfUrl(token);
      const whatsappText = buildMeasurementWhatsappMessage(publicPdfUrl);
      const customerPhone = savedQuote?.end_customer?.phone || endCustomer.phone;
      const whatsappUrl = buildWhatsappUrl(customerPhone, whatsappText);

      if (whatsappUrl) {
        const popup = whatsappWindowRef.current;
        try {
          if (popup && !popup.closed) {
            popup.location.replace(whatsappUrl);
          } else {
            window.open(whatsappUrl, "_blank", "noopener,noreferrer");
          }
        } catch {
          window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        }

        setShareInfo({
          tone: "success",
          message: "Medición enviada. Se abrió WhatsApp con el mensaje listo para el cliente.",
          whatsappUrl,
          publicPdfUrl,
        });
        whatsappWindowRef.current = null;
        return;
      }

      closePendingWhatsappWindow();
      setShareInfo({
        tone: "warning",
        message: "Medición enviada, pero falta el teléfono del cliente para abrir WhatsApp.",
        publicPdfUrl,
      });
    },
    onError: () => {
      closePendingWhatsappWindow();
    },
    onSettled: () => {
      if (whatsappWindowRef.current?.closed) {
        whatsappWindowRef.current = null;
      }
    },
  });

  const canEdit = !!user?.is_medidor;

  const leftRightOptions = useMemo(
    () => ([
      { value: "izquierda", label: "Izquierda" },
      { value: "derecha", label: "Derecha" },
    ]),
    []
  );

  const yesNoOptions = useMemo(
    () => ([
      { value: "no", label: "No" },
      { value: "si", label: "Sí" },
    ]),
    []
  );

  const setYesNoBool = (key, v) => setForm({ ...form, [key]: v === "si" });

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
            <div className="muted">Completar y luego “Aceptar” para enviar la medición y abrir el WhatsApp del cliente.</div>
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
                  <Field label="Fecha">
                    <Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Distribuidor">
                    <Input value={form.distribuidor || ""} onChange={(v) => setForm({ ...form, distribuidor: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Cliente">
                    <Input value={endCustomer.name || ""} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
                  </Field>
                  <Field label="N° de portón (Nota de venta)">
                    <Input value={form.nro_porton || ""} onChange={(v) => setForm({ ...form, nro_porton: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
              </Section>

              <Section title="Parantes / Laterales">
                <Row>
                  <Field label="Parantes (Cant)">
                    <Input type="number" value={form.parantes?.cant || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes || {}), cant: v } })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Lado de la puerta">
                    <Select value={form.lado_puerta || ""} onChange={(v) => setForm({ ...form, lado_puerta: v })} options={leftRightOptions} />
                  </Field>
                  <Field label="Lado de motor o soporte">
                    <Select value={form.lado_motor || ""} onChange={(v) => setForm({ ...form, lado_motor: v })} options={leftRightOptions} />
                  </Field>
                  <Field label="Toma Corriente">
                    <Select value={form.toma_corriente || ""} onChange={(v) => setForm({ ...form, toma_corriente: v })} options={leftRightOptions} />
                  </Field>
                </Row>
              </Section>

              <Section title="Esquema (medidas)">
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: 2, minWidth: 320 }}>
                    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" }}>
                      <div style={{ position: "relative", width: "100%" }}>
                        <img src="/measurement_scheme.png" alt="Esquema" style={{ width: "100%", height: "auto", display: "block" }} />

                        {SCHEME_RECT_PCTS.alto.map((p, i) => {
                          const v = form.esquema?.alto?.[i];
                          if (v === "" || v === null || v === undefined) return null;
                          return (
                            <div
                              key={`alto-ov-${i}`}
                              style={{
                                ...schemeOverlayBaseStyle,
                                left: `${p.left}%`,
                                top: `${p.top}%`,
                                width: `${p.width}%`,
                                height: `${p.height}%`,
                                fontSize: 14,
                              }}
                            >
                              {v}
                            </div>
                          );
                        })}
                        {SCHEME_RECT_PCTS.ancho.map((p, i) => {
                          const v = form.esquema?.ancho?.[i];
                          if (v === "" || v === null || v === undefined) return null;
                          return (
                            <div
                              key={`ancho-ov-${i}`}
                              style={{
                                ...schemeOverlayBaseStyle,
                                left: `${p.left}%`,
                                top: `${p.top}%`,
                                width: `${p.width}%`,
                                height: `${p.height}%`,
                                fontSize: 14,
                              }}
                            >
                              {v}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Ingresá un número en cada rectángulo (mm).
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Alto</div>
                    <Row>
                      {[0, 1, 2].map((i) => (
                        <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}>
                          <Input
                            type="number"
                            value={form.esquema?.alto?.[i] ?? ""}
                            onChange={(v) => {
                              const next = { ...(form.esquema || {}) };
                              const arr = Array.isArray(next.alto) ? next.alto.slice(0, 3) : ["", "", ""];
                              while (arr.length < 3) arr.push("");
                              arr[i] = v;
                              next.alto = arr;
                              setForm({ ...form, esquema: next });
                            }}
                            style={{ width: "100%" }}
                          />
                        </Field>
                      ))}
                    </Row>

                    <div className="spacer" />

                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Ancho</div>
                    <Row>
                      {[0, 1, 2].map((i) => (
                        <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}>
                          <Input
                            type="number"
                            value={form.esquema?.ancho?.[i] ?? ""}
                            onChange={(v) => {
                              const next = { ...(form.esquema || {}) };
                              const arr = Array.isArray(next.ancho) ? next.ancho.slice(0, 3) : ["", "", ""];
                              while (arr.length < 3) arr.push("");
                              arr[i] = v;
                              next.ancho = arr;
                              setForm({ ...form, esquema: next });
                            }}
                            style={{ width: "100%" }}
                          />
                        </Field>
                      ))}
                    </Row>
                  </div>
                </div>
              </Section>

              <Section title="Instalación / Sistema">
                <Row>
                  <Field label="Tipo de colocación">
                    <Select
                      value={form.colocacion || ""}
                      onChange={(v) => setForm({ ...form, colocacion: v })}
                      options={[
                        { value: "dentro_vano", label: "Por dentro del vano" },
                        { value: "detras_vano", label: "Por detrás del vano" },
                      ]}
                    />
                  </Field>
                  <Field label="Portón en acopio">
                    <Input value={form.en_acopio ? "Sí" : "No"} onChange={() => {}} disabled style={{ width: "100%", opacity: 0.9 }} />
                  </Field>
                  <Field label="Tipo de accionamiento">
                    <Select
                      value={form.accionamiento || ""}
                      onChange={(v) => setForm({ ...form, accionamiento: v })}
                      options={[
                        { value: "manual", label: "Manual" },
                        { value: "automatico", label: "Automático" },
                      ]}
                    />
                  </Field>
                  <Field label="Sistema levadizo">
                    <Select
                      value={form.levadizo || ""}
                      onChange={(v) => setForm({ ...form, levadizo: v })}
                      options={[
                        { value: "coplanar", label: "Coplanar" },
                        { value: "comun", label: "Común" },
                      ]}
                    />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Estructura metálica para puerta">
                    <Select value={form.estructura_metalica ? "si" : "no"} onChange={(v) => setYesNoBool("estructura_metalica", v)} options={yesNoOptions} />
                  </Field>
                  <Field label="Rebaje lateral (mm)">
                    <Input type="number" value={form.rebaje_lateral_mm || ""} onChange={(v) => setForm({ ...form, rebaje_lateral_mm: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Rebaje inferior (mm)">
                    <Input type="number" value={form.rebaje_inferior_mm || ""} onChange={(v) => setForm({ ...form, rebaje_inferior_mm: v })} style={{ width: "100%" }} />
                  </Field>
                  <Field label="Anclaje de fijación">
                    <Select
                      value={form.anclaje || ""}
                      onChange={(v) => setForm({ ...form, anclaje: v })}
                      options={[
                        { value: "lateral", label: "Lateral" },
                        { value: "frontal", label: "Frontal" },
                        { value: "sin", label: "Sin Anclajes" },
                      ]}
                    />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Color de sistema">
                    <Select
                      value={form.color_sistema || ""}
                      onChange={(v) => setForm({ ...form, color_sistema: v })}
                      options={[
                        { value: "Blanco", label: "Blanco" },
                        { value: "Gris topo", label: "Gris topo" },
                        { value: "Negro texturado Brillante", label: "Negro texturado Brillante" },
                        { value: "Negro Semi Mate", label: "Negro Semi Mate" },
                        { value: "Negro Textourado mate", label: "Negro Textourado mate" },
                        { value: "Bronce colonial", label: "Bronce colonial" },
                      ]}
                    />
                  </Field>
                </Row>
              </Section>

              <Section title="Revestimiento">
                <Row>
                  <Field label="Tipo de Revestimiento">
                    <Select
                      value={form.tipo_revestimiento || ""}
                      onChange={(v) => {
                        const next = { ...form, tipo_revestimiento: v };
                        if (!["varillado_inyectado", "varillado_simple"].includes(v)) next.varillado_medida = "";
                        setForm(next);
                      }}
                      options={[
                        { value: "lamas", label: "Lamas" },
                        { value: "varillado_inyectado", label: "Varillado Inyectado" },
                        { value: "varillado_simple", label: "Varillado Simple" },
                      ]}
                    />
                  </Field>

                  {["varillado_inyectado", "varillado_simple"].includes(form.tipo_revestimiento) && (
                    <Field label="Medida (Varillado)">
                      <Select
                        value={form.varillado_medida || ""}
                        onChange={(v) => setForm({ ...form, varillado_medida: v })}
                        options={[
                          { value: "20 x 10 x 20", label: "20 x 10 x 20" },
                          { value: "40 x 10 x 40", label: "40 x 10 x 40" },
                        ]}
                      />
                    </Field>
                  )}

                  <Field label="Orientación del revestimiento">
                    <Select
                      value={form.orientacion_revestimiento || ""}
                      onChange={(v) => setForm({ ...form, orientacion_revestimiento: v })}
                      options={[
                        { value: "lamas_horizontales", label: "Lamas Horizontales" },
                        { value: "lamas_verticales", label: "Lamas Verticales" },
                        { value: "varillado_vertical", label: "Varillado Vertical" },
                      ]}
                    />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Revestimiento">
                    <Select
                      value={form.revestimiento || ""}
                      onChange={(v) => setForm({ ...form, revestimiento: v })}
                      options={[
                        { value: "Apto Aluminio", label: "Apto Aluminio" },
                        { value: "Simil madera Clásico Simil", label: "Simil madera Clásico Simil" },
                        { value: "Simil Aluminio Clásico", label: "Simil Aluminio Clásico" },
                        { value: "Apto PVC", label: "Apto PVC" },
                        { value: "Simil madera doble inyectado", label: "Simil madera doble inyectado" },
                        { value: "Simil aluminio doble inyectado", label: "Simil aluminio doble inyectado" },
                        { value: "Varillado", label: "Varillado" },
                      ]}
                    />
                  </Field>
                  <Field label="Color de revestimiento">
                    <Select
                      value={form.color_revestimiento || ""}
                      onChange={(v) => {
                        const next = { ...form, color_revestimiento: v };
                        if (v !== "Otros") next.color_revestimiento_otro = "";
                        setForm(next);
                      }}
                      options={[
                        { value: "Roble", label: "Roble" },
                        { value: "Negro Texturado", label: "Negro Texturado" },
                        { value: "Negro Semi mate", label: "Negro Semi mate" },
                        { value: "Blanco", label: "Blanco" },
                        { value: "Bronce Colonial", label: "Bronce Colonial" },
                        { value: "Negro Micro", label: "Negro Micro" },
                        { value: "Nogal", label: "Nogal" },
                        { value: "Gris Topo", label: "Gris Topo" },
                        { value: "Otros", label: "Otros" },
                      ]}
                    />
                  </Field>

                  {form.color_revestimiento === "Otros" && (
                    <Field label="Otros (especificar)">
                      <Input value={form.color_revestimiento_otro || ""} onChange={(v) => setForm({ ...form, color_revestimiento_otro: v })} style={{ width: "100%" }} />
                    </Field>
                  )}
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Lucera con vidrios">
                    <Select
                      value={form.lucera ? "si" : "no"}
                      onChange={(v) => {
                        const yes = v === "si";
                        setForm({ ...form, lucera: yes, lucera_cantidad: yes ? (form.lucera_cantidad || "") : "" });
                      }}
                      options={yesNoOptions}
                    />
                  </Field>

                  {form.lucera && (
                    <Field label="Cantidad (Lucera)">
                      <Input type="number" value={form.lucera_cantidad || ""} onChange={(v) => setForm({ ...form, lucera_cantidad: v })} style={{ width: "100%" }} />
                    </Field>
                  )}

                  <Field label="Peso del revestimiento a colocar">
                    <Input type="number" value={form.peso_revestimiento || ""} onChange={(v) => setForm({ ...form, peso_revestimiento: v })} style={{ width: "100%" }} />
                  </Field>
                </Row>
              </Section>

              <Section title="Servicios / Contacto">
                <Row>
                  <Field label="Servicio de traslado">
                    <Select value={form.traslado ? "si" : "no"} onChange={(v) => setYesNoBool("traslado", v)} options={yesNoOptions} />
                  </Field>
                  <Field label="Servicio de relevamiento de medidas">
                    <Select value={form.relevamiento ? "si" : "no"} onChange={(v) => setYesNoBool("relevamiento", v)} options={yesNoOptions} />
                  </Field>
                </Row>

                <div className="spacer" />

                <Row>
                  <Field label="Nombre de contacto en obra">
                    <textarea
                      value={form.contacto_obra_nombre || ""}
                      onChange={(e) => setForm({ ...form, contacto_obra_nombre: e.target.value })}
                      style={{ width: "100%", minHeight: 64, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical" }}
                    />
                  </Field>
                  <Field label="Teléfono de contacto en obra">
                    <Input type="tel" value={form.contacto_obra_tel || ""} onChange={(v) => setForm({ ...form, contacto_obra_tel: v })} style={{ width: "100%" }} />
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
                  <Button variant="secondary" onClick={() => mSave.mutate({ submit: false })} disabled={!canEdit || mSave.isPending}>
                    {mSave.isPending ? "Guardando…" : "Guardar"}
                  </Button>

                  <Button
                    onClick={() => {
                      openPendingWhatsappWindow();
                      mSave.mutate({ submit: true });
                    }}
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

                {shareInfo?.message && (
                  <>
                    <div className="spacer" />
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: shareInfo.tone === "warning" ? "1px solid #ffe3a3" : "1px solid #bfe6c8",
                        background: shareInfo.tone === "warning" ? "#fff7e6" : "#e7f7ed",
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>
                        {shareInfo.tone === "warning" ? "WhatsApp pendiente" : "WhatsApp preparado"}
                      </div>
                      <div>{shareInfo.message}</div>

                      {(shareInfo.whatsappUrl || shareInfo.publicPdfUrl) && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          {shareInfo.whatsappUrl && (
                            <Button variant="secondary" onClick={() => window.open(shareInfo.whatsappUrl, "_blank", "noopener,noreferrer")}>
                              Abrir WhatsApp
                            </Button>
                          )}
                          {shareInfo.publicPdfUrl && (
                            <Button
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(shareInfo.publicPdfUrl);
                                  setShareInfo((prev) => prev ? { ...prev, message: `${prev.message} Link copiado.` } : prev);
                                } catch {
                                  window.open(shareInfo.publicPdfUrl, "_blank", "noopener,noreferrer");
                                }
                              }}
                            >
                              Copiar link PDF
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
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
