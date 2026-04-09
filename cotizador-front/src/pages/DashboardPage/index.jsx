import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../domain/auth/store.js";
import { PORTON_TYPES } from "../../domain/quote/portonConstants.js";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";

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
  adminGetDoorQuoteSettings,
  adminSaveDoorQuoteSettings,
  adminGetTechnicalMeasurementRules,
  adminSaveTechnicalMeasurementRules,
} from "../../api/admin.js";

const CATALOG_KIND_OPTIONS = [
  { key: "porton", label: "Portones" },
  { key: "ipanel", label: "Ipanel" },
  { key: "otros", label: "Otros" },
];

function norm(x) { return (x || "").toString().trim().toLowerCase(); }
function visibilityModeFromFlags(disableForVendedor, disableForDistribuidor) {
  if (disableForVendedor && disableForDistribuidor) return "both";
  if (disableForVendedor) return "vendedor";
  if (disableForDistribuidor) return "distribuidor";
  return "none";
}
function visibilityModeFromProduct(product) {
  return visibilityModeFromFlags(!!product?.disable_for_vendedor, !!product?.disable_for_distribuidor);
}
function visibilityModeFromTypeEntry(entry) {
  return visibilityModeFromFlags(!!entry?.disable_for_vendedor, !!entry?.disable_for_distribuidor);
}
function parseIdList(value) {
  return String(value || "")
    .split(/[;,\s]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0);
}
function stringifyIdList(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}
function newDependencyRule(index = 1) {
  return { id: `dep_${Date.now()}_${index}`, name: "", active: true, parent_section_id: "", required_product_ids_text: "", match_mode: "any", child_section_ids_text: "", sort_order: index };
}
function newSystemRule(index = 1) {
  return { id: `sys_${Date.now()}_${index}`, name: "", active: true, required_product_ids_text: "", match_mode: "all", derived_porton_type: "", sort_order: index };
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState("tags");
  const [catalogKind, setCatalogKind] = useState("porton");
  const [toleranceAreaM2, setToleranceAreaM2] = useState("0");
  const [doorFormula, setDoorFormula] = useState("precio_ipanel + precio_venta_marco");
  const [savingTolerance, setSavingTolerance] = useState(false);
  const [savingDoorFormula, setSavingDoorFormula] = useState(false);
  const [savingDependencies, setSavingDependencies] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionPos, setNewSectionPos] = useState("100");
  const [newSectionUseSurface, setNewSectionUseSurface] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [fixedValueToInsert, setFixedValueToInsert] = useState("");
  const [dependencyRules, setDependencyRules] = useState([]);
  const [systemRules, setSystemRules] = useState([]);

  const enabled = !!user?.is_enc_comercial || !!user?.is_superuser;
  const catalogQ = useQuery({ queryKey: ["adminCatalog", catalogKind], queryFn: () => adminGetCatalog(catalogKind), enabled });
  const quotesQ = useQuery({ queryKey: ["adminQuotes", catalogKind], queryFn: () => adminGetQuotes(catalogKind, 200), enabled: enabled && tab === "data" });
  const finalSettingsQ = useQuery({ queryKey: ["adminFinalSettings"], queryFn: adminGetFinalSettings, enabled });
  const doorQuoteSettingsQ = useQuery({ queryKey: ["adminDoorQuoteSettings"], queryFn: adminGetDoorQuoteSettings, enabled });
  const technicalRulesQ = useQuery({ queryKey: ["adminTechnicalMeasurementRulesForDashboard"], queryFn: adminGetTechnicalMeasurementRules, enabled });

  useEffect(() => { if (finalSettingsQ.data) setToleranceAreaM2(String(finalSettingsQ.data.tolerance_area_m2 ?? 0)); }, [finalSettingsQ.data]);
  useEffect(() => { if (doorQuoteSettingsQ.data) setDoorFormula(String(doorQuoteSettingsQ.data.formula || "precio_ipanel + precio_venta_marco")); }, [doorQuoteSettingsQ.data]);
  useEffect(() => {
    if (!technicalRulesQ.data) return;
    setDependencyRules((technicalRulesQ.data.section_dependency_rules || []).map((rule, index) => ({
      id: String(rule.id || `dep_${index + 1}`),
      name: String(rule.name || ""),
      active: rule.active !== false,
      parent_section_id: Number(rule.parent_section_id || 0) || "",
      required_product_ids_text: stringifyIdList(rule.required_product_ids),
      match_mode: String(rule.match_mode || "any"),
      child_section_ids_text: stringifyIdList(rule.child_section_ids),
      sort_order: Number(rule.sort_order || index + 1) || index + 1,
    })));
    setSystemRules((technicalRulesQ.data.system_derivation_rules || []).map((rule, index) => ({
      id: String(rule.id || `sys_${index + 1}`),
      name: String(rule.name || ""),
      active: rule.active !== false,
      required_product_ids_text: stringifyIdList(rule.required_product_ids),
      match_mode: String(rule.match_mode || "all"),
      derived_porton_type: String(rule.derived_porton_type || ""),
      sort_order: Number(rule.sort_order || index + 1) || index + 1,
    })));
  }, [technicalRulesQ.data]);

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

  if (!enabled) return <div className="container"><div className="spacer" /><div className="card"><h2 style={{ marginTop: 0 }}>Dashboard</h2><div className="muted">No tenés permisos.</div></div></div>;

  const onRefresh = async () => { await adminRefreshCatalog(); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Catálogo actualizado."); };
  const onCreateSection = async () => { await adminCreateSection(catalogKind, { name: newSectionName, position: Number(newSectionPos || 100), use_surface_qty: newSectionUseSurface }); setNewSectionName(""); setNewSectionUseSurface(false); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Sección creada."); };
  const onSaveTolerance = async () => { setSavingTolerance(true); try { const saved = await adminSaveFinalSettings({ tolerance_area_m2: toleranceAreaM2 }); setToleranceAreaM2(String(saved.tolerance_area_m2 ?? 0)); qc.invalidateQueries({ queryKey: ["adminFinalSettings"] }); alert("Tolerancia guardada correctamente."); } finally { setSavingTolerance(false); } };
  function appendFormulaToken(token) { const next = String(token || "").trim(); if (!next) return; setDoorFormula((prev) => { const left = String(prev || ""); return left.trim() ? `${left} ${next}` : next; }); }
  const onSaveDoorFormula = async () => { setSavingDoorFormula(true); try { const saved = await adminSaveDoorQuoteSettings({ formula: doorFormula }); setDoorFormula(String(saved.formula || "precio_ipanel + precio_venta_marco")); qc.invalidateQueries({ queryKey: ["adminDoorQuoteSettings"] }); alert("Fórmula de puerta guardada correctamente."); } finally { setSavingDoorFormula(false); } };
  const onSaveDependencies = async () => {
    setSavingDependencies(true);
    try {
      await adminSaveTechnicalMeasurementRules({
        section_dependency_rules: dependencyRules.map((rule, index) => ({
          id: rule.id || `dep_${index + 1}`,
          name: String(rule.name || "").trim(),
          active: rule.active !== false,
          parent_section_id: Number(rule.parent_section_id || 0) || null,
          required_product_ids: parseIdList(rule.required_product_ids_text),
          match_mode: String(rule.match_mode || "any"),
          child_section_ids: parseIdList(rule.child_section_ids_text),
          sort_order: index + 1,
        })).filter((rule) => rule.parent_section_id && rule.required_product_ids.length && rule.child_section_ids.length),
        system_derivation_rules: systemRules.map((rule, index) => ({
          id: rule.id || `sys_${index + 1}`,
          name: String(rule.name || "").trim(),
          active: rule.active !== false,
          required_product_ids: parseIdList(rule.required_product_ids_text),
          match_mode: String(rule.match_mode || "all"),
          derived_porton_type: String(rule.derived_porton_type || "").trim(),
          sort_order: index + 1,
        })).filter((rule) => rule.required_product_ids.length && rule.derived_porton_type),
      });
      qc.invalidateQueries({ queryKey: ["adminTechnicalMeasurementRulesForDashboard"] });
      alert("Dependencias guardadas.");
    } finally {
      setSavingDependencies(false);
    }
  };

  return (
    <div className="container">
      <div className="spacer" />
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div><h2 style={{ margin: 0 }}>Dashboard del Presupuestador</h2><div className="muted">Configuración de catálogo, dependencias y cotización final</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{CATALOG_KIND_OPTIONS.map((option) => (<Button key={option.key} variant={catalogKind === option.key ? "primary" : "ghost"} onClick={() => setCatalogKind(option.key)}>{option.label}</Button>))}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button variant="ghost" onClick={onRefresh} disabled={catalogQ.isLoading}>Refrescar catálogo</Button></div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Tolerancia comercial para cotización final</h3>
        <div className="muted" style={{ marginBottom: 10 }}>La tolerancia se mide en <b>m²</b>.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}><div style={{ minWidth: 220 }}><div className="muted">Tolerancia m²</div><Input value={toleranceAreaM2} onChange={setToleranceAreaM2} placeholder="0" style={{ width: "100%" }} /></div><Button variant="primary" onClick={onSaveTolerance} disabled={savingTolerance || finalSettingsQ.isLoading}>{savingTolerance ? "Guardando..." : "Guardar tolerancia"}</Button></div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h3 style={{ marginTop: 0 }}>Fórmula comercial de puerta</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <Button variant="ghost" onClick={() => appendFormulaToken("precio_ipanel")}>+ precio_ipanel</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("precio_compra")}>+ precio_compra</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("precio_venta")}>+ precio_venta</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("(")}>(</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken(")")}>)</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("+")}>+</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("-")}>-</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("*")}>*</Button>
          <Button variant="ghost" onClick={() => appendFormulaToken("/")}>/</Button>
          <Input value={fixedValueToInsert} onChange={setFixedValueToInsert} placeholder="Valor fijo" style={{ width: 140 }} />
          <Button variant="ghost" onClick={() => { appendFormulaToken(fixedValueToInsert); setFixedValueToInsert(""); }}>+ número</Button>
        </div>
        <textarea value={doorFormula} readOnly style={{ width: "100%", minHeight: 72, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#f6f7f8", color: "#111827", cursor: "default" }} />
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}><Button variant="primary" onClick={onSaveDoorFormula} disabled={savingDoorFormula || doorQuoteSettingsQ.isLoading}>{savingDoorFormula ? "Guardando..." : "Guardar fórmula"}</Button><Button variant="ghost" onClick={() => setDoorFormula("precio_ipanel + precio_venta_marco")}>Usar fórmula base</Button></div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className={tab === "tags" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("tags")}>Etiquetas → Secciones</button>
        <button className={tab === "aliases" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("aliases")}>Alias y visibilidad</button>
        <button className={tab === "types" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("types")}>Tipos → Secciones</button>
        <button className={tab === "medicion" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("medicion")}>Dependencias</button>
        <button className={tab === "data" ? "navlink active" : "navlink"} type="button" onClick={() => setTab("data")}>Data</button>
      </div>

      <div className="spacer" />
      {catalogQ.isLoading && <div className="muted">Cargando…</div>}
      {catalogQ.isError && <div style={{ color: "#d93025" }}>{catalogQ.error.message}</div>}
      {!catalogQ.isLoading && !catalogQ.isError && (
        <>
          {tab === "tags" && <TagsTab catalogKind={catalogKind} sections={sections} tags={tags} newSectionName={newSectionName} setNewSectionName={setNewSectionName} newSectionPos={newSectionPos} setNewSectionPos={setNewSectionPos} newSectionUseSurface={newSectionUseSurface} setNewSectionUseSurface={setNewSectionUseSurface} onCreateSection={onCreateSection} qc={qc} />}
          {tab === "aliases" && <AliasesTab catalogKind={catalogKind} filteredProductsByQuery={filteredProductsByQuery} productQuery={productQuery} setProductQuery={setProductQuery} qc={qc} />}
          {tab === "types" && <TypesTab catalogKind={catalogKind} sections={sections} typeSections={typeSections} typeVisibility={typeVisibility} qc={qc} />}
          {tab === "medicion" && <DependenciesTab sections={sections} dependencyRules={dependencyRules} setDependencyRules={setDependencyRules} systemRules={systemRules} setSystemRules={setSystemRules} saving={savingDependencies} onSave={onSaveDependencies} />}
          {tab === "data" && <DataTab sections={sections} tags={tags} sectionFilter={sectionFilter} setSectionFilter={setSectionFilter} tagFilter={tagFilter} setTagFilter={setTagFilter} filteredProductsForData={filteredProductsForData} filteredQuotes={filteredQuotes} />}
        </>
      )}
    </div>
  );
}

function TagsTab({ catalogKind, sections, tags, newSectionName, setNewSectionName, newSectionPos, setNewSectionPos, newSectionUseSurface, setNewSectionUseSurface, onCreateSection, qc }) {
  return <div className="row"><div className="card" style={{ flex: 1, minWidth: 320 }}><h3 style={{ marginTop: 0 }}>Secciones</h3><div className="spacer" /><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Input value={newSectionName} onChange={setNewSectionName} placeholder="Nueva sección…" style={{ flex: 1, minWidth: 180 }} /><Input value={newSectionPos} onChange={setNewSectionPos} placeholder="Posición" style={{ width: 110 }} /><label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}><input type="checkbox" checked={newSectionUseSurface} onChange={(e) => setNewSectionUseSurface(e.target.checked)} /><span className="muted">Cantidad = superficie</span></label><Button variant="primary" disabled={!newSectionName.trim()} onClick={onCreateSection}>Crear</Button></div><div className="spacer" /><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{sections.map((s) => (<div key={s.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div><div style={{ fontWeight: 800 }}>{s.name}</div><div className="muted">Posición: {s.position} · ID: {s.id}</div></div><Button variant="ghost" onClick={async () => { if (!window.confirm(`Borrar sección "${s.name}"?`)) return; await adminDeleteSection(catalogKind, s.id); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Sección borrada."); }}>🗑</Button></div><div className="spacer" /><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={!!s.use_surface_qty} onChange={async (e) => { await adminUpdateSection(catalogKind, s.id, { use_surface_qty: e.target.checked }); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Sección actualizada."); }} /><span className="muted">Tomar cantidad por superficie siempre</span></label></div>))}</div></div><div className="card" style={{ flex: 2, minWidth: 520 }}><h3 style={{ marginTop: 0 }}>Asignar sección por etiqueta</h3><div className="spacer" /><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 560, overflow: "auto", paddingRight: 6 }}>{tags.map((t) => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}><div style={{ fontWeight: 700 }}>{t.name}</div><select value={t.section_id || ""} onChange={async (e) => { const v = e.target.value ? Number(e.target.value) : null; await adminSetTagSection(catalogKind, t.id, v); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Etiqueta actualizada."); }} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}><option value="">(sin sección)</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name} · ID {s.id}</option>)}</select></div>))}</div></div></div>;
}
function AliasesTab({ catalogKind, filteredProductsByQuery, productQuery, setProductQuery, qc }) {
  return <div className="row"><div className="card" style={{ flex: 1, minWidth: 320 }}><h3 style={{ marginTop: 0 }}>Alias y visibilidad</h3><div className="spacer" /><Input value={productQuery} onChange={setProductQuery} placeholder="Buscar producto…" style={{ width: "100%" }} /></div><div className="card" style={{ flex: 2, minWidth: 520 }}><h3 style={{ marginTop: 0 }}>Productos</h3><div className="spacer" /><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>{filteredProductsByQuery.slice(0, 400).map((p) => (<AliasRow key={p.id} product={p} onSave={async ({ alias, visibilityMode }) => { await adminSetProductAlias(catalogKind, p.id, alias); await adminSetProductVisibility(catalogKind, p.id, { disable_for_vendedor: visibilityMode === "vendedor" || visibilityMode === "both", disable_for_distribuidor: visibilityMode === "distribuidor" || visibilityMode === "both" }); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Producto actualizado."); }} />))}</div></div></div>;
}
function TypesTab({ catalogKind, sections, typeSections, typeVisibility, qc }) {
  return <div className="row"><TypesSectionsCard catalogKind={catalogKind} sections={sections} typeSections={typeSections} typeVisibility={typeVisibility} onSave={async (typeKey, sectionIds, visibilityMode) => { await adminSetTypeSections(catalogKind, typeKey, sectionIds); await adminSetTypeVisibility(catalogKind, typeKey, { disable_for_vendedor: visibilityMode === "vendedor" || visibilityMode === "both", disable_for_distribuidor: visibilityMode === "distribuidor" || visibilityMode === "both" }); await adminRefreshCatalog(); qc.invalidateQueries({ queryKey: ["adminCatalog", catalogKind] }); alert("Configuración del tipo guardada."); }} /></div>;
}
function DependenciesTab({ sections, dependencyRules, setDependencyRules, systemRules, setSystemRules, saving, onSave }) {
  function updateDependency(index, patch) {
    setDependencyRules((prev) => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function updateSystem(index, patch) {
    setSystemRules((prev) => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  return (
    <div className="row">
      <div className="card" style={{ flex: 1, minWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Dependencias entre secciones</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Configurá qué sección se habilita según los productos elegidos en una sección anterior. Las dependencias se evalúan por sección origen y pueden encadenarse.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dependencyRules.map((rule, index) => {
            const selectedChildIds = new Set(parseIdList(rule.child_section_ids_text));
            return (
              <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <Input value={rule.name || ""} onChange={(v) => updateDependency(index, { name: v })} placeholder="Nombre de la dependencia" style={{ width: "100%", marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select value={rule.parent_section_id || ""} onChange={(e) => updateDependency(index, { parent_section_id: e.target.value ? Number(e.target.value) : "" })} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="">Sección origen</option>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.name} · ID {section.id}</option>)}
                  </select>
                  <select value={rule.match_mode || "any"} onChange={(e) => updateDependency(index, { match_mode: e.target.value })} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="any">Cumple con cualquier producto</option>
                    <option value="all">Cumple con todos los productos</option>
                  </select>
                </div>
                <div className="spacer" />
                <Input value={rule.required_product_ids_text || ""} onChange={(v) => updateDependency(index, { required_product_ids_text: v })} placeholder="IDs de productos disparadores (separados con coma)" style={{ width: "100%" }} />
                <div className="spacer" />
                <div className="muted" style={{ marginBottom: 6 }}>Secciones a habilitar</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8, border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  {sections.map((section) => {
                    const sid = Number(section.id);
                    const checked = selectedChildIds.has(sid);
                    return (
                      <label key={sid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selectedChildIds);
                            if (e.target.checked) next.add(sid);
                            else next.delete(sid);
                            updateDependency(index, { child_section_ids_text: stringifyIdList([...next].sort((a, b) => a - b)) });
                          }}
                        />
                        <span>{section.name} · ID {section.id}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>IDs seleccionados: {rule.child_section_ids_text || "—"}</div>
                <div className="spacer" />
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={rule.active !== false} onChange={(e) => updateDependency(index, { active: e.target.checked })} />
                  <span className="muted">Activa</span>
                </label>
              </div>
            );
          })}
        </div>
        <div className="spacer" />
        <Button variant="ghost" onClick={() => setDependencyRules((prev) => [...prev, newDependencyRule(prev.length + 1)])}>+ Agregar dependencia</Button>
      </div>

      <div className="card" style={{ flex: 1, minWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Derivación del sistema</h3>
        <div className="muted" style={{ marginBottom: 10 }}>Define qué combinación de productos repone la propiedad interna “Tipo / Sistema”. Los IDs de productos se cargan separados con coma.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {systemRules.map((rule, index) => (
            <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
              <Input value={rule.name || ""} onChange={(v) => updateSystem(index, { name: v })} placeholder="Nombre de la regla" style={{ width: "100%", marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={rule.match_mode || "all"} onChange={(e) => updateSystem(index, { match_mode: e.target.value })} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                  <option value="all">Requiere todos los productos</option>
                  <option value="any">Requiere cualquier producto</option>
                </select>
                <select value={rule.derived_porton_type || ""} onChange={(e) => updateSystem(index, { derived_porton_type: e.target.value })} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd" }}>
                  <option value="">Sistema derivado…</option>
                  {PORTON_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </div>
              <div className="spacer" />
              <Input value={rule.required_product_ids_text || ""} onChange={(v) => updateSystem(index, { required_product_ids_text: v })} placeholder="IDs de productos que definen el sistema (coma)" style={{ width: "100%" }} />
              <div className="spacer" />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={rule.active !== false} onChange={(e) => updateSystem(index, { active: e.target.checked })} />
                <span className="muted">Activa</span>
              </label>
            </div>
          ))}
        </div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={() => setSystemRules((prev) => [...prev, newSystemRule(prev.length + 1)])}>+ Agregar derivación</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>{saving ? "Guardando..." : "Guardar dependencias"}</Button>
        </div>
      </div>
    </div>
  );
}
function DataTab({ sections, tags, sectionFilter, setSectionFilter, tagFilter, setTagFilter, filteredProductsForData, filteredQuotes }) {
  return <div className="row"><div className="card" style={{ flex: 1, minWidth: 320 }}><h3 style={{ marginTop: 0 }}>Filtros</h3><div className="muted">Sección</div><select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="all">(todas)</option>{sections.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</select><div className="spacer" /><div className="muted">Etiqueta</div><select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="all">(todas)</option>{tags.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}</select></div><div className="card" style={{ flex: 1, minWidth: 420 }}><h3 style={{ marginTop: 0 }}>Productos filtrados</h3><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>{filteredProductsForData.map((p) => (<div key={p.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}><div style={{ fontWeight: 800 }}>{p.display_name || p.name}</div><div className="muted" style={{ fontSize: 12 }}>ID: {p.id} {p.code ? `· ${p.code}` : ""}</div></div>))}</div></div><div className="card" style={{ flex: 1, minWidth: 420 }}><h3 style={{ marginTop: 0 }}>Últimas cotizaciones</h3><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>{filteredQuotes.map((q) => (<div key={q.id} style={{ border: "1px solid #eee", padding: 10, borderRadius: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontWeight: 800 }}>{q.odoo_sale_order_name || q.final_sale_order_name || `#${String(q.id).slice(0, 8)}`}</div><div className="muted">{q.final_status || q.status}</div></div></div>))}</div></div></div>;
}
function TypesSectionsCard({ catalogKind, sections, typeSections, typeVisibility, onSave }) {
  const [selectedType, setSelectedType] = useState(PORTON_TYPES?.[0]?.key || "");
  const [selectedSectionIds, setSelectedSectionIds] = useState([]);
  const [visibilityMode, setVisibilityMode] = useState("none");
  const canUse = (catalogKind || "porton") === "porton";
  useEffect(() => {
    const arr = canUse && selectedType ? (typeSections?.[selectedType] || []) : [];
    setSelectedSectionIds((arr || []).map((x) => Number(x)));
    setVisibilityMode(visibilityModeFromTypeEntry(typeVisibility?.[selectedType] || {}));
  }, [selectedType, catalogKind, canUse, typeSections, typeVisibility]);
  if (!canUse) return <div className="card" style={{ flex: 1 }}><h3 style={{ marginTop: 0 }}>Tipos → Secciones</h3><div className="muted">Esto aplica solo a Portones.</div></div>;
  const sectionSet = new Set(selectedSectionIds.map((x) => Number(x)));
  return <><div className="card" style={{ flex: 1, minWidth: 320 }}><h3 style={{ marginTop: 0 }}>Tipos / Sistemas</h3><div className="spacer" /><select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}>{PORTON_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select><div className="spacer" /><div className="muted">Visibilidad del tipo</div><select value={visibilityMode} onChange={(e) => setVisibilityMode(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="none">Habilitado para todos</option><option value="vendedor">Oculto solo para vendedores</option><option value="distribuidor">Oculto solo para distribuidores</option><option value="both">Oculto para ambos</option></select><div className="spacer" /><Button variant="primary" onClick={async () => onSave(selectedType, selectedSectionIds, visibilityMode)}>Guardar configuración</Button></div><div className="card" style={{ flex: 2, minWidth: 520 }}><h3 style={{ marginTop: 0 }}>Secciones visibles</h3><div className="spacer" /><div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 620, overflow: "auto", paddingRight: 6 }}>{sections.map((s) => { const sid = Number(s.id); const checked = sectionSet.has(sid); return <label key={sid} style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #eee", padding: 10, borderRadius: 10 }}><input type="checkbox" checked={checked} onChange={(e) => { const next = new Set(sectionSet); if (e.target.checked) next.add(sid); else next.delete(sid); setSelectedSectionIds([...next]); }} /><div style={{ fontWeight: 700 }}>{s.name}</div><div className="muted" style={{ marginLeft: "auto" }}>Pos: {s.position}</div></label>; })}</div></div></>;
}
function AliasRow({ product, onSave }) {
  const [value, setValue] = useState(product.alias || "");
  const [visibilityMode, setVisibilityMode] = useState(visibilityModeFromProduct(product));
  const [saving, setSaving] = useState(false);
  const changed = value.trim() !== (product.alias || "") || visibilityMode !== visibilityModeFromProduct(product);
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 240px 220px 90px", gap: 10, border: "1px solid #eee", padding: 10, borderRadius: 10, alignItems: "center" }}><div style={{ minWidth: 0 }}><button type="button" onClick={() => window.alert(product.name || product.display_name || "")} style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: 0, padding: 0, background: "transparent", cursor: "pointer", textAlign: "left", width: "100%" }} title="Ver nombre completo de Odoo">{product.name}</button><div className="muted" style={{ fontSize: 12 }}>ID: {product.id}{product.code ? ` · ${product.code}` : ""}</div></div><Input value={value} onChange={setValue} placeholder="Nombre visible…" style={{ width: "100%" }} /><select value={visibilityMode} onChange={(e) => setVisibilityMode(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: "100%" }}><option value="none">Habilitado para todos</option><option value="vendedor">Deshabilitado solo para vendedores</option><option value="distribuidor">Deshabilitado solo para distribuidores</option><option value="both">Deshabilitado para ambos</option></select><Button variant="primary" disabled={!changed || saving} onClick={async () => { setSaving(true); try { await onSave({ alias: value, visibilityMode }); } finally { setSaving(false); } }}>{saving ? "…" : "Guardar"}</Button></div>;
}
