
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
import { PORTON_TYPES } from "../../domain/quote/portonConstants.js";
import {
  TECHNICAL_RULE_OPERATORS,
  TECHNICAL_RULE_ACTIONS,
  VALUE_SOURCE_TYPE_OPTIONS,
  BUDGET_FIELD_OPTIONS,
  USER_FIELD_OPTIONS,
  EDITABLE_BY_OPTIONS,
  ODOO_BINDING_TYPE_OPTIONS,
  FIELD_TYPE_OPTIONS,
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

const DEFAULT_SURFACE_PARAMETERS = {
  classic_kg_m2: 15,
  injected_kg_m2: 25,
  seller_kg_m2_field_path: "kg_m2_entry",
  weight_height_discount_mm: 10,
  weight_width_discount_mm: 14,
  no_cladding_angostas_max_kg: 80,
  legs_angostas_max_kg: 140,
  legs_comunes_max_kg: 175,
  legs_anchas_max_kg: 240,
  legs_superanchas_max_kg: 300,
  behind_vano_add_height_mm: 100,
  inside_vano_subtract_height_mm: 10,
  inside_vano_subtract_width_mm: 20,
  legs_angostas_add_width_mm: 140,
  legs_comunes_add_width_mm: 200,
  legs_anchas_add_width_mm: 280,
  legs_superanchas_add_width_mm: 380,
  legs_especiales_add_width_mm: 380,
  installation_inside_product_id: "",
  installation_behind_product_id: "",
  no_cladding_product_id: "",
};

function normalizeSurfaceParametersDraft(raw = {}) {
  return {
    ...DEFAULT_SURFACE_PARAMETERS,
    ...(raw && typeof raw === "object" ? raw : {}),
    installation_inside_product_id: raw?.installation_inside_product_id ?? "",
    installation_behind_product_id: raw?.installation_behind_product_id ?? "",
    no_cladding_product_id: raw?.no_cladding_product_id ?? "",
  };
}

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
    send_modification_to_commercial: false,
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
    sort_order: Number(field?.sort_order || index + 1) || index + 1,
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
    send_modification_to_commercial: field?.send_modification_to_commercial === true,
    system: field?.system === true,
    context_only: field?.context_only === true,
    can_delete: field?.can_delete !== false,
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
    target_options_text: Array.isArray(rule?.target_options)
      ? rule.target_options.join(", ")
      : String(rule?.target_options || "").trim(),
    apply_to_odoo: rule?.apply_to_odoo === true,
    product_id: Number(rule?.product_id || 0) || "",
    product_label: String(rule?.product_label || "").trim(),
    sort_order: Number(rule?.sort_order || index + 1) || index + 1,
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
function removeCustomField(setFieldDraft, field, index) {
  if (!field?.can_delete) return;
  const label = String(field?.label || field?.key || `Campo #${index + 1}`).trim();
  const ok = window.confirm(`Vas a eliminar definitivamente el campo "${label}". Esta acción se guarda cuando presiones "Guardar campos".`);
  if (!ok) return;
  setFieldDraft((prev) => ({ fields: (prev.fields || []).filter((_, i) => i !== index) }));
}
function removeRule(setRuleDraft, rule, index) {
  const label = String(rule?.name || `Regla #${index + 1}`).trim();
  const ok = window.confirm(`Vas a eliminar definitivamente la regla "${label}". Esta acción se guarda cuando presiones "Guardar reglas".`);
  if (!ok) return;
  setRuleDraft((prev) => ({ rules: (prev.rules || []).filter((_, i) => i !== index) }));
}
function detectRuleConflicts(rules = [], fields = []) {
  const byTarget = new Map();
  const fieldLabelByKey = new Map((Array.isArray(fields) ? fields : []).map((field) => [field.key, field.label]));
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.active === false || !rule?.target_field) continue;
    const target = String(rule.target_field || "").trim();
    if (!target) continue;
    const list = byTarget.get(target) || [];
    list.push(rule);
    byTarget.set(target, list);
  }
  const warnings = [];
  for (const [target, list] of byTarget.entries()) {
    if (list.length < 2) continue;
    const actions = [...new Set(list.map((item) => String(item.action_type || "set_value")))];
    warnings.push({ target, label: fieldLabelByKey.get(target) || target, count: list.length, actions });
  }
  return warnings;
}
function numericPayload(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function buildRulesPayload(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({
      id: rule.id || `rule_${index + 1}`,
      name: String(rule.name || "").trim(),
      active: rule.active !== false,
      source_key: String(rule.source_key || "").trim(),
      operator: String(rule.operator || "="),
      compare_value: rule.compare_value ?? "",
      action_type: String(rule.action_type || "set_value"),
      target_field: String(rule.target_field || "").trim(),
      target_value: rule.target_value ?? "",
      target_options: parseOptions(rule.target_options_text || "").map((item) => item.value),
      apply_to_odoo: rule.apply_to_odoo === true,
      product_id: Number(rule.product_id || 0) || null,
      product_label: String(rule.product_label || "").trim(),
      sort_order: index + 1,
    }))
    .filter((rule) => rule.source_key);
}
function buildSurfaceParametersPayload(surfaceParameters) {
  return {
    classic_kg_m2: numericPayload(surfaceParameters.classic_kg_m2),
    injected_kg_m2: numericPayload(surfaceParameters.injected_kg_m2),
    seller_kg_m2_field_path: String(surfaceParameters.seller_kg_m2_field_path || "").trim(),
    weight_height_discount_mm: numericPayload(surfaceParameters.weight_height_discount_mm),
    weight_width_discount_mm: numericPayload(surfaceParameters.weight_width_discount_mm),
    no_cladding_angostas_max_kg: numericPayload(surfaceParameters.no_cladding_angostas_max_kg),
    legs_angostas_max_kg: numericPayload(surfaceParameters.legs_angostas_max_kg),
    legs_comunes_max_kg: numericPayload(surfaceParameters.legs_comunes_max_kg),
    legs_anchas_max_kg: numericPayload(surfaceParameters.legs_anchas_max_kg),
    legs_superanchas_max_kg: numericPayload(surfaceParameters.legs_superanchas_max_kg),
    behind_vano_add_height_mm: numericPayload(surfaceParameters.behind_vano_add_height_mm),
    inside_vano_subtract_height_mm: numericPayload(surfaceParameters.inside_vano_subtract_height_mm),
    inside_vano_subtract_width_mm: numericPayload(surfaceParameters.inside_vano_subtract_width_mm),
    legs_angostas_add_width_mm: numericPayload(surfaceParameters.legs_angostas_add_width_mm),
    legs_comunes_add_width_mm: numericPayload(surfaceParameters.legs_comunes_add_width_mm),
    legs_anchas_add_width_mm: numericPayload(surfaceParameters.legs_anchas_add_width_mm),
    legs_superanchas_add_width_mm: numericPayload(surfaceParameters.legs_superanchas_add_width_mm),
    legs_especiales_add_width_mm: numericPayload(surfaceParameters.legs_especiales_add_width_mm),
    installation_inside_product_id: numericPayload(surfaceParameters.installation_inside_product_id),
    installation_behind_product_id: numericPayload(surfaceParameters.installation_behind_product_id),
    no_cladding_product_id: numericPayload(surfaceParameters.no_cladding_product_id),
  };
}

export default function SuperuserMeasurementRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [savingFields, setSavingFields] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingSurfaceConfig, setSavingSurfaceConfig] = useState(false);
  const [surfaceFinalFormula, setSurfaceFinalFormula] = useState("surface_automatica_m2");
  const [surfaceParameters, setSurfaceParameters] = useState(normalizeSurfaceParametersDraft());
  const [fieldDraft, setFieldDraft] = useState({ fields: [] });
  const [ruleDraft, setRuleDraft] = useState({ rules: [] });
  const [fieldFilter, setFieldFilter] = useState("all");
  const [fieldSearch, setFieldSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");

  const fieldsQ = useQuery({
    queryKey: ["technicalMeasurementFields"],
    queryFn: adminGetTechnicalMeasurementFieldDefinitions,
    enabled: !!user?.is_superuser,
  });
  const rulesQ = useQuery({
    queryKey: ["technicalMeasurementRules"],
    queryFn: adminGetTechnicalMeasurementRules,
    enabled: !!user?.is_superuser,
  });
  const catalogQ = useQuery({
    queryKey: ["catalogBootstrapForMeasurementRules"],
    queryFn: () => getCatalogBootstrap("porton"),
    enabled: !!user?.is_superuser,
  });

  useEffect(() => {
    if (!fieldsQ.data) return;
    const merged = mergeMeasurementFields(fieldsQ.data.fields || []).filter((field) => field?.context_only !== true);
    setFieldDraft({ fields: merged.map((field, index) => normalizeFieldDraft(field, index)) });
  }, [fieldsQ.data]);

  useEffect(() => {
    if (!rulesQ.data) return;
    setRuleDraft({
      rules: (rulesQ.data.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)),
    });
    setSurfaceFinalFormula(String(rulesQ.data.surface_final_formula || "surface_automatica_m2"));
    setSurfaceParameters(normalizeSurfaceParametersDraft(rulesQ.data.surface_parameters || {}));
  }, [rulesQ.data]);

  const products = useMemo(() => Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [], [catalogQ.data]);
  const budgetSections = useMemo(() => {
    const arr = Array.isArray(catalogQ.data?.sections) ? catalogQ.data.sections.slice() : [];
    return arr.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || String(a.name || "").localeCompare(String(b.name || ""), "es"));
  }, [catalogQ.data]);

  const productsBySectionId = useMemo(() => {
    const map = {};
    for (const product of products) {
      const sectionIds = Array.isArray(product?.section_ids) ? product.section_ids : [];
      for (const sectionIdRaw of sectionIds) {
        const sectionId = Number(sectionIdRaw);
        if (!sectionId) continue;
        if (!map[sectionId]) map[sectionId] = [];
        map[sectionId].push(product);
      }
    }
    return map;
  }, [products]);

  const portonTypeOptions = useMemo(() => PORTON_TYPES.slice(), []);

  const allFields = useMemo(() => {
    const dynamicFields = (fieldDraft.fields || [])
      .filter((field) => field?.context_only !== true)
      .map((field, index) => ({
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
        send_modification_to_commercial: field.send_modification_to_commercial === true,
      }));
    return mergeMeasurementFields(dynamicFields);
  }, [fieldDraft.fields]);

  const visibleFields = useMemo(() => allFields.filter((field) => field?.context_only !== true), [allFields]);
  const ruleSourceOptions = allFields;
  const targetFieldOptions = visibleFields;
  const fields = Array.isArray(fieldDraft?.fields) ? fieldDraft.fields : [];
  const rules = Array.isArray(ruleDraft?.rules) ? ruleDraft.rules : [];

  const filteredFields = useMemo(() => {
    const q = String(fieldSearch || "").trim().toLowerCase();
    return fields.filter((field) => {
      const matchesType = fieldFilter === "all" ? true : fieldFilter === "system" ? field?.system === true : field?.system !== true;
      if (!matchesType) return false;
      if (!q) return true;
      const haystack = [
        field?.label,
        field?.key,
        field?.section,
        field?.value_source_type,
        field?.budget_section_name,
        field?.odoo_product_label,
      ].map((item) => String(item || "").toLowerCase()).join(" ");
      return haystack.includes(q);
    });
  }, [fields, fieldFilter, fieldSearch]);

  const filteredRules = useMemo(() => {
    const q = String(ruleSearch || "").trim().toLowerCase();
    if (!q) return rules;
    const fieldLabelByKey = new Map(visibleFields.map((field) => [field.key, String(field.label || field.key || "")]));
    return rules.filter((rule) => {
      const haystack = [
        rule?.name,
        rule?.source_key,
        rule?.target_field,
        rule?.compare_value,
        rule?.target_value,
        fieldLabelByKey.get(rule?.source_key),
        fieldLabelByKey.get(rule?.target_field),
      ].map((item) => String(item || "").toLowerCase()).join(" ");
      return haystack.includes(q);
    });
  }, [rules, ruleSearch, visibleFields]);

  const conflictWarnings = useMemo(() => detectRuleConflicts(rules, visibleFields), [rules, visibleFields]);

  async function saveSurfaceConfig() {
    setSavingSurfaceConfig(true);
    try {
      const saved = await adminSaveTechnicalMeasurementRules({
        rules: buildRulesPayload(rules),
        surface_final_formula: surfaceFinalFormula,
        surface_parameters: buildSurfaceParametersPayload(surfaceParameters),
      });
      setSurfaceFinalFormula(String(saved.surface_final_formula || "surface_automatica_m2"));
      setSurfaceParameters(normalizeSurfaceParametersDraft(saved.surface_parameters || {}));
      window.alert("Configuración de superficie guardada.");
    } finally {
      setSavingSurfaceConfig(false);
    }
  }

  if (!user?.is_superuser) {
    return (
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Reglas técnicas</h2>
          <div className="muted">Solo disponible para superusuario.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Campos dinámicos de medición</h2>
        <div className="muted">Ahora cada campo puede tomar el valor directamente desde lo que el vendedor/distribuidor presupuestó, incluso por sección del catálogo.</div>
        <div className="spacer" />
        <div style={{ border: "1px solid #e8eef9", borderRadius: 10, padding: 12, background: "#f7fbff", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Campos del sistema</div>
          <div className="muted">Los campos que ya existen en la planilla ahora aparecen acá como campos del sistema. Les podés cambiar el origen del valor, quién los edita y la salida a Odoo.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setFieldDraft((prev) => ({ fields: [...(prev.fields || []), newField((prev.fields || []).length + 1)] }))}>+ Agregar campo</Button>
          <Button
            variant="primary"
            disabled={savingFields}
            onClick={async () => {
              setSavingFields(true);
              try {
                const payload = {
                  fields: fields
                    .map((field, index) => ({
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
                      send_modification_to_commercial: field.send_modification_to_commercial === true,
                    }))
                    .filter((field) => field.key && field.label),
                };
                const saved = await adminSaveTechnicalMeasurementFieldDefinitions(payload);
                const merged = mergeMeasurementFields(saved.fields || []).filter((field) => field?.context_only !== true);
                setFieldDraft({ fields: merged.map((field, index) => normalizeFieldDraft(field, index)) });
                window.alert("Campos guardados.");
              } finally {
                setSavingFields(false);
              }
            }}
          >
            {savingFields ? "Guardando..." : "Guardar campos"}
          </Button>
        </div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant={fieldFilter === "all" ? "primary" : "ghost"} onClick={() => setFieldFilter("all")}>Todos ({fields.length})</Button>
            <Button variant={fieldFilter === "system" ? "primary" : "ghost"} onClick={() => setFieldFilter("system")}>Sistema ({fields.filter((field) => field?.system === true).length})</Button>
            <Button variant={fieldFilter === "custom" ? "primary" : "ghost"} onClick={() => setFieldFilter("custom")}>Custom ({fields.filter((field) => field?.system !== true).length})</Button>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <Input value={fieldSearch} onChange={setFieldSearch} placeholder="Buscar campos por nombre, clave, sector u origen..." style={{ width: "100%" }} />
          </div>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredFields.map((field) => {
            const index = fields.findIndex((candidate) => candidate === field);
            return (
              <div key={`${field.key || "field"}-${index}`} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>Campo #{index + 1}</div>
                    {field.system ? <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 999, background: "#eef6ff", color: "#1b4b7a" }}>Sistema</span> : null}
                  </div>
                  <Button variant="ghost" onClick={() => removeCustomField(setFieldDraft, field, index)} disabled={!field.can_delete}>
                    {field.can_delete ? "Eliminar campo" : "Campo protegido"}
                  </Button>
                </div>
                <div className="spacer" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Clave interna</div>
                    <Input value={field.key || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { key: v.replace(/\s+/g, "_").toLowerCase() })} style={{ width: "100%" }} disabled={field.system === true} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Etiqueta</div>
                    <Input value={field.label || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { label: v })} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Tipo</div>
                    <select value={field.type || "text"} onChange={(e) => updateFieldAt(setFieldDraft, index, { type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} disabled={field.system === true}>
                      {FIELD_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Sector en planilla</div>
                    <select value={field.section || "otros"} onChange={(e) => updateFieldAt(setFieldDraft, index, { section: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }} disabled={field.system === true}>
                      {SECTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Opciones (coma)</div>
                    <Input value={field.optionsText || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { optionsText: v })} style={{ width: "100%" }} disabled={field.type !== "enum" || field.system === true} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Editable por</div>
                    <select value={field.editable_by || "both"} onChange={(e) => updateFieldAt(setFieldDraft, index, { editable_by: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      {EDITABLE_BY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="spacer" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Cómo se completa</div>
                    <select value={field.value_source_type || "manual"} onChange={(e) => updateFieldAt(setFieldDraft, index, { value_source_type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      {VALUE_SOURCE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Ruta / origen</div>
                    <Input value={field.value_source_path || ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { value_source_path: v })} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Valor fijo</div>
                    <Input value={field.fixed_value ?? ""} onChange={(v) => updateFieldAt(setFieldDraft, index, { fixed_value: v })} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Producto Odoo</div>
                    <select
                      value={field.odoo_product_id || ""}
                      onChange={(e) => {
                        const selectableProducts = Number(field.budget_section_id || 0) ? productsBySectionId[Number(field.budget_section_id || 0)] || [] : products;
                        const product = selectableProducts.find((item) => Number(item.id) === Number(e.target.value));
                        updateFieldAt(setFieldDraft, index, {
                          odoo_product_id: e.target.value ? Number(e.target.value) : "",
                          odoo_product_label: product ? productLabel(product) : "",
                        });
                      }}
                      style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                    >
                      <option value="">(sin producto)</option>
                      {(Number(field.budget_section_id || 0) ? productsBySectionId[Number(field.budget_section_id || 0)] || [] : products).map((product) => (
                        <option key={product.id} value={product.id}>{productLabel(product)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="spacer" />
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={field.required === true} disabled={field.system === true} onChange={(e) => updateFieldAt(setFieldDraft, index, { required: e.target.checked })} />
                    <span className="muted">Obligatorio</span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={field.active !== false} disabled={field.system === true} onChange={(e) => updateFieldAt(setFieldDraft, index, { active: e.target.checked })} />
                    <span className="muted">Activo</span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={field.send_modification_to_commercial === true} onChange={(e) => updateFieldAt(setFieldDraft, index, { send_modification_to_commercial: e.target.checked })} />
                    <span className="muted">Envía modificación a comercial</span>
                  </label>
                </div>
              </div>
            );
          })}
          {!filteredFields.length && fields.length > 0 && <div className="muted">No hay campos que coincidan con el filtro o la búsqueda.</div>}
          {!fields.length && <div className="muted">Todavía no hay campos dinámicos cargados.</div>}
        </div>
      </div>

      <div className="spacer" />
      <div className="card" style={{ background: "#fafafa" }}>
        <h2 style={{ marginTop: 0 }}>Parámetros de cálculo de piernas y superficie</h2>
        <div className="muted" style={{ marginBottom: 10 }}>
          Estos parámetros permiten detectar la instalación por IDs del presupuesto, calcular el peso estimado y determinar automáticamente el tipo de piernas y las medidas finales.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div><div className="muted" style={{ marginBottom: 6 }}>ID producto Dentro del vano</div><Input value={surfaceParameters.installation_inside_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, installation_inside_product_id: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>ID producto Detrás del vano</div><Input value={surfaceParameters.installation_behind_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, installation_behind_product_id: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>ID producto Apto para revestir</div><Input value={surfaceParameters.no_cladding_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, no_cladding_product_id: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Ruta entry kg/m² vendedor</div><Input value={surfaceParameters.seller_kg_m2_field_path} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, seller_kg_m2_field_path: v }))} style={{ width: "100%" }} /></div>

          <div><div className="muted" style={{ marginBottom: 6 }}>kg/m² clásico</div><Input value={surfaceParameters.classic_kg_m2} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, classic_kg_m2: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>kg/m² inyectado</div><Input value={surfaceParameters.injected_kg_m2} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, injected_kg_m2: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Descuento alto peso (mm)</div><Input value={surfaceParameters.weight_height_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, weight_height_discount_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Descuento ancho peso (mm)</div><Input value={surfaceParameters.weight_width_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, weight_width_discount_mm: v }))} style={{ width: "100%" }} /></div>

          <div><div className="muted" style={{ marginBottom: 6 }}>Límite angostas (kg)</div><Input value={surfaceParameters.legs_angostas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_angostas_max_kg: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Límite angostas sin revestir (kg)</div><Input value={surfaceParameters.no_cladding_angostas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, no_cladding_angostas_max_kg: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Límite comunes (kg)</div><Input value={surfaceParameters.legs_comunes_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_comunes_max_kg: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Límite anchas (kg)</div><Input value={surfaceParameters.legs_anchas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_anchas_max_kg: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Límite superanchas (kg)</div><Input value={surfaceParameters.legs_superanchas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_superanchas_max_kg: v }))} style={{ width: "100%" }} /></div>

          <div><div className="muted" style={{ marginBottom: 6 }}>Detrás del vano + alto (mm)</div><Input value={surfaceParameters.behind_vano_add_height_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, behind_vano_add_height_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Dentro del vano - alto (mm)</div><Input value={surfaceParameters.inside_vano_subtract_height_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, inside_vano_subtract_height_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Dentro del vano - ancho (mm)</div><Input value={surfaceParameters.inside_vano_subtract_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, inside_vano_subtract_width_mm: v }))} style={{ width: "100%" }} /></div>

          <div><div className="muted" style={{ marginBottom: 6 }}>Piernas angostas + ancho (mm)</div><Input value={surfaceParameters.legs_angostas_add_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_angostas_add_width_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Piernas comunes + ancho (mm)</div><Input value={surfaceParameters.legs_comunes_add_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_comunes_add_width_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Piernas anchas + ancho (mm)</div><Input value={surfaceParameters.legs_anchas_add_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_anchas_add_width_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Piernas superanchas + ancho (mm)</div><Input value={surfaceParameters.legs_superanchas_add_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_superanchas_add_width_mm: v }))} style={{ width: "100%" }} /></div>
          <div><div className="muted" style={{ marginBottom: 6 }}>Piernas especiales + ancho (mm)</div><Input value={surfaceParameters.legs_especiales_add_width_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_especiales_add_width_mm: v }))} style={{ width: "100%" }} /></div>
        </div>
        <div className="spacer" />
        <h3 style={{ marginTop: 0 }}>Fórmula de superficie final</h3>
        <div className="muted" style={{ marginBottom: 10 }}>
          Lo normal es usar <b>surface_automatica_m2</b>. También podés usar variables derivadas como <b>alto_calculado_mm</b>, <b>ancho_calculado_mm</b>, <b>peso_estimado_kg</b> y el tipo de piernas calculado.
        </div>
        <textarea value={surfaceFinalFormula} onChange={(e) => setSurfaceFinalFormula(e.target.value)} style={{ width: "100%", minHeight: 96, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#fff", color: "#111827" }} />
        <div className="muted" style={{ marginTop: 8 }}>
          Variables útiles: <b>surface_automatica_m2</b>, <b>alto_calculado_mm</b>, <b>ancho_calculado_mm</b>, <b>peso_estimado_kg</b>, <b>kg_m2_porton</b>, <b>instalacion_dentro_vano</b>, <b>instalacion_detras_vano</b>, <b>piernas_angostas</b>, <b>piernas_comunes</b>, <b>piernas_anchas</b>, <b>piernas_superanchas</b>, <b>piernas_especiales</b>.
        </div>
        <div className="muted" style={{ marginTop: 6 }}>Ejemplo recomendado: <b>surface_automatica_m2</b></div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="primary" onClick={saveSurfaceConfig} disabled={savingSurfaceConfig || savingRules}>
            {savingSurfaceConfig ? "Guardando..." : "Guardar parámetros y fórmula"}
          </Button>
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Reglas de dependencia y Odoo</h2>
        <div className="muted">Estas reglas siguen funcionando para mostrar, ocultar, completar o restringir campos.</div>
        <div className="spacer" />
        <div style={{ border: "1px solid #f4e3c4", borderRadius: 10, padding: 12, background: "#fff9ef", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Precedencia</div>
          <div className="muted">Primero se aplica la configuración base del campo y después las reglas activas.</div>
          {conflictWarnings.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Posibles conflictos detectados</div>
              <div className="muted">{conflictWarnings.map((warning) => `${warning.label} (${warning.actions.join(" / ")}, ${warning.count} reglas)`).join(" · ")}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => setRuleDraft((prev) => ({ rules: [...(prev.rules || []), newRule((prev.rules || []).length + 1)] }))}>+ Agregar regla</Button>
          <Button
            variant="primary"
            disabled={savingRules}
            onClick={async () => {
              setSavingRules(true);
              try {
                const saved = await adminSaveTechnicalMeasurementRules({
                  rules: buildRulesPayload(rules),
                  surface_final_formula: surfaceFinalFormula,
                  surface_parameters: buildSurfaceParametersPayload(surfaceParameters),
                });
                setRuleDraft({ rules: (saved.rules || []).map((rule, index) => normalizeRuleDraft(rule, index)) });
                setSurfaceFinalFormula(String(saved.surface_final_formula || "surface_automatica_m2"));
                setSurfaceParameters(normalizeSurfaceParametersDraft(saved.surface_parameters || {}));
                window.alert("Reglas guardadas.");
              } finally {
                setSavingRules(false);
              }
            }}
          >
            {savingRules ? "Guardando..." : "Guardar reglas"}
          </Button>
        </div>
        <div className="spacer" />
        <div style={{ maxWidth: 520 }}>
          <Input value={ruleSearch} onChange={setRuleSearch} placeholder="Buscar reglas por nombre, campo origen, destino o valor..." style={{ width: "100%" }} />
        </div>
      </div>

      <div className="spacer" />
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredRules.map((rule) => {
            const index = rules.findIndex((candidate) => candidate === rule);
            return (
              <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>Regla #{index + 1}</div>
                  <Button variant="ghost" onClick={() => removeRule(setRuleDraft, rule, index)} title="Eliminar regla">Eliminar regla</Button>
                </div>
                <div className="spacer" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Nombre</div>
                    <Input value={rule.name || ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { name: v })} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Campo origen</div>
                    <select value={rule.source_key || ""} onChange={(e) => updateRuleAt(setRuleDraft, index, { source_key: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      <option value="">Seleccione campo…</option>
                      {ruleSourceOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Operador</div>
                    <select value={rule.operator || "="} onChange={(e) => updateRuleAt(setRuleDraft, index, { operator: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      {TECHNICAL_RULE_OPERATORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Comparar contra</div>
                    {String(rule.source_key || "") === "porton_type" ? (
                      <select value={rule.compare_value ?? ""} onChange={(e) => updateRuleAt(setRuleDraft, index, { compare_value: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                        <option value="">Seleccione un sistema…</option>
                        {portonTypeOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                      </select>
                    ) : (
                      <Input value={rule.compare_value ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { compare_value: v })} style={{ width: "100%" }} />
                    )}
                  </div>
                </div>
                <div className="spacer" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Acción</div>
                    <select value={rule.action_type || "set_value"} onChange={(e) => updateRuleAt(setRuleDraft, index, { action_type: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      {TECHNICAL_RULE_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Campo destino</div>
                    <select value={rule.target_field || ""} onChange={(e) => updateRuleAt(setRuleDraft, index, { target_field: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      <option value="">Seleccione campo…</option>
                      {targetFieldOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Valor destino</div>
                    <Input value={rule.target_value ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { target_value: v })} style={{ width: "100%" }} disabled={rule.action_type === "show_field" || rule.action_type === "hide_field"} />
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Opciones permitidas (coma)</div>
                    <Input value={rule.target_options_text ?? ""} onChange={(v) => updateRuleAt(setRuleDraft, index, { target_options_text: v })} style={{ width: "100%" }} disabled={rule.action_type !== "allow_options"} />
                  </div>
                </div>
                <div className="spacer" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={rule.apply_to_odoo === true} onChange={(e) => updateRuleAt(setRuleDraft, index, { apply_to_odoo: e.target.checked })} />
                      <span className="muted">Pegarlo a Odoo</span>
                    </label>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Producto Odoo</div>
                    <select
                      value={rule.product_id || ""}
                      onChange={(e) => {
                        const product = products.find((item) => Number(item.id) === Number(e.target.value));
                        updateRuleAt(setRuleDraft, index, {
                          product_id: e.target.value ? Number(e.target.value) : "",
                          product_label: product ? productLabel(product) : "",
                        });
                      }}
                      style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                    >
                      <option value="">(sin producto)</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={rule.active !== false} onChange={(e) => updateRuleAt(setRuleDraft, index, { active: e.target.checked })} />
                      <span className="muted">Regla activa</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
          {!filteredRules.length && rules.length > 0 && <div className="muted">No hay reglas que coincidan con la búsqueda.</div>}
          {!rules.length && <div className="muted">Todavía no hay reglas técnicas configuradas.</div>}
        </div>
      </div>
    </div>
  );
}
