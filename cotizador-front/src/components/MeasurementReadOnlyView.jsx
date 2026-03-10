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

function normalizeMeasurementForm(raw, quote) {
  const f = raw && typeof raw === "object" ? { ...raw } : {};

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

function Section({ title, children }) {
  return (
    <div className="card" style={{ background: "#fff", marginBottom: 12, border: "1px solid #eee" }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>;
}

function Field({ label, value, fullWidth = false, muted = false }) {
  return (
    <div style={{ flex: fullWidth ? "1 1 100%" : 1, minWidth: fullWidth ? "100%" : 220 }}>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      <div
        style={{
          minHeight: 42,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e3e3e3",
          background: muted ? "#fafafa" : "#fff",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || <span className="muted">—</span>}
      </div>
    </div>
  );
}

function boolLabel(v) {
  return v ? "Sí" : "No";
}

export default function MeasurementReadOnlyView({ quote }) {
  const form = normalizeMeasurementForm(quote?.measurement_form || {}, quote);
  const endCustomer = quote?.end_customer || {};

  return (
    <div>
      <Section title="Datos generales">
        <Row>
          <Field label="Fecha" value={form.fecha} />
          <Field label="Distribuidor" value={form.distribuidor} />
          <Field label="Cliente" value={endCustomer.name} muted />
          <Field label="N° de portón (Nota de venta)" value={form.nro_porton} />
        </Row>
      </Section>

      <Section title="Parantes / Laterales">
        <Row>
          <Field label="Parantes (Cant)" value={form.parantes?.cant} />
          <Field label="Lado de la puerta" value={form.lado_puerta} />
          <Field label="Lado de motor o soporte" value={form.lado_motor} />
          <Field label="Toma corriente" value={form.toma_corriente} />
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
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Alto</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`} value={form.esquema?.alto?.[i]} />
              ))}
            </Row>

            <div className="spacer" />

            <div style={{ fontWeight: 900, marginBottom: 8 }}>Ancho</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`} value={form.esquema?.ancho?.[i]} />
              ))}
            </Row>
          </div>
        </div>
      </Section>

      <Section title="Instalación / Sistema">
        <Row>
          <Field label="Tipo de colocación" value={form.colocacion} />
          <Field label="Portón en acopio" value={boolLabel(!!form.en_acopio)} muted />
          <Field label="Tipo de accionamiento" value={form.accionamiento} />
          <Field label="Sistema levadizo" value={form.levadizo} />
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Estructura metálica para puerta" value={boolLabel(!!form.estructura_metalica)} />
          <Field label="Rebaje lateral (mm)" value={form.rebaje_lateral_mm} />
          <Field label="Rebaje inferior (mm)" value={form.rebaje_inferior_mm} />
          <Field label="Anclaje de fijación" value={form.anclaje} />
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Color de sistema" value={form.color_sistema} />
        </Row>
      </Section>

      <Section title="Revestimiento">
        <Row>
          <Field label="Tipo de revestimiento" value={form.tipo_revestimiento} />
          <Field label="Medida (Varillado)" value={form.varillado_medida} />
          <Field label="Orientación del revestimiento" value={form.orientacion_revestimiento} />
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Revestimiento" value={form.revestimiento} />
          <Field label="Color de revestimiento" value={form.color_revestimiento} />
          {form.color_revestimiento === "Otros" && <Field label="Otros (especificar)" value={form.color_revestimiento_otro} />}
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Lucera con vidrios" value={boolLabel(!!form.lucera)} />
          <Field label="Cantidad (Lucera)" value={form.lucera ? form.lucera_cantidad : "No aplica"} muted={!form.lucera} />
          <Field label="Peso del revestimiento a colocar" value={form.peso_revestimiento} />
        </Row>
      </Section>

      <Section title="Servicios / Contacto">
        <Row>
          <Field label="Servicio de traslado" value={boolLabel(!!form.traslado)} />
          <Field label="Servicio de relevamiento de medidas" value={boolLabel(!!form.relevamiento)} />
        </Row>

        <div className="spacer" />

        <Row>
          <Field label="Nombre de contacto en obra" value={form.contacto_obra_nombre} fullWidth />
          <Field label="Teléfono de contacto en obra" value={form.contacto_obra_tel} />
        </Row>
      </Section>

      <Section title="Observaciones">
        <Field label="Detalle" value={form.observaciones} fullWidth />
      </Section>
    </div>
  );
}
