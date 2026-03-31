import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getMeasurement, reviewMeasurement, saveMeasurement } from "../../api/measurements.js";
import { useAuthStore } from "../../domain/auth/store.js";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

function text(v) { return String(v ?? "").trim(); }
function boolValue(v) { return v === true || String(v || "").toLowerCase().trim() === "si"; }
function splitName(endCustomer = {}) {
  const first = text(endCustomer.first_name);
  const last = text(endCustomer.last_name);
  if (first || last) return { first, last };
  const parts = text(endCustomer.name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function extractBudgetDimensionMm(quote, key) {
  const dims = quote?.payload?.dimensions || {};
  const raw = key === "ancho" ? dims?.width : dims?.height;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000));
}
function normalizeTriple(values = [], suggested = "") {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[1] = suggested;
  return arr;
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
function updateSchemeValue(form, axis, index, value) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || []),
    ancho: normalizeTriple(form.esquema?.ancho || []),
  };
  next[axis][index] = value;
  return { ...form, esquema: next };
}
function buildInitialForm(quote, current = {}) {
  const end = quote?.end_customer || {};
  const split = splitName(end);
  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  return {
    ...current,
    fecha: text(current.fecha) || todayISO(),
    fecha_nota_pedido: text(current.fecha_nota_pedido) || (quote?.confirmed_at ? String(quote.confirmed_at).slice(0, 10) : ""),
    nota_venta: text(current.nota_venta) || text(quote?.final_sale_order_name || quote?.odoo_sale_order_name || quote?.quote_number),
    cliente_nombre: text(current.cliente_nombre) || split.first,
    cliente_apellido: text(current.cliente_apellido) || split.last,
    distribuidor: text(current.distribuidor) || text(quote?.created_by_full_name || quote?.created_by_username || (quote?.created_by_role === "vendedor" ? "De Grandis Portones" : "")),
    tipo_revestimiento_comercial: text(current.tipo_revestimiento_comercial),
    fabricante_revestimiento: text(current.fabricante_revestimiento),
    lucera: boolValue(current.lucera),
    lucera_cantidad: text(current.lucera_cantidad),
    lucera_posicion: text(current.lucera_posicion),
    color_revestimiento: text(current.color_revestimiento),
    color_sistema: text(current.color_sistema),
    listones: text(current.listones),
    puerta: boolValue(current.puerta),
    posicion_puerta: text(current.posicion_puerta || current.lado_puerta),
    parantes: { cant: text(current?.parantes?.cant), distribucion: text(current?.parantes?.distribucion) },
    pasador_manual: boolValue(current.pasador_manual),
    instalacion: boolValue(current.instalacion),
    anclaje: text(current.anclaje),
    piernas: text(current.piernas),
    rebaje: boolValue(current.rebaje),
    rebaje_altura: text(current.rebaje_altura),
    rebaje_lateral: boolValue(current.rebaje_lateral),
    rebaje_inferior: boolValue(current.rebaje_inferior),
    trampa_tierra: boolValue(current.trampa_tierra),
    trampa_tierra_altura: text(current.trampa_tierra_altura),
    esquema: {
      alto: normalizeTriple(current?.esquema?.alto || [], suggestedAlto),
      ancho: normalizeTriple(current?.esquema?.ancho || [], suggestedAncho),
    },
    alto_final_mm: text(current.alto_final_mm) || suggestedAlto,
    ancho_final_mm: text(current.ancho_final_mm) || suggestedAncho,
    observaciones: text(current.observaciones),
  };
}
function Section({ title, children }) { return <div className="card" style={{ background: "#fafafa", marginBottom: 12 }}><div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>{children}</div>; }
function Row({ children }) { return <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>; }
function Field({ label, children }) { return <div style={{ flex: 1, minWidth: 220 }}><div className="muted" style={{ marginBottom: 6 }}>{label}</div>{children}</div>; }
function YesNo({ value, onChange, disabled }) { return <select value={value ? "si" : "no"} onChange={(e) => onChange(e.target.value === "si")} disabled={disabled} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="si">Sí</option><option value="no">No</option></select>; }

export default function MedicionDetailPage() {
  const { id } = useParams();
  const quoteId = id ? String(id) : null;
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isTechnical = !!user?.is_rev_tecnica;
  const isMedidor = !!user?.is_medidor;
  const q = useQuery({ queryKey: ["measurement", quoteId], queryFn: () => getMeasurement(quoteId), enabled: !!quoteId });
  const quote = q.data;
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!quote) return;
    setForm(buildInitialForm(quote, quote.measurement_form || {}));
  }, [quote]);

  const saveM = useMutation({
    mutationFn: ({ submit }) => saveMeasurement(quoteId, { form, submit, endCustomer: quote?.end_customer || {} }),
    onSuccess: () => q.refetch(),
  });
  const rejectM = useMutation({
    mutationFn: (notes) => reviewMeasurement(quoteId, { action: "reject", notes }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading) return <div className="container"><div className="card"><div className="muted">Cargando…</div></div></div>;
  if (q.isError) return <div className="container"><div className="card"><div style={{ color: "#d93025" }}>{q.error.message}</div></div></div>;
  if (!quote || !form) return null;

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Planilla de medición / datos técnicos</h2>
        <div className="muted">Presupuesto #{quote?.quote_number || quote?.odoo_sale_order_name || "—"}</div>
        <div className="spacer" />
        <Button variant="ghost" onClick={() => navigate(-1)}>Volver</Button>
      </div>

      <div className="spacer" />
      <Section title="Datos generales">
        <Row>
          <Field label="Nota de Venta / NV"><Input value={form.nota_venta || ""} onChange={(v) => setForm({ ...form, nota_venta: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
          <Field label="Fecha de Nota de Pedido"><Input type="date" value={form.fecha_nota_pedido || ""} onChange={(v) => setForm({ ...form, fecha_nota_pedido: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
          <Field label="Fecha de medición"><Input type="date" value={form.fecha || ""} onChange={(v) => setForm({ ...form, fecha: v })} style={{ width: "100%" }} disabled={!isTechnical && !isMedidor} /></Field>
          <Field label="Distribuidor"><Input value={form.distribuidor || ""} onChange={(v) => setForm({ ...form, distribuidor: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Nombre del cliente"><Input value={form.cliente_nombre || ""} onChange={(v) => setForm({ ...form, cliente_nombre: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
          <Field label="Apellido del cliente"><Input value={form.cliente_apellido || ""} onChange={(v) => setForm({ ...form, cliente_apellido: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
          <Field label="Alto final (mm)"><Input value={form.alto_final_mm || ""} onChange={(v) => setForm({ ...form, alto_final_mm: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
          <Field label="Ancho final (mm)"><Input value={form.ancho_final_mm || ""} onChange={(v) => setForm({ ...form, ancho_final_mm: v })} style={{ width: "100%" }} disabled={!isTechnical} /></Field>
        </Row>
      </Section>

      <Section title="Esquema (medidas)">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 2, minWidth: 320 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" }}>
              <div style={{ position: "relative", width: "100%" }}>
                <img src="/measurement_scheme.png" alt="Esquema de medición" style={{ width: "100%", height: "auto", display: "block" }} />
                {SCHEME_RECT_PCTS.alto.map((p, i) => {
                  const v = form.esquema?.alto?.[i];
                  if (!v) return null;
                  return (
                    <div
                      key={`alto-ov-${i}`}
                      style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}
                    >
                      {v}
                    </div>
                  );
                })}
                {SCHEME_RECT_PCTS.ancho.map((p, i) => {
                  const v = form.esquema?.ancho?.[i];
                  if (!v) return null;
                  return (
                    <div
                      key={`ancho-ov-${i}`}
                      style={{ ...schemeOverlayBaseStyle, left: `${p.left}%`, top: `${p.top}%`, width: `${p.width}%`, height: `${p.height}%`, fontSize: 14 }}
                    >
                      {v}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Ingresá las tres medidas de alto y las tres medidas de ancho en milímetros.</div>
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Altos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`alto-${i}`} label={`Alto ${i + 1} (mm)`}>
                  <Input
                    value={form.esquema?.alto?.[i] || ""}
                    onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", i, v))}
                    style={{ width: "100%" }}
                  />
                </Field>
              ))}
            </Row>

            <div className="spacer" />
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Anchos</div>
            <Row>
              {[0, 1, 2].map((i) => (
                <Field key={`ancho-${i}`} label={`Ancho ${i + 1} (mm)`}>
                  <Input
                    value={form.esquema?.ancho?.[i] || ""}
                    onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", i, v))}
                    style={{ width: "100%" }}
                  />
                </Field>
              ))}
            </Row>
          </div>
        </div>
      </Section>

      <Section title="Revestimiento">
        <Row>
          <Field label="Tipo revestimiento">
            <select value={form.tipo_revestimiento_comercial || ""} onChange={(e) => setForm({ ...form, tipo_revestimiento_comercial: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
              <option value="">Seleccione…</option>
              <option value="PVC">PVC</option>
              <option value="Madera">Madera</option>
              <option value="Aluminio">Aluminio</option>
              <option value="chapa">Chapa</option>
              <option value="otros">Otros</option>
            </select>
          </Field>
          <Field label="Fabricante revestimiento"><Input value={form.fabricante_revestimiento || ""} onChange={(v) => setForm({ ...form, fabricante_revestimiento: v })} style={{ width: "100%" }} /></Field>
          <Field label="Color revestimiento"><Input value={form.color_revestimiento || ""} onChange={(v) => setForm({ ...form, color_revestimiento: v })} style={{ width: "100%" }} /></Field>
          <Field label="Color sistema"><Input value={form.color_sistema || ""} onChange={(v) => setForm({ ...form, color_sistema: v })} style={{ width: "100%" }} /></Field>
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Listones"><Input value={form.listones || ""} onChange={(v) => setForm({ ...form, listones: v })} style={{ width: "100%" }} /></Field>
          <Field label="Lucera"><YesNo value={form.lucera} onChange={(v) => setForm({ ...form, lucera: v })} /></Field>
          <Field label="Cant. de luceras"><Input value={form.lucera_cantidad || ""} onChange={(v) => setForm({ ...form, lucera_cantidad: v })} style={{ width: "100%" }} disabled={!form.lucera} /></Field>
          <Field label="Posición de lucera"><Input value={form.lucera_posicion || ""} onChange={(v) => setForm({ ...form, lucera_posicion: v })} style={{ width: "100%" }} disabled={!form.lucera} /></Field>
        </Row>
      </Section>

      <Section title="Puerta / estructura">
        <Row>
          <Field label="Puerta"><YesNo value={form.puerta} onChange={(v) => setForm({ ...form, puerta: v })} /></Field>
          <Field label="Posición de la puerta"><Input value={form.posicion_puerta || ""} onChange={(v) => setForm({ ...form, posicion_puerta: v })} style={{ width: "100%" }} disabled={!form.puerta} /></Field>
          <Field label="Parantes cantidad"><Input value={form.parantes?.cant || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes || {}), cant: v } })} style={{ width: "100%" }} /></Field>
          <Field label="Parantes distribución"><Input value={form.parantes?.distribucion || ""} onChange={(v) => setForm({ ...form, parantes: { ...(form.parantes || {}), distribucion: v } })} style={{ width: "100%" }} /></Field>
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Pasador manual"><YesNo value={form.pasador_manual} onChange={(v) => setForm({ ...form, pasador_manual: v })} /></Field>
          <Field label="Instalación"><YesNo value={form.instalacion} onChange={(v) => setForm({ ...form, instalacion: v })} /></Field>
          <Field label="Anclaje">
            <select value={form.anclaje || ""} onChange={(e) => setForm({ ...form, anclaje: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
              <option value="">Seleccione…</option>
              <option value="no">No</option>
              <option value="lateral">Lateral</option>
              <option value="superior">Superior</option>
            </select>
          </Field>
          <Field label="Piernas"><Input value={form.piernas || ""} onChange={(v) => setForm({ ...form, piernas: v })} style={{ width: "100%" }} /></Field>
        </Row>
      </Section>

      <Section title="Rebajes / suelo">
        <Row>
          <Field label="Rebaje"><YesNo value={form.rebaje} onChange={(v) => setForm({ ...form, rebaje: v })} /></Field>
          <Field label="Altura de rebaje">
            <select value={form.rebaje_altura || ""} onChange={(e) => setForm({ ...form, rebaje_altura: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} disabled={!form.rebaje}>
              <option value="">Seleccione…</option>
              <option value="75mm">75mm</option>
              <option value="100mm">100mm</option>
              <option value="125mm">125mm</option>
            </select>
          </Field>
          <Field label="Rebaje lateral"><YesNo value={form.rebaje_lateral} onChange={(v) => setForm({ ...form, rebaje_lateral: v })} /></Field>
          <Field label="Rebaje inferior"><YesNo value={form.rebaje_inferior} onChange={(v) => setForm({ ...form, rebaje_inferior: v })} /></Field>
        </Row>
        <div className="spacer" />
        <Row>
          <Field label="Trampa de tierra"><YesNo value={form.trampa_tierra} onChange={(v) => setForm({ ...form, trampa_tierra: v })} /></Field>
          <Field label="Altura trampa de tierra">
            <select value={form.trampa_tierra_altura || ""} onChange={(e) => setForm({ ...form, trampa_tierra_altura: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} disabled={!form.trampa_tierra}>
              <option value="">Seleccione…</option>
              <option value="2 cm">2 cm</option>
              <option value="5 cm">5 cm</option>
            </select>
          </Field>
        </Row>
      </Section>

      <Section title="Observaciones">
        <textarea value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
      </Section>

      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" disabled={saveM.isPending} onClick={() => saveM.mutate({ submit: false })}>{saveM.isPending ? "Guardando..." : "Guardar"}</Button>
          <Button disabled={saveM.isPending} onClick={() => saveM.mutate({ submit: true })}>{saveM.isPending ? "Enviando..." : (isTechnical ? "Confirmar datos técnicos" : "Enviar a Técnica")}</Button>
          {isTechnical && <Button variant="ghost" disabled={rejectM.isPending} onClick={() => { const notes = window.prompt("Motivo de corrección:", "") || ""; if (!notes) return; rejectM.mutate(notes); }}>{rejectM.isPending ? "Devolviendo..." : "Devolver para corregir"}</Button>}
        </div>
      </div>
    </div>
  );
}
