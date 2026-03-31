import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  adminGetTechnicalMeasurementRules,
  adminSaveTechnicalMeasurementRules,
  adminGetTechnicalMeasurementFieldDefinitions,
  adminSaveTechnicalMeasurementFieldDefinitions,
} from "../../api/admin.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import {
  TECHNICAL_RULE_OPERATORS,
  TECHNICAL_RULE_ACTIONS,
  VALUE_SOURCE_TYPE_OPTIONS,
  BUDGET_FIELD_OPTIONS,
  EDITABLE_BY_OPTIONS,
  ODOO_BINDING_TYPE_OPTIONS,
  BUDGET_PRODUCT_VALUE_OPTIONS,
  BUDGET_MULTIPLE_MODE_OPTIONS,
  mergeMeasurementFields,
  parseOptions,
} from "../../domain/measurement/technicalMeasurementRuleFields.js";

const SECTION_OPTIONS = [
  { value: "datos_generales", label: "Datos generales" },
  { value: "esquema_medidas", label: "Esquema (medidas)" },
  { value: "revestimiento", label: "Revestimiento" },
  { value: "puerta_estructura", label: "Puerta / estructura" },
  { value: "rebajes_suelo", label: "Rebajes / suelo" },
  { value: "observaciones", label: "Observaciones" },
  { value: "otros", label: "Otros / bloque aparte" },
];

function productLabel(product) {
  return `${product.display_name || product.alias || product.name}${product.code ? ` · ${product.code}` : ""}`;
}
function newField(index = 1) {
  return {
    key: "",
    label: "",
    type: "text",
    section: "otros",
    optionsText: "",
    active: true,
    required: false,
    sort_order: index,
    value_source_type: "manual",
    value_source_path: "",
    fixed_value: "",
    budget_section_id: "",
    budget_section_name: "",
    budget_product_value_key: "display_name",
    budget_multiple_mode: "first",
    editable_by: "both",
    odoo_binding_type: "none",
    odoo_product_id: "",
    odoo_product_label: "",
  };
}
function newRule(index = 1) {
  return {
    id: `rule_${Date.now()}_${index}`,
    name: "",
    active: true,
    source_key: "",
    operator: "=",
    compare_value: "",
    action_type: "set_value",
    target_field: "",
    target_value: "",
    target_options_text: "",
    apply_to_odoo: false,
    product_id: "",
    product_label: "",
    sort_order: index,
  };
}
function normalizeFieldDraft(field, index) {
  return {
    key: String(field?.key || "").trim(),
    label: String(field?.label || "").trim(),
    type: String(field?.type || "text").trim().toLowerCase(),
    section: String(field?.section || "otros").trim().toLowerCase(),
    optionsText: Array.isArray(field?.options)
      ? field.options.map((item) => item?.value || item).filter(Boolean).join(", ")
      : String(field?.optionsText || "").trim(),
    active: field?.active !== false,
    required: field?.required === true,
    sort_order: Number(field?.sort_order || index + 1) || (index + 1),
    value_source_type: String(field?.value_source_type || "manual"),
    value_source_path: String(field?.value_source_path || "").trim(),
    fixed_value: field?.fixed_value ?? "",
    budget_section_id: Number(field?.budget_section_id || 0) || "",
    budget_section_name: String(field?.budget_section_name || "").trim(),
    budget_product_value_key: String(field?.budget_product_value_key || "display_name"),
    budget_multiple_mode: String(field?.budget_multiple_mode || "first"),
    editable_by: String(field?.editable_by || "both"),
    odoo_binding_type: String(field?.odoo_binding_type || "none"),
    odoo_product_id: Number(field?.odoo_product_id || 0) || "",
    odoo_product_label: String(field?.odoo_product_label || "").trim(),
  };
}
function normalizeRuleDraft(rule, index) {
  return {
    id: String(rule?.id || `rule_${index + 1}`),
    name: String(rule?.name || "").trim(),
    active: rule?.active !== false,
    source_key: String(rule?.source_key || "").trim(),
    operator: String(rule?.operator || "="),
    compare_value: rule?.compare_value ?? "",
    action_type: String(rule?.action_type || "set_value"),
    target_field: String(rule?.target_field || "").trim(),
    target_value: rule?.target_value ?? "",
    target_options_text: Array.isArray(rule?.target_options) ? rule.target_options.join(", ") : String(rule?.target_options || "").trim(),
    apply_to_odoo: rule?.apply_to_odoo === true,
    product_id: Number(rule?.product_id || 0) || "",
    product_label: String(rule?.product_label || "").trim(),
    sort_order: Number(rule?.sort_order || index + 1) || (index + 1),
  };
}
function updateFieldAt(setFieldDraft, index, patch) {
  setFieldDraft((prev) => {
    const next = [...(prev.fields || [])];
    next[index] = { ...next[index], ...patch };
    return { fields: next };
  });
}
function updateRuleAt(setRuleDraft, index, patch) {
  setRuleDraft((prev) => {
    const next = [...(prev.rules || [])];
    next[index] = { ...next[index], ...patch };
    return { rules: next };
  });
}

export default function SuperuserMeasurementRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [savingFields, setSavingFields] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({ fields: [] });
  const [ruleDraft, setRuleDraft] = useState({ rules: [] });

  const fieldsQ = useQuery({ queryKey: ["technicalMeasurementFields"], queryFn: adminGetTechnicalMeasurementFieldDefinitions, enabled: !!user?.is_superuser });
  const rulesQ = useQuery({ queryKey: ["technicalMeasurementRules"], queryFn: adminGetTechnicalMeasurementRules, enabled: !!user?.is_superuser });
  const catalogQ = useQuery({ queryKey: ["catalogBootstrapForMeasurementRules"], queryFn: () => getCatalogBootstrap("porton"), enabled: !!user?.is_superuser });

  useEffect(() => {
    if (!fieldsQ.data) return;
    setFieldDraft({ fields: (fieldsQ.data.fields || []).map((field, index) => normalizeFieldDraft(field, index)) });
  }, [fieldsQ.data]);

  useEffect(() => {
    if (!rulesQ.data) return;
    setRuleDraft({ rules: (rulesQ.data.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)) });
  }, [rulesQ.data]);

  const products = useMemo(() => Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [], [catalogQ.data]);
  const budgetSections = useMemo(() => {
    const arr = Array.isArray(catalogQ.data?.sections) ? catalogQ.data.sections.slice() : [];
    return arr.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || "").localeCompare(String(b.name || ""), "es"));
  }, [catalogQ.data]);

  const allFields = useMemo(() => {
    const dynamicFields = (fieldDraft.fields || []).map((field, index) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      section: field.section,
      options: parseOptions(field.optionsText),
      active: field.active !== false,
      required: field.required === true,
      sort_order: field.sort_order || index + 1,
      value_source_type: field.value_source_type,
      value_source_path: field.value_source_path,
      fixed_value: field.fixed_value,
      budget_section_id: field.budget_section_id,
      budget_section_name: field.budget_section_name,
      budget_product_value_key: field.budget_product_value_key,
      budget_multiple_mode: field.budget_multiple_mode,
      editable_by: field.editable_by,
      odoo_binding_type: field.odoo_binding_type,
      odoo_product_id: field.odoo_product_id,
      odoo_product_label: field.odoo_product_label,
    }));
    return mergeMeasurementFields(dynamicFields);
  }, [fieldDraft.fields]);

  const targetFieldOptions = allFields.filter((item) => !["surface_m2", "budget_width_m", "budget_height_m"].includes(item.key));
  const fields = Array.isArray(fieldDraft?.fields) ? fieldDraft.fields : [];
  const rules = Array.isArray(ruleDraft?.rules) ? ruleDraft.rules : [];

  if (!user?.is_superuser) {
    return <div className="container"><div className="card"><h2 style={{ marginTop: 0 }}>Reglas técnicas</h2><div className="muted">Solo disponible para superusuario.</div></div></div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Campos dinámicos de medición</h2>
        <div className="muted">Ahora cada campo puede tomar el valor directamente desde lo que el vendedor/distribuidor presupuestó, incluso por sección del catálogo.</div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setFieldDraft((prev) => ({ fields: [...(prev.fields || []), newField((prev.fields || []).length + 1)] }))}>+ Agregar campo</Button>
          <Button
            variant="primary"
            disabled={savingFields}
            onClick={async () => {
              setSavingFields(true);
              try {
                const payload = {
                  fields: fields.map((field, index) => ({
                    key: String(field.key || "").trim(),
                    label: String(field.label || "").trim(),
                    type: String(field.type || "text").trim().toLowerCase(),
                    section: String(field.section || "otros").trim().toLowerCase(),
                    options: parseOptions(field.optionsText),
                    active: field.active !== false,
                    required: field.required === true,
                    sort_order: index + 1,
                    value_source_type: String(field.value_source_type || "manual"),
                    value_source_path: String(field.value_source_path || "").trim(),
                    fixed_value: field.fixed_value ?? "",
                    budget_section_id: Number(field.budget_section_id || 0) || null,
                    budget_section_name: String(field.budget_section_name || "").trim(),
                    budget_product_value_key: String(field.budget_product_value_key || "display_name"),
                    budget_multiple_mode: String(field.budget_multiple_mode || "first"),
                    editable_by: String(field.editable_by || "both"),
                    odoo_binding_type: String(field.odoo_binding_type || "none"),
                    odoo_product_id: Number(field.odoo_product_id || 0) || null,
                    odoo_product_label: String(field.odoo_product_label || "").trim(),
                  })).filter((field) => field.key && field.label),
                };
                const saved = await adminSaveTechnicalMeasurementFieldDefinitions(payload);
                setFieldDraft({ fields: (saved.fields || []).map((field, index) => normalizeFieldDraft(field, index)) });
                window.alert("Campos guardados.");
              } finally {
                setSavingFields(false);
              }
            }}
          >
            {savingFields ? "Guardando..." : "Guardar campos"}
          </Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fields.map((field, index) => (
            <div key={`${field.key || "field"}-${index}`} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Campo #{index + 1}</div>
                <Button variant="ghost" onClick={() => setFieldDraft((prev) => ({ fields: (prev.fields || []).filter((_, i) => i !== index) }))}>✕</Button>
              </div>
              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div><div className="muted" style={{ marginBottom: 6 }}>Clave interna</div><Input value={field.key || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { key: v.replace(/\s+/g, "_").toLowerCase() })} placeholder="automatizacion" style={{ width: "100%" }} /></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Etiqueta</div><Input value={field.label || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { label: v })} placeholder="Automatización" style={{ width: "100%" }} /></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Tipo</div><select value={field.type || "text"} onChange={(e) => updateFieldAt(setFieldDraft, index, { type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="text">Texto</option><option value="number">Número</option><option value="boolean">Sí / No</option><option value="enum">Lista cerrada</option></select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Sector en planilla</div><select value={field.section || "otros"} onChange={(e) => updateFieldAt(setFieldDraft, index, { section: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{SECTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Opciones (coma)</div><Input value={field.optionsText || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { optionsText: v })} placeholder="si, no" style={{ width: "100%" }} disabled={field.type !== "enum"} /></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Editable por</div><select value={field.editable_by || "both"} onChange={(e) => updateFieldAt(setFieldDraft, index, { editable_by: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{EDITABLE_BY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
              </div>
              <div className="spacer" />
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 12, background: "#fcfcfc" }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Origen del valor</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div><div className="muted" style={{ marginBottom: 6 }}>Cómo se completa</div><select value={field.value_source_type || "manual"} onChange={(e) => updateFieldAt(setFieldDraft, index, { value_source_type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{VALUE_SOURCE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                  {field.value_source_type === "fixed" && <div><div className="muted" style={{ marginBottom: 6 }}>Valor fijo</div><Input value={field.fixed_value ?? ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { fixed_value: v })} placeholder="Automático" style={{ width: "100%" }} /></div>}
                  {field.value_source_type === "budget_field" && <div style={{ gridColumn: "1 / -1" }}><div className="muted" style={{ marginBottom: 6 }}>Dato del presupuesto</div><select value={field.value_source_path || ""} onChange={(e) => updateFieldAt(setFieldDraft, index, { value_source_path: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">Seleccione dato…</option>{BUDGET_FIELD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>}
                  {field.value_source_type === "budget_section_product" && <>
                    <div><div className="muted" style={{ marginBottom: 6 }}>Sección del presupuesto</div><select value={field.budget_section_id || ""} onChange={(e) => { const section = budgetSections.find((item) => Number(item.id) === Number(e.target.value)); updateFieldAt(setFieldDraft, index, { budget_section_id: e.target.value ? Number(e.target.value) : "", budget_section_name: section ? String(section.name || "") : "" }); }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">Seleccione sección…</option>{budgetSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></div>
                    <div><div className="muted" style={{ marginBottom: 6 }}>Qué copiar</div><select value={field.budget_product_value_key || "display_name"} onChange={(e) => updateFieldAt(setFieldDraft, index, { budget_product_value_key: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{BUDGET_PRODUCT_VALUE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                    <div><div className="muted" style={{ marginBottom: 6 }}>Si hay varios productos</div><select value={field.budget_multiple_mode || "first"} onChange={(e) => updateFieldAt(setFieldDraft, index, { budget_multiple_mode: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{BUDGET_MULTIPLE_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                  </>}
                </div>
              </div>
              <div className="spacer" />
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 12, background: "#fcfcfc" }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Salida a Odoo</div><div className="muted" style={{ marginBottom: 10 }}>Lo más común es repetir el mismo producto que el vendedor/distribuidor ya presupuestó en la sección elegida.</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div><div className="muted" style={{ marginBottom: 6 }}>Acción</div><select value={field.odoo_binding_type || "none"} onChange={(e) => updateFieldAt(setFieldDraft, index, { odoo_binding_type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{ODOO_BINDING_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
                  <div><div className="muted" style={{ marginBottom: 6 }}>Producto Odoo</div><select value={field.odoo_product_id || ""} onChange={(e) => { const product = products.find((item) => Number(item.id) === Number(e.target.value)); updateFieldAt(setFieldDraft, index, { odoo_product_id: e.target.value ? Number(e.target.value) : "", odoo_product_label: product ? productLabel(product) : "" }); }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} disabled={field.odoo_binding_type !== "custom_product"}><option value="">(sin producto)</option>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></div>
                </div>
              </div>
              <div className="spacer" />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={field.required === true} onChange={(e) => updateFieldAt(setFieldDraft, index, { required: e.target.checked })} /><span className="muted">Obligatorio</span></label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={field.active !== false} onChange={(e) => updateFieldAt(setFieldDraft, index, { active: e.target.checked })} /><span className="muted">Activo</span></label>
              </div>
            </div>
          ))}
          {!fields.length && <div className="muted">Todavía no hay campos dinámicos cargados.</div>}
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Reglas de dependencia y Odoo</h2>
        <div className="muted">Estas reglas siguen funcionando para mostrar, ocultar, completar o restringir campos.</div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setRuleDraft((prev) => ({ rules: [...(prev.rules || []), newRule((prev.rules || []).length + 1)] }))}>+ Agregar regla</Button>
          <Button variant="primary" disabled={savingRules} onClick={async () => { setSavingRules(true); try { const payload = { rules: rules.map((rule, index) => ({ id: rule.id || `rule_${index + 1}`, name: String(rule.name || "").trim(), active: rule.active !== false, source_key: String(rule.source_key || "").trim(), operator: String(rule.operator || "="), compare_value: rule.compare_value ?? "", action_type: String(rule.action_type || "set_value"), target_field: String(rule.target_field || "").trim(), target_value: rule.target_value ?? "", target_options: parseOptions(rule.target_options_text || "").map((item) => item.value), apply_to_odoo: rule.apply_to_odoo === true, product_id: Number(rule.product_id || 0) || null, product_label: String(rule.product_label || "").trim(), sort_order: index + 1, })).filter((rule) => rule.source_key), }; const saved = await adminSaveTechnicalMeasurementRules(payload); setRuleDraft({ rules: (saved.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)) }); window.alert("Reglas guardadas."); } finally { setSavingRules(false); } }}>{savingRules ? "Guardando..." : "Guardar reglas"}</Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rules.map((rule, index) => (
            <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Regla #{index + 1}</div>
                <Button variant="ghost" onClick={() => setRuleDraft((prev) => ({ rules: (prev.rules || []).filter((_, i) => i !== index) }))}>✕</Button>
              </div>
              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div><div className="muted" style={{ marginBottom: 6 }}>Nombre</div><Input value={rule.name || ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { name: v })} style={{ width: "100%" }} /></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Campo origen</div><select value={rule.source_key || ""} onChange={(e) => updateRuleAt(setRuleDraft, index, { source_key: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">Seleccione campo…</option>{allFields.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Operador</div><select value={rule.operator || "="} onChange={(e) => updateRuleAt(setRuleDraft, index, { operator: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{TECHNICAL_RULE_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Comparar contra</div><Input value={rule.compare_value ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { compare_value: v })} style={{ width: "100%" }} /></div>
              </div>
              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div><div className="muted" style={{ marginBottom: 6 }}>Acción</div><select value={rule.action_type || "set_value"} onChange={(e) => updateRuleAt(setRuleDraft, index, { action_type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>{TECHNICAL_RULE_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Campo destino</div><select value={rule.target_field || ""} onChange={(e) => updateRuleAt(setRuleDraft, index, { target_field: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">Seleccione campo…</option>{targetFieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Valor destino</div><Input value={rule.target_value ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { target_value: v })} style={{ width: "100%" }} disabled={rule.action_type === "show_field" || rule.action_type === "hide_field"} /></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Opciones permitidas (coma)</div><Input value={rule.target_options_text ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { target_options_text: v })} style={{ width: "100%" }} disabled={rule.action_type !== "allow_options"} /></div>
              </div>
              <div className="spacer" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={rule.apply_to_odoo === true} onChange={(e) => updateRuleAt(setRuleDraft, index, { apply_to_odoo: e.target.checked })} /><span className="muted">Pegarlo a Odoo</span></label></div>
                <div><div className="muted" style={{ marginBottom: 6 }}>Producto Odoo</div><select value={rule.product_id || ""} onChange={(e) => { const product = products.find((item) => Number(item.id) === Number(e.target.value)); updateRuleAt(setRuleDraft, index, { product_id: e.target.value ? Number(e.target.value) : "", product_label: product ? productLabel(product) : "" }); }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}><option value="">(sin producto)</option>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></div>
                <div><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={rule.active !== false} onChange={(e) => updateRuleAt(setRuleDraft, index, { active: e.target.checked })} /><span className="muted">Regla activa</span></label></div>
              </div>
            </div>
          ))}
          {!rules.length && <div className="muted">Todavía no hay reglas técnicas configuradas.</div>}
        </div>
      </div>
    </div>
  );
}
