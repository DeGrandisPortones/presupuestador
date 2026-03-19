import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../domain/auth/store.js";
import { PORTON_TYPES } from "../../domain/quote/portonConstants.js";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import DoorFormulaBuilder from "./DoorFormulaBuilder.jsx";

import {
  adminGetCatalog,
  adminCreateSection,
  adminUpdateSection,
  adminDeleteSection,
  adminSetTagSection,
  adminSetProductAlias,
  adminSetProductVisibility,
  adminSetTypeSections,
  adminSetTypeVisibility,
  adminRefreshCatalog,
  adminGetQuotes,
  adminGetFinalSettings,
  adminSaveFinalSettings,
  adminGetMeasurementProductMappings,
  adminSaveMeasurementProductMappings,
  adminGetDoorQuoteSettings,
  adminSaveDoorQuoteSettings,
} from "../../api/admin.js";

const MEASUREMENT_FIELDS = [
  { field_key: "colocacion", field_label: "Tipo de colocación", field_mode: "enum", values: [
    { value: "dentro_vano", label: "Por dentro del vano" },
    { value: "detras_vano", label: "Por detrás del vano" },
  ]},
  { field_key: "accionamiento", field_label: "Tipo de accionamiento", field_mode: "enum", values: [
    { value: "manual", label: "Manual" },
    { value: "automatico", label: "Automático" },
  ]},
  { field_key: "levadizo", field_label: "Sistema levadizo", field_mode: "enum", values: [
    { value: "coplanar", label: "Coplanar" },
    { value: "comun", label: "Común" },
  ]},
  { field_key: "anclaje", field_label: "Anclaje de fijación", field_mode: "enum", values: [
    { value: "lateral", label: "Lateral" },
    { value: "frontal", label: "Frontal" },
    { value: "sin", label: "Sin Anclajes" },
  ]},
  { field_key: "parantes.cant", field_label: "Cantidad de parantes", field_mode: "integer", values: [] },
  { field_key: "lucera_cantidad", field_label: "Cantidad de luceras", field_mode: "integer", values: [] },
  { field_key: "traslado", field_label: "Servicio de traslado", field_mode: "boolean", values: [
    { value: "si", label: "Sí" },
    { value: "no", label: "No" },
  ]},
  { field_key: "relevamiento", field_label: "Servicio de relevamiento de medidas", field_mode: "boolean", values: [
    { value: "si", label: "Sí" },
    { value: "no", label: "No" },
  ]},
  { field_key: "estructura_metalica", field_label: "Estructura metálica para puerta", field_mode: "boolean", values: [
    { value: "si", label: "Sí" },
    { value: "no", label: "No" },
  ]},
];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [tab, setTab] = useState("tags");
  const [catalogKind, setCatalogKind] = useState("porton");
  const [tolerancePercent, setTolerancePercent] = useState("0");
  const [doorFormula, setDoorFormula] = useState("precio_ipanel + precio_venta_marco");
  const [savingTolerance, setSavingTolerance] = useState(false);
  const [savingDoorFormula, setSavingDoorFormula] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionPos, setNewSectionPos] = useState("100");
  const [newSectionUseSurface, setNewSectionUseSurface] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const catalogQ = useQuery({ queryKey: ["adminCatalog", catalogKind], queryFn: () => adminGetCatalog(catalogKind), enabled: !!user?.is_enc_comercial });
  const quotesQ = useQuery({ queryKey: ["adminQuotes", catalogKind], queryFn: () => adminGetQuotes(catalogKind, 200), enabled: !!user?.is_enc_comercial && tab === "data" });
  const finalSettingsQ = useQuery({ queryKey: ["adminFinalSettings"], queryFn: adminGetFinalSettings, enabled: !!user?.is_enc_comercial });
  const doorQuoteSettingsQ = useQuery({ queryKey: ["adminDoorQuoteSettings"], queryFn: adminGetDoorQuoteSettings, enabled: !!user?.is_enc_comercial });
  const measurementMappingsQ = useQuery({ queryKey: ["adminMeasurementProductMappings"], queryFn: adminGetMeasurementProductMappings, enabled: !!user?.is_enc_comercial && tab === "medicion" });

  useEffect(() => {
    if (!finalSettingsQ.data) return;
    setTolerancePercent(String(finalSettingsQ.data.tolerance_percent ?? 0));
  }, [finalSettingsQ.data]);

  useEffect(() => {
    if (!doorQuoteSettingsQ.data) return;
    setDoorFormula(String(doorQuoteSettingsQ.data.formula || "precio_ipanel + precio_venta_marco"));
  }, [doorQuoteSettingsQ.data]);

  const catalog = catalogQ.data;
  const sections = Array.isArray(catalog?.sections) ? catalog.sections : [];
  const tags = Array.isArray(catalog?.tags) ? catalog.tags : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const typeSections = catalog?.type_sections || {};
  const typeVisibility = catalog?.type_visibility || {};

  const productById = useMemo(() => new Map(products.map((p) => [Number(p.id), p])), [products]);
  const tagById = useMemo(() => new Map(tags.map((t) => [Number(t.id), t])), [tags]);

  const filteredProductsByQuery = useMemo(() => {
    const q = norm(productQuery);
    if (!q) return products;
    return products.filter((p) => {
      const dn = norm(p.display_name || p.name);
      const raw = norm(p.name);
      const code = norm(p.code);
      return dn.includes(q) || raw.includes(q) || code.includes(q);
    });
  }, [products, productQuery]);

  const computedQuotes = useMemo(() => {
    const arr = Array.isArray(quotesQ.data) ? quotesQ.data : [];
    return arr.map((q) => {
      const lines = Array.isArray(q.lines) ? q.lines : [];
      const pids = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
      const tagIds = [...new Set(pids.flatMap((pid) => productById.get(pid)?.tag_ids || []))];
      const tagNames = tagIds.map((tid) => tagById.get(tid)?.name).filter(Boolean);
      return { ...q, tag_ids: tagIds, tags: tagNames };
    });
  }, [quotesQ.data, productById, tagById]);

  const filteredQuotes = useMemo(() => {
    let arr = computedQuotes;
    if (sectionFilter !== "all") {
      const sid = Number(sectionFilter);
      arr = arr.filter((q) => Array.isArray(q.section_ids) && q.section_ids.includes(sid));
    }
    if (tagFilter !== "all") {
      const tid = Number(tagFilter);
      arr = arr.filter((q) => Array.isArray(q.tag_ids) && q.tag_ids.includes(tid));
    }
    return arr;
  }, [computedQuotes, sectionFilter, tagFilter]);

  const filteredProductsForData = useMemo(() => {
    let arr = products;
    if (sectionFilter !== "all") {
      const sid = Number(sectionFilter);
      arr = arr.filter((p) => Array.isArray(p.section_ids) && p.section_ids.includes(sid));
    }
    if (tagFilter !== "all") {
      const tid = Number(tagFilter);
      arr = arr.filter((p) => Array.isArray(p.tag_ids) && p.tag_ids.includes(tid));
    }
    return arr;
  }, [products, sectionFilter, tagFilter]);

  if (!user?.is_enc_comercial) {
    return <div className="container"><div className="spacer" /><div className="card"><h2 style={{ marginTop: 0 }}>Dashboard</h2><div className="muted">No tenés permisos (solo Encargado Comercial).</div></div></div>;
  }

  const onRefresh = async () => {
    await adminRefreshCatalog();
    qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
    alert("Catálogo actualizado.");
  };

  const onCreateSection = async () => {
    await adminCreateSection(catalogKind, { name: newSectionName, position: Number(newSectionPos || 100), use_surface_qty: newSectionUseSurface });
    setNewSectionName("");
    setNewSectionUseSurface(false);
    qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
    alert("Sección creada.");
  };

  const onSaveTolerance = async () => {
    setSavingTolerance(true);
    try {
      const saved = await adminSaveFinalSettings({ tolerance_percent: tolerancePercent });
      setTolerancePercent(String(saved.tolerance_percent ?? 0));
      qc.invalidateQueries({ queryKey: ["adminFinalSettings"] });
      alert("Tolerancia guardada correctamente.");
    } finally {
      setSavingTolerance(false);
    }
  };

  const onSaveDoorFormula = async () => {
    setSavingDoorFormula(true);
    try {
      const saved = await adminSaveDoorQuoteSettings({ formula: doorFormula });
      setDoorFormula(String(saved.formula || "precio_ipanel + precio_venta_marco"));
      qc.invalidateQueries({ queryKey: ["adminDoorQuoteSettings"] });
      alert("Fórmula de puerta guardada correctamente.");
    } finally {
      setSavingDoorFormula(false);
    }
  };

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><h2 style={{ margin: 0 }}>Dashboard del Presupuestador</h2><div className="muted">Configuración de catálogo, medición y cotización final</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={catalogKind === "porton" ? "primary" : "ghost"} onClick={() => setCatalogKind("porton")}>Portones</Button>
          <Button variant={catalogKind === "ipanel" ? "primary" : "ghost"} onClick={() => setCatalogKind("ipanel")}>Ipanel</Button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button variant="ghost" onClick={onRefresh} disabled={catalogQ.isLoading}>Refrescar catálogo</Button></div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Tolerancia comercial para cotización final</h3>
        <div className="muted" style={{ marginBottom: 10 }}>Si la diferencia entre el presupuesto detallado final y la seña ya enviada es menor o igual a este porcentaje, el sistema descuenta lo necesario para que la nueva cotización en Odoo quede en <b>$0</b>.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}><div className="muted">Tolerancia %</div><Input value={tolerancePercent} onChange={setTolerancePercent} placeholder="0" style={{ width: "100%" }} /></div>
          <Button variant="primary" onClick={onSaveTolerance} disabled={savingTolerance || finalSettingsQ.isLoading}>{savingTolerance ? "Guardando..." : "Guardar tolerancia"}</Button>
          {finalSettingsQ.isError ? <div style={{ color: "#d93025" }}>{finalSettingsQ.error.message}</div> : null}
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Fórmula comercial de puerta</h3>
        <div className="muted" style={{ marginBottom: 10 }}>Variables disponibles: <b>precio_ipanel</b>, <b>precio_compra_marco</b>, <b>precio_venta_marco</b> y sus alias <b>precio_compra</b> / <b>precio_venta</b>. Podés repetir variables, usar paréntesis y valores fijos.</div>
        <DoorFormulaBuilder value={doorFormula} onChange={setDoorFormula} />
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary" onClick={onSaveDoorFormula} disabled={savingDoorFormula || doorQuoteSettingsQ.isLoading}>{savingDoorFormula ? "Guardando..." : "Guardar fórmula"}</Button>
          {doorQuoteSettingsQ.isError ? <div style={{ color: "#d93025" }}>{doorQuoteSettingsQ.error.message}</div> : null}
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className={tab === "tags" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("tags")}>Etiquetas → Secciones</button>
        <button className={tab === "aliases" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("aliases")}>Alias y visibilidad</button>
        <button className={tab === "types" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("types")}>Tipos → Secciones</button>
        <button className={tab === "medicion" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("medicion")}>Medición → Productos</button>
        <button className={tab === "data" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("data")}>Data</button>
      </div>

      <div className="spacer" />
      {catalogQ.isLoading && <div className="muted">Cargando…</div>}
      {catalogQ.isError && <div style={{ color: "#d93025" }}>{catalogQ.error.message}</div>}

      {!catalogQ.isLoading && !catalogQ.isError && (
        <>
          {tab === "tags" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Secciones</h3>
                <div className="spacer" />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Input value={newSectionName} onChange={setNewSectionName} placeholder="Nueva sección…" style={{ flex: 1, minWidth: 180 }} />
                  <Input value={newSectionPos} onChange={setNewSectionPos} placeholder="Posición" style={{ width: 110 }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
                    <input type="checkbox" checked={newSectionUseSurface} onChange={(e) => setNewSectionUseSurface(e.target.checked)} />
                    <span className="muted">Cantidad = superficie</span>
                  </label>
                  <Button variant="primary" disabled={!newSectionName.trim()} onClick={onCreateSection}>Crear</Button>
                </div>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sections.map((s) => (
                    <div key={s.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800 }}>{s.name}</div>
                          <div className="muted">Posición: {s.position}</div>
                        </div>
                        <Button variant="ghost" onClick={async () => { if (!window.confirm(`Borrar sección \"${s.name}\"?`)) return; await adminDeleteSection(catalogKind, s.id); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Sección borrada."); }}>🗑</Button>
                      </div>
                      <div className="spacer" />
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="checkbox" checked={!!s.use_surface_qty} onChange={async (e) => { await adminUpdateSection(catalogKind, s.id, { use_surface_qty: e.target.checked }); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Sección actualizada."); }} />
                        <span className="muted">Tomar cantidad por superficie siempre</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ flex: 2, minWidth: 520 }}>
                <h3 style={{ marginTop: 0 }}>Asignar sección por etiqueta</h3>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto", paddingRight: 6 }}>
                  {tags.map((t) => (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <select value={t.section_id || ""} onChange={async (e) => { const v = e.target.value ? Number(e.target.value) : null; await adminSetTagSection(catalogKind, t.id, v); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Etiqueta actualizada."); }} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}>
                        <option value="">(sin sección)</option>
                        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "aliases" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Alias y visibilidad</h3>
                <div className="spacer" />
                <Input value={productQuery} onChange={setProductQuery} placeholder="Buscar producto…" style={{ width: "100%" }} />
                <div className="muted" style={{ marginTop: 8 }}>Hacé click en el nombre del producto para ver el nombre completo que viene desde Odoo.</div>
              </div>
              <div className="card" style={{ flex: 2, minWidth: 520 }}>
                <h3 style={{ marginTop: 0 }}>Productos</h3>
                <div className="spacer" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>
                  {filteredProductsByQuery.slice(0, 400).map((p) => (
                    <AliasRow key={p.id} product={p} onSave={async ({ alias, visibilityMode }) => {
                      await adminSetProductAlias(catalogKind, p.id, alias);
                      await adminSetProductVisibility(catalogKind, p.id, {
                        disable_for_vendedor: visibilityMode === "vendedor" || visibilityMode === "both",
                        disable_for_distribuidor: visibilityMode === "distribuidor" || visibilityMode === "both",
                      });
                      qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                      alert("Producto actualizado.");
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "types" && (
            <div className="row">
              <TypesSectionsCard
                catalogKind={catalogKind}
                sections={sections}
                typeSections={typeSections}
                typeVisibility={typeVisibility}
                onSave={async (typeKey, sectionIds, visibilityMode) => {
                  await adminSetTypeSections(catalogKind, typeKey, sectionIds);
                  await adminSetTypeVisibility(catalogKind, typeKey, {
                    disable_for_vendedor: visibilityMode === "vendedor" || visibilityMode === "both",
                    disable_for_distribuidor: visibilityMode === "distribuidor" || visibilityMode === "both",
                  });
                  await adminRefreshCatalog();
                  qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] });
                  alert("Configuración del tipo guardada.");
                }}
              />
            </div>
          )}

          {tab === "medicion" && (
            <MeasurementMappingsCard products={products} mappings={normalizeMeasurementMappings(measurementMappingsQ.data)} loading={measurementMappingsQ.isLoading} error={measurementMappingsQ.error} onSave={async (payload) => { await adminSaveMeasurementProductMappings(payload); qc.invalidateQueries({ queryKey: ["adminMeasurementProductMappings"] }); alert("Asignaciones de medición guardadas."); }} />
          )}

          {tab === "data" && (
            <div className="row">
              <div className="card" style={{ flex: 1, minWidth: 320 }}>
                <h3 style={{ marginTop: 0 }}>Filtros</h3>
                <div className="muted">Sección</div>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
                  <option value="all">(todas)</option>
                  {sections.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <div className="spacer" />
                <div className="muted">Etiqueta</div>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>
                  <option value="all">(todas)</option>
                  {tags.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                </select>
              </div>
              <div className="card" style={{ flex: 1, minWidth: 420 }}>
                <h3 style={{ marginTop: 0 }}>Productos filtrados</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
                  {filteredProductsForData.map((p) => (
                    <div key={p.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                      <div style={{ fontWeight: 800 }}>{p.display_name || p.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>ID: {p.id} {p.code ? `· ${p.code}` : ""} {p.uses_surface_quantity ? "· Cantidad por superficie" : ""}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{(p.sections || []).join(", ") || "(sin secciones)"}</div>
                    </div>
                  ))}
                  {!filteredProductsForData.length && <div className="muted">Sin productos para ese filtro.</div>}
                </div>
              </div>
              <div className="card" style={{ flex: 1, minWidth: 420 }}>
                <h3 style={{ marginTop: 0 }}>Últimas cotizaciones</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
                  {filteredQuotes.map((q) => (
                    <div key={q.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 800 }}>{q.odoo_sale_order_name || q.final_sale_order_name || `#${String(q.id).slice(0, 8)}`}</div>
                        <div className="muted">{q.final_status || q.status}</div>
                      </div>
                    </div>
                  ))}
                  {!filteredQuotes.length && <div className="muted">Sin cotizaciones para ese filtro.</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeasurementMappingsCard({ products, mappings, loading, error, onSave }) {
  const [draft, setDraft] = useState({ rules: [] });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(mappings || { rules: [] }); }, [mappings]);
  const productOptions = useMemo(() => (Array.isArray(products) ? products : []).map((p) => ({ id: Number(p.id), label: `${p.display_name || p.name}${p.code ? ` · ${p.code}` : ""}` })), [products]);
  const mergedRules = useMemo(() => {
    const byKey = new Map((draft.rules || []).map((rule) => [rule.field_key, rule]));
    return MEASUREMENT_FIELDS.map((field) => ({ ...field, ...(byKey.get(field.field_key) || {}), values: (byKey.get(field.field_key)?.values || []).map((entry) => ({ expected_value: String(entry.expected_value || "").trim(), product_id: Number(entry.product_id || 0) || "" })) }));
  }, [draft]);
  function setFieldValues(fieldKey, values, fieldMeta) { setDraft((prev) => ({ rules: [ ...(prev.rules || []).filter((r) => r.field_key !== fieldKey), { field_key: fieldKey, field_label: fieldMeta.field_label, field_mode: fieldMeta.field_mode, active: true, values } ] })); }
  async function handleSave() { setSaving(true); try { await onSave({ rules: mergedRules.map((rule) => ({ field_key: rule.field_key, field_label: rule.field_label, field_mode: rule.field_mode, active: true, values: (rule.values || []).map((entry) => ({ expected_value: String(entry.expected_value || "").trim(), product_id: Number(entry.product_id || 0) || null })).filter((entry) => entry.expected_value && entry.product_id) })) }); } finally { setSaving(false); } }
  return <div className="card" style={{ width: "100%" }}><h3 style={{ marginTop: 0 }}>Medición → Productos</h3><div className="muted" style={{ marginBottom: 10 }}>Cada regla es <b>un campo</b>. Dentro de esa regla cargás los <b>valores posibles</b> y el producto que corresponde a cada uno.</div>{loading && <div className="muted">Cargando asignaciones…</div>}{error ? <div style={{ color: "#d93025", marginBottom: 10 }}>{error.message}</div> : null}<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{mergedRules.map((rule) => <div key={rule.field_key} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}><div style={{ fontWeight: 800 }}>{rule.field_label}</div><div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Campo: {rule.field_key}</div>{rule.field_mode === "integer" ? <IntegerFieldMappings rule={rule} productOptions={productOptions} onChange={(values) => setFieldValues(rule.field_key, values, rule)} /> : <PresetFieldMappings rule={rule} productOptions={productOptions} onChange={(values) => setFieldValues(rule.field_key, values, rule)} />}</div>)}</div><div className="spacer" /><Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar asignaciones"}</Button></div>;
}

function PresetFieldMappings({ rule, productOptions, onChange }) {
  const field = MEASUREMENT_FIELDS.find((item) => item.field_key === rule.field_key);
  const rows = (field?.values || []).map((opt) => { const existing = (rule.values || []).find((entry) => String(entry.expected_value) === String(opt.value)); return { expected_value: opt.value, label: opt.label, product_id: existing?.product_id || "" }; });
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map((entry) => <div key={entry.expected_value} style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 10, alignItems: "center" }}><div className="muted">{entry.label}</div><select value={entry.product_id || ""} onChange={(e) => { const next = rows.map((item) => item.expected_value === entry.expected_value ? { ...item, product_id: e.target.value ? Number(e.target.value) : "" } : item); onChange(next); }} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="">(sin producto)</option>{productOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>)}</div>;
}

function IntegerFieldMappings({ rule, productOptions, onChange }) {
  const rows = Array.isArray(rule.values) ? rule.values : [];
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map((entry, idx) => <div key={`${rule.field_key}-${idx}`} style={{ display: "grid", gridTemplateColumns: "120px 1fr 52px", gap: 10, alignItems: "center" }}><Input value={entry.expected_value || ""} onChange={(value) => { const next = rows.map((item, i) => i === idx ? { ...item, expected_value: value.replace(/[^0-9]/g, "") } : item); onChange(next); }} placeholder="Valor" style={{ width: "100%" }} /><select value={entry.product_id || ""} onChange={(e) => { const next = rows.map((item, i) => i === idx ? { ...item, product_id: e.target.value ? Number(e.target.value) : "" } : item); onChange(next); }} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="">(sin producto)</option>{productOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select><Button variant="ghost" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>✕</Button></div>)}<Button variant="ghost" onClick={() => onChange([...(rows || []), { expected_value: "", product_id: "" }])}>+ Agregar valor entero</Button></div>;
}

function TypesSectionsCard({ catalogKind, sections, typeSections, typeVisibility, onSave }) {
  const [selectedType, setSelectedType] = useState(PORTON_TYPES?.[0]?.key || "");
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);
  const [visibilityMode, setVisibilityMode] = useState("none");
  const canUse = (catalogKind || "porton") === "porton";
  useEffect(() => { const arr = canUse && selectedType ? (typeSections?.[selectedType] || []) : []; setSelectedSectionIds((arr || []).map((x) => Number(x))); setVisibilityMode(visibilityModeFromTypeEntry(typeVisibility?.[selectedType] || {})); }, [selectedType, catalogKind, canUse, typeSections, typeVisibility]);
  if (!canUse) return <div className="card" style={{ flex: 1 }}><h3 style={{ marginTop: 0 }}>Tipos → Secciones</h3><div className="muted">Esto aplica solo a Portones.</div></div>;
  const sectionSet = new Set(selectedSectionIds.map((x) => Number(x)));
  return <><div className="card" style={{ flex: 1, minWidth: 320 }}><h3 style={{ marginTop: 0 }}>Tipos / Sistemas</h3><div className="spacer" /><select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>{PORTON_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select><div className="spacer" /><div className="muted">Visibilidad del tipo</div><select value={visibilityMode} onChange={(e) => setVisibilityMode(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="none">Habilitado para todos</option><option value="vendedor">Oculto solo para vendedores</option><option value="distribuidor">Oculto solo para distribuidores</option><option value="both">Oculto para ambos</option></select><div className="spacer" /><Button variant="primary" onClick={async () => onSave(selectedType, selectedSectionIds, visibilityMode)}>Guardar configuración</Button></div><div className="card" style={{ flex: 2, minWidth: 520 }}><h3 style={{ marginTop: 0 }}>Secciones visibles</h3><div className="spacer" /><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>{sections.map((s) => { const sid = Number(s.id); const checked = sectionSet.has(sid); return <label key={sid} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #eee", padding: 10, borderRadius: 10 }}><input type="checkbox" checked={checked} onChange={(e) => { const next = new Set(sectionSet); if (e.target.checked) next.add(sid); else next.delete(sid); setSelectedSectionIds([...next]); }} /><div style={{ fontWeight: 700 }}>{s.name}</div><div className="muted" style={{ marginLeft: "auto" }}>Pos: {s.position}</div></label>; })}</div></div></>;
}

function AliasRow({ product, onSave }) {
  const [value, setValue] = useState(product.alias || "");
  const [visibilityMode, setVisibilityMode] = useState(visibilityModeFromProduct(product));
  const [saving, setSaving] = useState(false);
  const changed = value.trim() !== (product.alias || "") || visibilityMode !== visibilityModeFromProduct(product);
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 240px 220px 90px", gap: 10, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}><div style={{ minWidth: 0 }}><button type="button" onClick={() => window.alert(product.name || product.display_name || "")} style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left", width: "100%" }} title="Ver nombre completo de Odoo">{product.name}</button><div className="muted" style={{ fontSize: 12 }}>ID: {product.id}{product.code ? ` · ${product.code}` : ""}{product.uses_surface_quantity ? " · superficie" : ""}</div></div><Input value={value} onChange={setValue} placeholder="Nombre visible…" style={{ width: "100%" }} /><select value={visibilityMode} onChange={(e) => setVisibilityMode(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="none">Habilitado para todos</option><option value="vendedor">Deshabilitado solo para vendedores</option><option value="distribuidor">Deshabilitado solo para distribuidores</option><option value="both">Deshabilitado para ambos</option></select><Button variant="primary" disabled={!changed || saving} onClick={async () => { setSaving(true); try { await onSave({ alias: value, visibilityMode }); } finally { setSaving(false); } }}>{saving ? "…" : "Guardar"}</Button></div>;
}
