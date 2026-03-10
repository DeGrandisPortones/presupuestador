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
    { left: 9.22, top: 43.73, width: 14.40, height: 14.24 },
    { left: 27.02, top: 43.73, width: 14.40, height: 14.24 },
    { left: 44.50, top: 43.73, width: 14.24, height: 14.24 },
  ],
  ancho: [
    { left: 71.36, top: 22.71, width: 14.40, height: 14.24 },
    { left: 71.36, top: 48.14, width: 14.40, height: 13.90 },
    { left: 71.36, top: 82.71, width: 14.40, height: 14.24 },
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

function ValueBox({ children, muted = false }) {
  return (
    <div
      style={{
        minHeight: 42,
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: "#fff",
        color: muted ? "#777" : "#111",
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function formatText(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  const text = String(v).trim();
  return text ? text : "—";
}

function labelFromValue(value, options) {
  const found = options.find((o) => o.value === value);
  return found ? found.label : formatText(value);
}

function readOnlyTextAreaStyle() {
  return {
    width: "100%",
    minHeight: 100,
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    resize: "vertical",
    boxSizing: "border-box",
  };
}

const LEFT_RIGHT_OPTIONS = [
  { value: "izquierda", label: "Izquierda" },
  { value: "derecha", label: "Derecha" },
];

const COLOCACION_OPTIONS = [
  { value: "dentro_vano", label: "Por dentro del vano" },
  { value: "detras_vano", label: "Por detrás del vano" },
];

const ACCIONAMIENTO_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "automatico", label: "Automático" },
];

const LEVADIZO_OPTIONS = [
  { value: "coplanar", label: "Coplanar" },
  { value: "comun", label: "Común" },
];

const ANCLAJE_OPTIONS = [
  { value: "lateral", label: "Lateral" },
  { value: "frontal", label: "Frontal" },
  { value: "sin", label: "Sin Anclajes" },
];

const TIPO_REVESTIMIENTO_OPTIONS = [
  { value: "lamas", label: "Lamas" },
  { value: "varillado_inyectado", label: "Varillado Inyectado" },
  { value: "varillado_simple", label: "Varillado Simple" },
];

const ORIENTACION_OPTIONS = [
  { value: "lamas_horizontales", label: "Lamas Horizontales" },
  { value: "lamas_verticales", label: "Lamas Verticales" },
  { value: "varillado_vertical", label: "Varillado Vertical" },
];

export default function MeasurementReadOnlyView({ quote }) {
  const form = normalizeMeasurementForm(quote?.measurement_form, quote);
  const endCustomer = quote?.end_customer || {};
  const colorRevestimiento = form.color_revestimiento === "Otros"
    ? form.color_revestimiento_otro || "Otros"
    : form.color_revestimiento;

  return (
    <div>
      <Section title="Membrete">
        <Row>
          <Field label="Cliente">
            <ValueBox>{formatText(endCustomer.name)}</ValueBox>
          </Field>
          <Field label="Teléfono">
            <ValueBox>{formatText(endCustomer.phone)}</ValueBox>
          </Field>
          <Field label="Dirección">
            <ValueBox>{formatText(endCustomer.address)}</ValueBox>
          </Field>
          <Field label="Maps">
            <ValueBox muted={!endCustomer.maps_url}>
              {endCustomer.maps_url ? (
                <a href={endCustomer.maps_url} target="_blank" rel="noreferrer">Abrir ubicación</a>
              ) : (
                "—"
              )}
            </ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Datos generales">
        <Row>
          <Field label="Fecha">
            <ValueBox>{formatText(form.fecha)}</ValueBox>
          </Field>
          <Field label="Distribuidor">
            <ValueBox>{formatText(form.distribuidor)}</ValueBox>
          </Field>
          <Field label="Cliente">
            <ValueBox>{formatText(endCustomer.name)}</ValueBox>
          </Field>
          <Field label="N° de portón (Nota de venta)">
            <ValueBox>{formatText(form.nro_porton)}</ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Parantes / Laterales">
        <Row>
          <Field label="Parantes (Cant)">
            <ValueBox>{formatText(form.parantes?.cant)}</ValueBox>
          </Field>
          <Field label="Lado de la puerta">
            <ValueBox>{labelFromValue(form.lado_puerta, LEFT_RIGHT_OPTIONS)}</ValueBox>
          </Field>
          <Field label="Lado de motor o soporte">
            <ValueBox>{labelFromValue(form.lado_motor, LEFT_RIGHT_OPTIONS)}</ValueBox>
          </Field>
          <Field label="Toma Corriente">
            <ValueBox>{labelFromValue(form.toma_corriente, LEFT_RIGHT_OPTIONS)}</ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Esquema (medidas)">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 2, minWidth: 320 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <img
                  src="/measurement_scheme.png"
                  alt="Esquema"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />

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
              Valores cargados sobre el esquema de medición.
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Alto</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}>
                  <ValueBox>{formatText(form.esquema?.alto?.[i])}</ValueBox>
                </Field>
              ))}
            </Row>

            <div className="spacer" />

            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ancho</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}>
                  <ValueBox>{formatText(form.esquema?.ancho?.[i])}</ValueBox>
                </Field>
              ))}
            </Row>
          </div>
        </div>
      </Section>

      <Section title="Instalación / Sistema">
        <Row>
          <Field label="Tipo de colocación">
            <ValueBox>{labelFromValue(form.colocacion, COLOCACION_OPTIONS)}</ValueBox>
          </Field>
          <Field label="Portón en acopio">
            <ValueBox>{formatText(form.en_acopio)}</ValueBox>
          </Field>
          <Field label="Tipo de accionamiento">
            <ValueBox>{labelFromValue(form.accionamiento, ACCIONAMIENTO_OPTIONS)}</ValueBox>
          </Field>
          <Field label="Sistema levadizo">
            <ValueBox>{labelFromValue(form.levadizo, LEVADIZO_OPTIONS)}</ValueBox>
          </Field>
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Estructura metálica para puerta">
            <ValueBox>{formatText(form.estructura_metalica)}</ValueBox>
          </Field>
          <Field label="Rebaje lateral (mm)">
            <ValueBox>{formatText(form.rebaje_lateral_mm)}</ValueBox>
          </Field>
          <Field label="Rebaje inferior (mm)">
            <ValueBox>{formatText(form.rebaje_inferior_mm)}</ValueBox>
          </Field>
          <Field label="Anclaje de fijación">
            <ValueBox>{labelFromValue(form.anclaje, ANCLAJE_OPTIONS)}</ValueBox>
          </Field>
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Color de sistema">
            <ValueBox>{formatText(form.color_sistema)}</ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Revestimiento">
        <Row>
          <Field label="Tipo de Revestimiento">
            <ValueBox>{labelFromValue(form.tipo_revestimiento, TIPO_REVESTIMIENTO_OPTIONS)}</ValueBox>
          </Field>

          {["varillado_inyectado", "varillado_simple"].includes(form.tipo_revestimiento) && (
            <Field label="Medida (Varillado)">
              <ValueBox>{formatText(form.varillado_medida)}</ValueBox>
            </Field>
          )}

          <Field label="Orientación del revestimiento">
            <ValueBox>{labelFromValue(form.orientacion_revestimiento, ORIENTACION_OPTIONS)}</ValueBox>
          </Field>
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Revestimiento">
            <ValueBox>{formatText(form.revestimiento)}</ValueBox>
          </Field>
          <Field label="Color de revestimiento">
            <ValueBox>{formatText(colorRevestimiento)}</ValueBox>
          </Field>
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Lucera con vidrios">
            <ValueBox>{formatText(form.lucera)}</ValueBox>
          </Field>
          {form.lucera && (
            <Field label="Cantidad (Lucera)">
              <ValueBox>{formatText(form.lucera_cantidad)}</ValueBox>
            </Field>
          )}
          <Field label="Peso del revestimiento a colocar">
            <ValueBox>{formatText(form.peso_revestimiento)}</ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Servicios / Contacto">
        <Row>
          <Field label="Servicio de traslado">
            <ValueBox>{formatText(form.traslado)}</ValueBox>
          </Field>
          <Field label="Servicio de relevamiento de medidas">
            <ValueBox>{formatText(form.relevamiento)}</ValueBox>
          </Field>
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Nombre de contacto en obra">
            <textarea readOnly value={form.contacto_obra_nombre || ""} style={readOnlyTextAreaStyle()} />
          </Field>
          <Field label="Teléfono de contacto en obra">
            <ValueBox>{formatText(form.contacto_obra_tel)}</ValueBox>
          </Field>
        </Row>
      </Section>

      <Section title="Observaciones">
        <textarea readOnly value={form.observaciones || ""} style={readOnlyTextAreaStyle()} />
      </Section>
    </div>
  );
}
