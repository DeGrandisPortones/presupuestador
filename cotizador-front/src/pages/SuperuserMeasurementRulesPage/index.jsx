import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { useAuthStore } from "../../domain/auth/store.js";
import {
  adminGetTechnicalMeasurementRules,
  adminSaveTechnicalMeasurementRules,
} from "../../api/admin.js";
import { getCatalogBootstrap } from "../../api/catalog.js";

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
  paso_height_discount_mm: 110,
  paso_width_discount_angostas_mm: 80,
  paso_width_discount_comunes_mm: 110,
  paso_width_discount_anchas_mm: 150,
  paso_width_discount_superanchas_mm: 200,
  paso_width_discount_especiales_mm: 200,
  hoja_height_discount_mm: 10,
  hoja_lateral_rebaje_width_discount_mm: 5,
  hoja_rebaje_lateral_product_ids: "",
  installation_inside_product_id: "",
  installation_behind_product_id: "",
  no_cladding_product_id: "",
  apto_revestir_kg_m2_rules: [],
  non_apto_parantes_vertical_product_ids: "",
  non_apto_parantes_horizontal_product_ids: "",
  parantes_door_product_ids: "",
  parantes_right_door_product_ids: "",
  parantes_left_door_product_ids: "",
  parantes_door_first_distance_mm: 800,
  parantes_tube_discount_mm: 40,
  auto_budget_product_rules_json: "[]",
};

const SURFACE_PARAMETERS_STORAGE_KEY = "presupuestador:technical_surface_parameters:porton";

function textValue(value) { return String(value ?? "").trim(); }
function textPayload(value) { return String(value ?? "").trim(); }
function numericPayload(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function readStoredSurfaceParameters() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    const raw = window.localStorage.getItem(SURFACE_PARAMETERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}
function writeStoredSurfaceParameters(surfaceParameters = {}) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(SURFACE_PARAMETERS_STORAGE_KEY, JSON.stringify(surfaceParameters && typeof surfaceParameters === "object" ? surfaceParameters : {}));
  } catch (_err) {
    // El backend sigue siendo la fuente principal; localStorage es solo respaldo de UI.
  }
}
function isEmptySurfaceParamValue(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return !Object.keys(value).length;
  return String(value).trim() === "";
}
function mergeStoredSurfaceParameters(base = {}) {
  const stored = readStoredSurfaceParameters();
  const next = { ...(base && typeof base === "object" ? base : {}) };
  for (const [key, value] of Object.entries(stored)) {
    if (!isEmptySurfaceParamValue(value) && isEmptySurfaceParamValue(next[key])) next[key] = value;
  }
  return next;
}
function hasSurfaceParamContent(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}
function getSurfaceParametersFromRulesData(rulesData = {}) {
  return {
    ...(hasSurfaceParamContent(rulesData?.measurement_surface_params) ? rulesData.measurement_surface_params : {}),
    ...(hasSurfaceParamContent(rulesData?.surface_params) ? rulesData.surface_params : {}),
    ...(hasSurfaceParamContent(rulesData?.surface_calc_params) ? rulesData.surface_calc_params : {}),
    ...(hasSurfaceParamContent(rulesData?.surface_parameters) ? rulesData.surface_parameters : {}),
    ...(hasSurfaceParamContent(rulesData?.parantes_config) ? rulesData.parantes_config : {}),
    ...(hasSurfaceParamContent(rulesData?.catalog_rules?.porton?.parantes_config) ? rulesData.catalog_rules.porton.parantes_config : {}),
  };
}
function productLabel(product = {}) {
  return `${product.display_name || product.alias || product.name || `Producto ${product.id}`}${product.code ? ` · ${product.code}` : ""}`;
}
function productSearchText(product = {}) {
  return [product.id, product.odoo_id, product.odoo_template_id, product.odoo_variant_id, product.display_name, product.alias, product.name, product.code]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");
}
function productMatchesAnyId(product = {}, targetId) {
  const id = Number(targetId || 0);
  if (!id) return false;
  return [product?.id, product?.odoo_id, product?.odoo_template_id, product?.odoo_variant_id, product?.odoo_external_id]
    .map((value) => Number(value || 0))
    .includes(id);
}
function getVisibleOdooId(product = {}) {
  return Number(product?.odoo_id || product?.odoo_template_id || product?.odoo_variant_id || product?.id || 0) || 0;
}
function newAptoKgRule(index = 1) {
  return { id: `apto_rule_${Date.now()}_${index}`, product_id: "", product_label: "", kg_m2: "" };
}
function normalizeAptoKgRuleDraft(rule = {}, index = 0) {
  return {
    id: String(rule?.id || `apto_rule_${index + 1}`),
    product_id: Number(rule?.product_id || 0) || "",
    product_label: textValue(rule?.product_label),
    kg_m2: rule?.kg_m2 ?? "",
  };
}
function normalizeAptoKgRulesDraft(raw = []) {
  return (Array.isArray(raw) ? raw : []).map((rule, index) => normalizeAptoKgRuleDraft(rule, index));
}
function safeParseAutoRulesJson(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}
function safeStringifyAutoRules(rules = []) {
  const normalized = (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({
      id: String(rule?.id || `auto_budget_rule_${index + 1}`),
      name: textValue(rule?.name || `Automatización #${index + 1}`),
      active: rule?.active !== false,
      trigger_product_ids: textValue(rule?.trigger_product_ids),
      target_product_id: Number(rule?.target_product_id || 0) || null,
      target_product_label: textValue(rule?.target_product_label),
      quantity_mode: String(rule?.quantity_mode || "unit") === "surface" ? "surface" : "unit",
      only_apto_revestir: rule?.only_apto_revestir !== false,
    }))
    .filter((rule) => rule.trigger_product_ids && rule.target_product_id);
  return JSON.stringify(normalized);
}
function newAutoBudgetRule(index = 1) {
  return {
    id: `auto_budget_rule_${Date.now()}_${index}`,
    name: "",
    active: true,
    trigger_product_ids: "",
    target_product_id: "",
    target_product_label: "",
    quantity_mode: "surface",
    only_apto_revestir: true,
  };
}
function normalizeAutoBudgetRuleDraft(rule = {}, index = 0) {
  return {
    id: String(rule?.id || `auto_budget_rule_${index + 1}`),
    name: textValue(rule?.name || `Automatización #${index + 1}`),
    active: rule?.active !== false,
    trigger_product_ids: textValue(rule?.trigger_product_ids || rule?.trigger_ids),
    target_product_id: Number(rule?.target_product_id || rule?.target_odoo_id || rule?.product_id || 0) || "",
    target_product_label: textValue(rule?.target_product_label || rule?.product_label),
    quantity_mode: String(rule?.quantity_mode || "unit") === "surface" ? "surface" : "unit",
    only_apto_revestir: rule?.only_apto_revestir !== false,
  };
}
function normalizeAutoBudgetRulesDraft(surfaceParameters = {}) {
  const rawRules = safeParseAutoRulesJson(surfaceParameters?.auto_budget_product_rules_json);
  const rules = rawRules.map((rule, index) => normalizeAutoBudgetRuleDraft(rule, index));

  const legacyTriggerText = textValue(surfaceParameters?.apto_revestir_profile_trigger_product_ids);
  const legacyProductId = Number(surfaceParameters?.apto_revestir_profile_odoo_id || 0) || 0;
  if (legacyTriggerText && legacyProductId && !rules.some((rule) => Number(rule.target_product_id) === legacyProductId && rule.trigger_product_ids === legacyTriggerText)) {
    rules.push({
      id: "legacy_perfil_apto_revestir",
      name: "Perfil apto para revestir",
      active: true,
      trigger_product_ids: legacyTriggerText,
      target_product_id: legacyProductId,
      target_product_label: "Perfil",
      quantity_mode: "surface",
      only_apto_revestir: true,
    });
  }

  return rules;
}
function normalizeSurfaceParametersDraft(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    ...DEFAULT_SURFACE_PARAMETERS,
    ...source,
    installation_inside_product_id: source?.installation_inside_product_id ?? "",
    installation_behind_product_id: source?.installation_behind_product_id ?? "",
    no_cladding_product_id: source?.no_cladding_product_id ?? "",
    apto_revestir_kg_m2_rules: normalizeAptoKgRulesDraft(source?.apto_revestir_kg_m2_rules),
    non_apto_parantes_vertical_product_ids: source?.non_apto_parantes_vertical_product_ids ?? "",
    non_apto_parantes_horizontal_product_ids: source?.non_apto_parantes_horizontal_product_ids ?? "",
    parantes_door_product_ids: source?.parantes_door_product_ids ?? source?.door_product_ids ?? source?.puerta_product_ids ?? "",
    parantes_right_door_product_ids: source?.parantes_right_door_product_ids ?? source?.right_door_product_ids ?? source?.puerta_derecha_product_ids ?? source?.door_right_product_ids ?? "",
    parantes_left_door_product_ids: source?.parantes_left_door_product_ids ?? source?.left_door_product_ids ?? source?.puerta_izquierda_product_ids ?? source?.door_left_product_ids ?? "",
    parantes_door_first_distance_mm: source?.parantes_door_first_distance_mm ?? 800,
    parantes_tube_discount_mm: source?.parantes_tube_discount_mm ?? source?.parantes_cano_discount_mm ?? source?.descuento_cano_parantes_mm ?? 40,
    paso_height_discount_mm: source?.paso_height_discount_mm ?? source?.paso_alto_descuento_mm ?? source?.step_height_discount_mm ?? 110,
    paso_width_discount_angostas_mm: source?.paso_width_discount_angostas_mm ?? source?.paso_ancho_descuento_angostas_mm ?? 80,
    paso_width_discount_comunes_mm: source?.paso_width_discount_comunes_mm ?? source?.paso_ancho_descuento_comunes_mm ?? 110,
    paso_width_discount_anchas_mm: source?.paso_width_discount_anchas_mm ?? source?.paso_ancho_descuento_anchas_mm ?? 150,
    paso_width_discount_superanchas_mm: source?.paso_width_discount_superanchas_mm ?? source?.paso_ancho_descuento_superanchas_mm ?? 200,
    paso_width_discount_especiales_mm: source?.paso_width_discount_especiales_mm ?? source?.paso_ancho_descuento_especiales_mm ?? 200,
    hoja_height_discount_mm: source?.hoja_height_discount_mm ?? source?.hoja_alto_descuento_mm ?? source?.leaf_height_discount_mm ?? 10,
    hoja_lateral_rebaje_width_discount_mm: source?.hoja_lateral_rebaje_width_discount_mm ?? source?.rebaje_lateral_hoja_discount_mm ?? source?.leaf_lateral_rebaje_width_discount_mm ?? 5,
    hoja_rebaje_lateral_product_ids: source?.hoja_rebaje_lateral_product_ids ?? source?.rebaje_lateral_product_ids ?? source?.leaf_lateral_rebaje_product_ids ?? "",
    auto_budget_product_rules_json: source?.auto_budget_product_rules_json ?? "[]",
  };
}
function pickParantesConfig(surfaceParameters = {}) {
  return {
    non_apto_parantes_vertical_product_ids: textPayload(surfaceParameters.non_apto_parantes_vertical_product_ids),
    non_apto_parantes_horizontal_product_ids: textPayload(surfaceParameters.non_apto_parantes_horizontal_product_ids),
    parantes_door_product_ids: textPayload(surfaceParameters.parantes_door_product_ids),
    parantes_right_door_product_ids: textPayload(surfaceParameters.parantes_right_door_product_ids),
    parantes_left_door_product_ids: textPayload(surfaceParameters.parantes_left_door_product_ids),
    parantes_door_first_distance_mm: numericPayload(surfaceParameters.parantes_door_first_distance_mm) || 800,
    parantes_tube_discount_mm: numericPayload(surfaceParameters.parantes_tube_discount_mm) || 40,
  };
}
function buildSurfaceParametersPayload(surfaceParameters = {}) {
  const autoRulesJson = safeStringifyAutoRules(surfaceParameters?.auto_budget_product_rules || safeParseAutoRulesJson(surfaceParameters?.auto_budget_product_rules_json));
  return {
    classic_kg_m2: numericPayload(surfaceParameters.classic_kg_m2),
    injected_kg_m2: numericPayload(surfaceParameters.injected_kg_m2),
    seller_kg_m2_field_path: textPayload(surfaceParameters.seller_kg_m2_field_path),
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
    paso_height_discount_mm: numericPayload(surfaceParameters.paso_height_discount_mm),
    paso_width_discount_angostas_mm: numericPayload(surfaceParameters.paso_width_discount_angostas_mm),
    paso_width_discount_comunes_mm: numericPayload(surfaceParameters.paso_width_discount_comunes_mm),
    paso_width_discount_anchas_mm: numericPayload(surfaceParameters.paso_width_discount_anchas_mm),
    paso_width_discount_superanchas_mm: numericPayload(surfaceParameters.paso_width_discount_superanchas_mm),
    paso_width_discount_especiales_mm: numericPayload(surfaceParameters.paso_width_discount_especiales_mm),
    hoja_height_discount_mm: numericPayload(surfaceParameters.hoja_height_discount_mm),
    hoja_lateral_rebaje_width_discount_mm: numericPayload(surfaceParameters.hoja_lateral_rebaje_width_discount_mm),
    hoja_rebaje_lateral_product_ids: textPayload(surfaceParameters.hoja_rebaje_lateral_product_ids),
    installation_inside_product_id: numericPayload(surfaceParameters.installation_inside_product_id),
    installation_behind_product_id: numericPayload(surfaceParameters.installation_behind_product_id),
    no_cladding_product_id: numericPayload(surfaceParameters.no_cladding_product_id),
    non_apto_parantes_vertical_product_ids: textPayload(surfaceParameters.non_apto_parantes_vertical_product_ids),
    non_apto_parantes_horizontal_product_ids: textPayload(surfaceParameters.non_apto_parantes_horizontal_product_ids),
    parantes_door_product_ids: textPayload(surfaceParameters.parantes_door_product_ids),
    parantes_right_door_product_ids: textPayload(surfaceParameters.parantes_right_door_product_ids),
    parantes_left_door_product_ids: textPayload(surfaceParameters.parantes_left_door_product_ids),
    parantes_door_first_distance_mm: numericPayload(surfaceParameters.parantes_door_first_distance_mm) || 800,
    parantes_tube_discount_mm: numericPayload(surfaceParameters.parantes_tube_discount_mm) || 40,
    auto_budget_product_rules_json: autoRulesJson,
    apto_revestir_kg_m2_rules: (Array.isArray(surfaceParameters?.apto_revestir_kg_m2_rules)
      ? surfaceParameters.apto_revestir_kg_m2_rules
      : [])
      .map((rule) => ({
        product_id: numericPayload(rule?.product_id),
        product_label: textValue(rule?.product_label),
        kg_m2: numericPayload(rule?.kg_m2),
      }))
      .filter((rule) => Number(rule.product_id || 0) > 0 && Number(rule.kg_m2 || 0) > 0),
  };
}
function buildTechnicalRulesSavePayload({ rulesData, surfaceFinalFormula, surfaceParameters }) {
  const surfacePayload = buildSurfaceParametersPayload(surfaceParameters);
  const parantesConfig = pickParantesConfig(surfacePayload);
  return {
    ...(rulesData && typeof rulesData === "object" ? rulesData : {}),
    kind: "porton",
    surface_final_formula: surfaceFinalFormula,
    surface_parameters: surfacePayload,
    surface_calc_params: surfacePayload,
    surface_params: surfacePayload,
    measurement_surface_params: surfacePayload,
    parantes_config: parantesConfig,
    ...surfacePayload,
  };
}
function updateAptoKgRuleAt(setSurfaceParameters, index, patch) {
  setSurfaceParameters((prev) => {
    const nextRules = [...(prev?.apto_revestir_kg_m2_rules || [])];
    nextRules[index] = { ...nextRules[index], ...patch };
    return { ...prev, apto_revestir_kg_m2_rules: nextRules };
  });
}
function removeAptoKgRuleAt(setSurfaceParameters, index) {
  setSurfaceParameters((prev) => ({
    ...prev,
    apto_revestir_kg_m2_rules: (prev?.apto_revestir_kg_m2_rules || []).filter((_, i) => i !== index),
  }));
}
function updateAutoRuleAt(setSurfaceParameters, index, patch) {
  setSurfaceParameters((prev) => {
    const nextRules = [...(prev?.auto_budget_product_rules || [])];
    nextRules[index] = { ...nextRules[index], ...patch };
    return { ...prev, auto_budget_product_rules: nextRules, auto_budget_product_rules_json: safeStringifyAutoRules(nextRules) };
  });
}
function removeAutoRuleAt(setSurfaceParameters, index) {
  setSurfaceParameters((prev) => {
    const nextRules = (prev?.auto_budget_product_rules || []).filter((_, i) => i !== index);
    return { ...prev, auto_budget_product_rules: nextRules, auto_budget_product_rules_json: safeStringifyAutoRules(nextRules) };
  });
}
function addAutoRule(setSurfaceParameters) {
  setSurfaceParameters((prev) => {
    const nextRules = [...(prev?.auto_budget_product_rules || []), newAutoBudgetRule((prev?.auto_budget_product_rules || []).length + 1)];
    return { ...prev, auto_budget_product_rules: nextRules, auto_budget_product_rules_json: safeStringifyAutoRules(nextRules) };
  });
}
function productOptions(products = []) {
  return products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>);
}
function targetProductOptions(products = []) {
  return products.map((product) => {
    const visibleOdooId = getVisibleOdooId(product);
    return <option key={product.id} value={visibleOdooId || product.id}>{productLabel(product)} · ID Presupuestador: {product.id} · ID Odoo: {visibleOdooId || product.id}</option>;
  });
}
function ParamInput({ label, value, onChange, textarea = false, helper = "" }) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 6 }}>{label}</div>
      {textarea ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }}
        />
      ) : (
        <Input value={value ?? ""} onChange={onChange} style={{ width: "100%" }} />
      )}
      {helper ? <div className="muted" style={{ marginTop: 6, lineHeight: 1.3 }}>{helper}</div> : null}
    </div>
  );
}
function SavedParamItem({ label, value }) {
  const display = value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
  return (
    <div style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: 10, background: "#ffffff" }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, color: "#065f46" }}>{display}</div>
    </div>
  );
}

export default function SuperuserMeasurementRulesPage() {
  const user = useAuthStore((s) => s.user);
  const [savingSurfaceConfig, setSavingSurfaceConfig] = useState(false);
  const [surfaceFinalFormula, setSurfaceFinalFormula] = useState("surface_automatica_m2");
  const [surfaceParameters, setSurfaceParameters] = useState(normalizeSurfaceParametersDraft());
  const [savedSurfaceParameters, setSavedSurfaceParameters] = useState(normalizeSurfaceParametersDraft());
  const [savedSurfaceStatus, setSavedSurfaceStatus] = useState("");
  const [kgSectionFilter, setKgSectionFilter] = useState("all");
  const [kgProductSearch, setKgProductSearch] = useState("");
  const [autoProductSearch, setAutoProductSearch] = useState("");

  const rulesQ = useQuery({
    queryKey: ["technicalMeasurementRules"],
    queryFn: () => adminGetTechnicalMeasurementRules("porton"),
    enabled: !!user?.is_superuser,
  });
  const catalogQ = useQuery({
    queryKey: ["catalogBootstrapForMeasurementRules"],
    queryFn: () => getCatalogBootstrap("porton"),
    enabled: !!user?.is_superuser,
  });

  useEffect(() => {
    if (!rulesQ.data) return;
    setSurfaceFinalFormula(String(rulesQ.data.surface_final_formula || "surface_automatica_m2"));
    const loadedBase = normalizeSurfaceParametersDraft(mergeStoredSurfaceParameters(getSurfaceParametersFromRulesData(rulesQ.data)));
    const loadedSurfaceParameters = {
      ...loadedBase,
      auto_budget_product_rules: normalizeAutoBudgetRulesDraft(loadedBase),
    };
    loadedSurfaceParameters.auto_budget_product_rules_json = safeStringifyAutoRules(loadedSurfaceParameters.auto_budget_product_rules);
    setSurfaceParameters(loadedSurfaceParameters);
    setSavedSurfaceParameters(loadedSurfaceParameters);
    setSavedSurfaceStatus("Cargado desde Supabase");
  }, [rulesQ.data]);

  const products = useMemo(() => Array.isArray(catalogQ.data?.products) ? catalogQ.data.products : [], [catalogQ.data]);
  const sections = useMemo(() => Array.isArray(catalogQ.data?.sections) ? catalogQ.data.sections : [], [catalogQ.data]);
  const aptoKgRules = Array.isArray(surfaceParameters?.apto_revestir_kg_m2_rules) ? surfaceParameters.apto_revestir_kg_m2_rules : [];
  const autoRules = Array.isArray(surfaceParameters?.auto_budget_product_rules) ? surfaceParameters.auto_budget_product_rules : [];

  const kgProductsFiltered = useMemo(() => {
    const q = textValue(kgProductSearch).toLowerCase();
    const selectedSectionId = Number(kgSectionFilter || 0);
    return products.filter((product) => {
      if (selectedSectionId && !(Array.isArray(product.section_ids) && product.section_ids.map(Number).includes(selectedSectionId))) return false;
      if (!q) return true;
      return productSearchText(product).includes(q);
    });
  }, [products, kgSectionFilter, kgProductSearch]);

  const autoProductsFiltered = useMemo(() => {
    const q = textValue(autoProductSearch).toLowerCase();
    if (!q) return products;
    return products.filter((product) => productSearchText(product).includes(q));
  }, [products, autoProductSearch]);

  function productsForKgRule(rule) {
    if (!rule?.product_id) return kgProductsFiltered;
    const selected = products.find((product) => Number(product.id) === Number(rule.product_id));
    if (!selected || kgProductsFiltered.some((product) => Number(product.id) === Number(selected.id))) return kgProductsFiltered;
    return [selected, ...kgProductsFiltered];
  }
  function productsForAutoRule(rule) {
    if (!rule?.target_product_id) return autoProductsFiltered;
    const selected = products.find((product) => productMatchesAnyId(product, rule.target_product_id));
    if (!selected || autoProductsFiltered.some((product) => Number(product.id) === Number(selected.id))) return autoProductsFiltered;
    return [selected, ...autoProductsFiltered];
  }

  async function reloadSavedSurfaceConfig() {
    setSavingSurfaceConfig(true);
    try {
      const result = await rulesQ.refetch();
      const loadedBase = normalizeSurfaceParametersDraft(mergeStoredSurfaceParameters(getSurfaceParametersFromRulesData(result.data || {})));
      const loadedSurfaceParameters = {
        ...loadedBase,
        auto_budget_product_rules: normalizeAutoBudgetRulesDraft(loadedBase),
      };
      loadedSurfaceParameters.auto_budget_product_rules_json = safeStringifyAutoRules(loadedSurfaceParameters.auto_budget_product_rules);
      setSurfaceParameters(loadedSurfaceParameters);
      setSavedSurfaceParameters(loadedSurfaceParameters);
      writeStoredSurfaceParameters(loadedSurfaceParameters);
      setSavedSurfaceStatus(`Recargado desde Supabase ${new Date().toLocaleString("es-AR")}`);
    } finally {
      setSavingSurfaceConfig(false);
    }
  }

  async function saveSurfaceConfig() {
    setSavingSurfaceConfig(true);
    try {
      const payload = buildTechnicalRulesSavePayload({ rulesData: rulesQ.data || {}, surfaceFinalFormula, surfaceParameters });
      writeStoredSurfaceParameters(payload.surface_parameters);
      const saved = await adminSaveTechnicalMeasurementRules("porton", payload);
      const savedBase = normalizeSurfaceParametersDraft({
        ...mergeStoredSurfaceParameters(getSurfaceParametersFromRulesData(saved)),
        ...payload.surface_parameters,
        ...payload.parantes_config,
      });
      const savedSurfaceParameters = {
        ...savedBase,
        auto_budget_product_rules: normalizeAutoBudgetRulesDraft(savedBase),
      };
      savedSurfaceParameters.auto_budget_product_rules_json = safeStringifyAutoRules(savedSurfaceParameters.auto_budget_product_rules);
      writeStoredSurfaceParameters(savedSurfaceParameters);
      setSurfaceFinalFormula(String(saved.surface_final_formula || surfaceFinalFormula || "surface_automatica_m2"));
      setSurfaceParameters(savedSurfaceParameters);
      setSavedSurfaceParameters(savedSurfaceParameters);
      setSavedSurfaceStatus(`Guardado en Supabase ${new Date().toLocaleString("es-AR")}`);
      window.alert("Configuración técnica guardada.");
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
      <div className="card" style={{ background: "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>Reglas técnicas</h2>
            <div className="muted">Campos dinámicos de medición ocultos. Las configuraciones existentes no se borran.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <Button variant="primary" onClick={saveSurfaceConfig} disabled={savingSurfaceConfig || rulesQ.isLoading}>
              {savingSurfaceConfig ? "Guardando..." : "Guardar configuración"}
            </Button>
            <div className="muted" style={{ fontSize: 12 }}>{savedSurfaceStatus || "Parámetros guardados todavía no cargados"}</div>
          </div>
        </div>

        <div className="spacer" />
        <div style={{ border: "1px solid #f4e3c4", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Automatización del presupuesto</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Definí reglas para agregar productos automáticamente. En disparadores podés poner IDs separados por coma, espacio, punto y coma o salto de línea. Para exigir un grupo completo usá +, por ejemplo 4037+3996.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button onClick={() => addAutoRule(setSurfaceParameters)}>+ Agregar automatización</Button>
            <div style={{ minWidth: 260, flex: 1 }}>
              <Input value={autoProductSearch} onChange={setAutoProductSearch} placeholder="Filtrar productos destino por ID o nombre..." style={{ width: "100%" }} />
            </div>
          </div>
          <div className="spacer" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {autoRules.map((rule, index) => (
              <div key={rule.id || index} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "end" }}>
                  <ParamInput label="Nombre" value={rule.name || ""} onChange={(v) => updateAutoRuleAt(setSurfaceParameters, index, { name: v })} />
                  <ParamInput label="Si el presupuesto contiene estos IDs/combinaciones" textarea value={rule.trigger_product_ids || ""} onChange={(v) => updateAutoRuleAt(setSurfaceParameters, index, { trigger_product_ids: v })} helper="Ej: 4037,3996 o 4037+3996" />
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Agregar producto automáticamente</div>
                    <select value={rule.target_product_id || ""} onChange={(e) => {
                      const selectedValue = Number(e.target.value || 0) || "";
                      const product = products.find((item) => productMatchesAnyId(item, selectedValue));
                      updateAutoRuleAt(setSurfaceParameters, index, { target_product_id: selectedValue, target_product_label: product ? productLabel(product) : "" });
                    }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      <option value="">Seleccione producto…</option>
                      {targetProductOptions(productsForAutoRule(rule))}
                    </select>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>Cantidad</div>
                    <select value={rule.quantity_mode || "unit"} onChange={(e) => updateAutoRuleAt(setSurfaceParameters, index, { quantity_mode: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                      <option value="unit">1 unidad</option>
                      <option value="surface">Superficie del portón</option>
                    </select>
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={rule.only_apto_revestir !== false} onChange={(e) => updateAutoRuleAt(setSurfaceParameters, index, { only_apto_revestir: e.target.checked })} />
                    <span className="muted">Sólo apto para revestir</span>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={rule.active !== false} onChange={(e) => updateAutoRuleAt(setSurfaceParameters, index, { active: e.target.checked })} />
                    <span className="muted">Activa</span>
                  </label>
                  <Button variant="ghost" onClick={() => removeAutoRuleAt(setSurfaceParameters, index)}>Eliminar</Button>
                </div>
              </div>
            ))}
            {!autoRules.length ? <div className="muted">Todavía no hay automatizaciones cargadas.</div> : null}
          </div>
        </div>

        <div className="spacer" />
        <div style={{ border: "1px solid #dbeafe", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Parámetros de cálculo de piernas, superficie y parantes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <ParamInput label="ID producto Dentro del vano" value={surfaceParameters.installation_inside_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, installation_inside_product_id: v }))} />
            <ParamInput label="ID producto Detrás del vano" value={surfaceParameters.installation_behind_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, installation_behind_product_id: v }))} />
            <ParamInput label="ID producto Apto para revestir" value={surfaceParameters.no_cladding_product_id} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, no_cladding_product_id: v }))} />
            <ParamInput label="Ruta entry kg/m² vendedor" value={surfaceParameters.seller_kg_m2_field_path} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, seller_kg_m2_field_path: v }))} />
            <ParamInput label="kg/m² clásico" value={surfaceParameters.classic_kg_m2} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, classic_kg_m2: v }))} />
            <ParamInput label="kg/m² inyectado" value={surfaceParameters.injected_kg_m2} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, injected_kg_m2: v }))} />
            <ParamInput label="Descuento alto peso (mm)" value={surfaceParameters.weight_height_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, weight_height_discount_mm: v }))} />
            <ParamInput label="Descuento ancho peso (mm)" value={surfaceParameters.weight_width_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, weight_width_discount_mm: v }))} />
            <ParamInput label="Límite angostas (kg)" value={surfaceParameters.legs_angostas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_angostas_max_kg: v }))} />
            <ParamInput label="Límite angostas sin revestir (kg)" value={surfaceParameters.no_cladding_angostas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, no_cladding_angostas_max_kg: v }))} />
            <ParamInput label="Límite comunes (kg)" value={surfaceParameters.legs_comunes_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_comunes_max_kg: v }))} />
            <ParamInput label="Límite anchas (kg)" value={surfaceParameters.legs_anchas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_anchas_max_kg: v }))} />
            <ParamInput label="Límite superanchas (kg)" value={surfaceParameters.legs_superanchas_max_kg} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, legs_superanchas_max_kg: v }))} />
            <ParamInput label="Ancho caño/parante para esquema (mm)" value={surfaceParameters.parantes_tube_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, parantes_tube_discount_mm: v }))} helper="Default 40 mm." />
          </div>
        </div>

        <div className="spacer" />
        <div style={{ border: "1px solid #bbf7d0", borderRadius: 12, padding: 12, background: "#f7fff9" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Medidas de paso y hoja</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <ParamInput label="Paso: descuento alto total (mm)" value={surfaceParameters.paso_height_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_height_discount_mm: v }))} />
            <ParamInput label="Paso ancho - Piernas angostas (mm)" value={surfaceParameters.paso_width_discount_angostas_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_width_discount_angostas_mm: v }))} />
            <ParamInput label="Paso ancho - Piernas comunes (mm)" value={surfaceParameters.paso_width_discount_comunes_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_width_discount_comunes_mm: v }))} />
            <ParamInput label="Paso ancho - Piernas anchas (mm)" value={surfaceParameters.paso_width_discount_anchas_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_width_discount_anchas_mm: v }))} />
            <ParamInput label="Paso ancho - Piernas superanchas (mm)" value={surfaceParameters.paso_width_discount_superanchas_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_width_discount_superanchas_mm: v }))} />
            <ParamInput label="Paso ancho - Piernas especiales (mm)" value={surfaceParameters.paso_width_discount_especiales_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, paso_width_discount_especiales_mm: v }))} />
            <ParamInput label="Hoja: descuento alto desde paso (mm)" value={surfaceParameters.hoja_height_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, hoja_height_discount_mm: v }))} />
            <ParamInput label="IDs/combinaciones que indican rebaje lateral" textarea value={surfaceParameters.hoja_rebaje_lateral_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, hoja_rebaje_lateral_product_ids: v }))} />
            <ParamInput label="Hoja: descuento ancho por rebaje lateral (mm)" value={surfaceParameters.hoja_lateral_rebaje_width_discount_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, hoja_lateral_rebaje_width_discount_mm: v }))} />
          </div>
          <div className="spacer" />
          <div style={{ border: "1px solid #86efac", borderRadius: 12, padding: 12, background: "#ecfdf5" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Parámetros guardados en Supabase</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
              <SavedParamItem label="Paso alto: descuento total (mm)" value={savedSurfaceParameters.paso_height_discount_mm} />
              <SavedParamItem label="Paso ancho: angostas (mm)" value={savedSurfaceParameters.paso_width_discount_angostas_mm} />
              <SavedParamItem label="Paso ancho: comunes (mm)" value={savedSurfaceParameters.paso_width_discount_comunes_mm} />
              <SavedParamItem label="Paso ancho: anchas (mm)" value={savedSurfaceParameters.paso_width_discount_anchas_mm} />
              <SavedParamItem label="Paso ancho: superanchas (mm)" value={savedSurfaceParameters.paso_width_discount_superanchas_mm} />
              <SavedParamItem label="Paso ancho: especiales (mm)" value={savedSurfaceParameters.paso_width_discount_especiales_mm} />
              <SavedParamItem label="Hoja alto: descuento desde paso (mm)" value={savedSurfaceParameters.hoja_height_discount_mm} />
              <SavedParamItem label="IDs rebaje lateral" value={savedSurfaceParameters.hoja_rebaje_lateral_product_ids} />
            </div>
          </div>
        </div>

        <div className="spacer" />
        <div style={{ border: "1px solid #dbeafe", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Orientación de parantes para portones NO apto para revestir</div>
          <div className="muted" style={{ marginBottom: 10 }}>Cargá IDs individuales separados con coma, punto, punto y coma o salto de línea. Para exigir una combinación, usá +.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            <ParamInput label="Vertical si contiene estos IDs/combinaciones" textarea value={surfaceParameters.non_apto_parantes_vertical_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, non_apto_parantes_vertical_product_ids: v }))} />
            <ParamInput label="Horizontal si contiene estos IDs/combinaciones" textarea value={surfaceParameters.non_apto_parantes_horizontal_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, non_apto_parantes_horizontal_product_ids: v }))} />
            <ParamInput label="IDs/combinaciones que indican portón con puerta" textarea value={surfaceParameters.parantes_door_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, parantes_door_product_ids: v }))} />
            <ParamInput label="IDs/combinaciones que indican puerta derecha" textarea value={surfaceParameters.parantes_right_door_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, parantes_right_door_product_ids: v }))} />
            <ParamInput label="IDs/combinaciones que indican puerta izquierda" textarea value={surfaceParameters.parantes_left_door_product_ids} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, parantes_left_door_product_ids: v }))} />
            <ParamInput label="Distancia primer parante con puerta (mm)" value={surfaceParameters.parantes_door_first_distance_mm} onChange={(v) => setSurfaceParameters((prev) => ({ ...prev, parantes_door_first_distance_mm: v }))} />
          </div>
        </div>

        <div className="spacer" />
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Tabla kg/m² para apto para revestir</div>
              <div className="muted">Si el presupuesto incluye uno de estos productos y además es apto para revestir, el sistema usa este kg/m² automáticamente.</div>
            </div>
            <Button onClick={() => setSurfaceParameters((prev) => ({ ...prev, apto_revestir_kg_m2_rules: [...(prev?.apto_revestir_kg_m2_rules || []), newAptoKgRule((prev?.apto_revestir_kg_m2_rules || []).length + 1)] }))}>+ Agregar fila</Button>
          </div>
          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Filtrar productos por sección</div>
              <select value={kgSectionFilter} onChange={(e) => setKgSectionFilter(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                <option value="all">Todas las secciones</option>
                {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              </select>
            </div>
            <ParamInput label="Buscar producto" value={kgProductSearch} onChange={setKgProductSearch} />
          </div>
          <div className="spacer" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aptoKgRules.map((rule, index) => (
              <div key={rule.id || index} style={{ display: "grid", gridTemplateColumns: "minmax(260px, 2fr) minmax(140px, 1fr) auto", gap: 10, alignItems: "end" }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>Producto</div>
                  <select value={rule.product_id || ""} onChange={(e) => {
                    const product = products.find((item) => Number(item.id) === Number(e.target.value));
                    updateAptoKgRuleAt(setSurfaceParameters, index, { product_id: e.target.value ? Number(e.target.value) : "", product_label: product ? productLabel(product) : "" });
                  }} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}>
                    <option value="">Seleccione producto…</option>
                    {productOptions(productsForKgRule(rule))}
                  </select>
                </div>
                <ParamInput label="kg/m²" value={rule.kg_m2 ?? ""} onChange={(v) => updateAptoKgRuleAt(setSurfaceParameters, index, { kg_m2: v })} />
                <Button variant="ghost" onClick={() => removeAptoKgRuleAt(setSurfaceParameters, index)}>Eliminar</Button>
              </div>
            ))}
            {!aptoKgRules.length ? <div className="muted">Todavía no cargaste reglas para apto para revestir.</div> : null}
          </div>
        </div>

        <div className="spacer" />
        <h3 style={{ marginTop: 0 }}>Fórmula de superficie final</h3>
        <textarea value={surfaceFinalFormula} onChange={(e) => setSurfaceFinalFormula(e.target.value)} style={{ width: "100%", minHeight: 96, padding: 10, borderRadius: 10, border: "1px solid #ddd", resize: "vertical", background: "#fff", color: "#111827" }} />
        <div className="muted" style={{ marginTop: 8 }}>Variables útiles: <b>surface_automatica_m2</b>, <b>alto_calculado_mm</b>, <b>ancho_calculado_mm</b>, <b>peso_estimado_kg</b>, <b>kg_m2_porton</b>, <b>instalacion_dentro_vano</b>, <b>instalacion_detras_vano</b>, <b>piernas_angostas</b>, <b>piernas_comunes</b>, <b>piernas_anchas</b>, <b>piernas_superanchas</b>, <b>piernas_especiales</b>.</div>

        <div className="spacer" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={saveSurfaceConfig} disabled={savingSurfaceConfig || rulesQ.isLoading}>{savingSurfaceConfig ? "Guardando..." : "Guardar configuración"}</Button>
          <Button variant="ghost" onClick={reloadSavedSurfaceConfig} disabled={savingSurfaceConfig || rulesQ.isLoading}>Recargar guardados</Button>
        </div>
      </div>
    </div>
  );
}
