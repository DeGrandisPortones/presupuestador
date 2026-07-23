import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";
import { useAuthStore } from "../../../domain/auth/store.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
import {
  adminGetTechnicalMeasurementRules,
  adminRefreshCatalog,
} from "../../../api/admin.js";
import Button from "../../../ui/Button";

const CATALOG_KINDS = new Set(["porton", "ipanel", "plegados", "otros", "puerta"]);
const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const IPANEL_BLOCKED_PLEGADO_PRODUCT_IDS = new Set([4036, 3565]);
const IPANEL_LAMAS_RANGE_MIN_WIDTH_M = 1.13;
const IPANEL_LAMAS_RANGE_MAX_WIDTH_M = 2;
const IPANEL_LAMAS_RANGE_MIN_HEIGHT_M = 2.45;
const IPANEL_LAMAS_RANGE_MAX_HEIGHT_M = 3;
const CATALOG_PRICING_VERSION = 3;
// "Revestimiento especial x m2": al elegirlo pide los kg/m2 al vendedor y ese valor
// reemplaza el peso calculado del porton (y por lo tanto el tipo de piernas).
const REVESTIMIENTO_ESPECIAL_PRODUCT_ID = 4176;

function dflexCatalogDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("DFLEX_DEBUG_COTIZADOR") === "1";
  } catch (_err) {
    return false;
  }
}
function dflexCatalogDebug(action, payload = {}) {
  if (!dflexCatalogDebugEnabled()) return;
  try {
    console.groupCollapsed(`[DFLEX CATALOGO] ${action}`);
    console.log(payload);
    if (payload?.includeStack) console.trace(`[DFLEX CATALOGO] ${action} stack`);
    console.groupEnd();
  } catch (_err) {}
}
function dflexSelectionMapSnapshot(map) {
  try {
    return Array.from((map || new Map()).entries()).map(([sectionId, ids]) => ({ sectionId, productIds: Array.from(ids || []) }));
  } catch (_err) {
    return [];
  }
}
const EXTERIOR_HELP_TEXT = "Siempre observando desde afuera de la vivienda/obra (Exterior).";
const OPEN_SECTION_MEMORY = new Map();



function catalogFlowDebugEnabled() {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search || "");
    return params.get("debugCatalog") === "1" || window.localStorage?.getItem("DFLEX_DEBUG_COTIZADOR") === "1";
  } catch (_err) {
    return false;
  }
}

function formatDebugJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_err) {
    return String(value || "");
  }
}

function CatalogFlowDebugPanel({ data }) {
  if (!catalogFlowDebugEnabled()) return null;
  const text = formatDebugJson(data);
  const copyDebug = async () => {
    try {
      await window.navigator?.clipboard?.writeText(text);
      window.alert("Debug de catálogo copiado al portapapeles.");
    } catch (_err) {
      window.prompt("Copiá este debug", text);
    }
  };
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 84,
          right: 18,
          zIndex: 2147483647,
          border: "2px solid #f59e0b",
          borderRadius: 14,
          background: "#fffbeb",
          color: "#78350f",
          padding: "10px 12px",
          boxShadow: "0 12px 36px rgba(15,23,42,.18)",
          maxWidth: 360,
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 15 }}>DEBUG CATÁLOGO ACTIVO</div>
        <div style={{ marginTop: 4 }}>Si ves este cartel, el ZIP de debug está aplicado.</div>
        <div style={{ marginTop: 6, fontWeight: 800 }}>
          Tipo: {data?.catalogKind || "—"} · Inicial: {data?.initialSectionId || "—"} · Visibles: {Array.isArray(data?.visibleSections) ? data.visibleSections.length : "—"}
        </div>
        <button
          type="button"
          onClick={copyDebug}
          style={{
            marginTop: 8,
            border: "1px solid #f59e0b",
            borderRadius: 10,
            background: "#fff7ed",
            color: "#78350f",
            padding: "7px 10px",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Copiar debug
        </button>
      </div>
      <div style={{ margin: "12px 0", border: "2px solid #f59e0b", borderRadius: 12, background: "#fffbeb", padding: 12 }}>
        <div style={{ fontWeight: 900, color: "#92400e", marginBottom: 8 }}>Debug flujo de secciones</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.35, maxHeight: 320, overflow: "auto" }}>
          {text}
        </pre>
      </div>
    </>
  );
}

function ExteriorHelpButton({ open, onToggle }) {
  return (
    <button
      type="button"
      title="Ver aclaración"
      aria-label="Ver aclaración exterior"
      aria-expanded={open ? "true" : "false"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 999,
        border: "1px solid #c7d2fe",
        background: open ? "#eef2ff" : "#fff",
        color: "#3730a3",
        fontWeight: 900,
        lineHeight: 1,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      ?
    </button>
  );
}

function ExteriorHelpBox() {
  return (
    <div style={{ padding: "0 14px 12px" }}>
      <div style={{ border: "1px solid #dbeafe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 10, padding: "10px 12px", fontWeight: 800 }}>
        {EXTERIOR_HELP_TEXT}
      </div>
    </div>
  );
}

function RevestimientoKgM2Modal({ open, initialValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(initialValue || "");
  useEffect(() => { if (open) setValue(initialValue || ""); }, [open, initialValue]);
  if (!open) return null;
  const parsed = Number(String(value).replace(",", "."));
  const isValid = Number.isFinite(parsed) && parsed > 0;
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          padding: "28px 28px 20px", width: "100%", maxWidth: 380,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
          Revestimiento especial
        </div>
        <div style={{ color: "#555", fontSize: 13, marginBottom: 16 }}>
          Ingresá los Kg/m2 del revestimiento. Este valor reemplaza el peso calculado del portón y define el tipo de piernas.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="muted">Kg/m2</div>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={(e) => setValue(String(e.target.value ?? "").replace(/[^0-9.,]/g, ""))}
            placeholder="Ej: 18"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" disabled={!isValid} onClick={() => onConfirm(parsed)}>Confirmar</Button>
        </div>
      </div>
    </div>
  );
}

function normalizeCatalogKind(kind) {
  const normalized = String(kind || "porton").toLowerCase().trim();
  return CATALOG_KINDS.has(normalized) ? normalized : "porton";
}
function parseDimensionNumber(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function isIpanelLamasMeasureRange(dimensions = {}) {
  const width = parseDimensionNumber(dimensions?.width);
  const height = parseDimensionNumber(dimensions?.height);
  return width >= IPANEL_LAMAS_RANGE_MIN_WIDTH_M
    && width <= IPANEL_LAMAS_RANGE_MAX_WIDTH_M
    && height >= IPANEL_LAMAS_RANGE_MIN_HEIGHT_M
    && height <= IPANEL_LAMAS_RANGE_MAX_HEIGHT_M;
}
function productMatchesIdSet(product = {}, idSet) {
  return collectProductIdsFromProduct(product).some((id) => idSet.has(Number(id)));
}

function openSectionStorageKey(kind) {
  return `presupuestador.sectionCatalog.openSection.${String(kind || "porton").trim().toLowerCase()}`;
}

function readStoredOpenSectionId(kind) {
  const key = String(kind || "porton").trim().toLowerCase();
  const memoryValue = Number(OPEN_SECTION_MEMORY.get(key) || 0);
  if (Number.isFinite(memoryValue) && memoryValue > 0) return memoryValue;
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(openSectionStorageKey(kind));
    const value = Number(raw || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch (_err) {
    return null;
  }
}

function writeStoredOpenSectionId(kind, sectionId) {
  const key = String(kind || "porton").trim().toLowerCase();
  const value = Number(sectionId || 0);
  if (Number.isFinite(value) && value > 0) OPEN_SECTION_MEMORY.set(key, value);
  else OPEN_SECTION_MEMORY.delete(key);
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    if (Number.isFinite(value) && value > 0) {
      window.sessionStorage.setItem(openSectionStorageKey(kind), String(value));
    } else {
      window.sessionStorage.removeItem(openSectionStorageKey(kind));
    }
  } catch (_err) {
    // No bloquear la UI si el navegador no permite sessionStorage.
  }
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getClientFacingProductName(product) {
  return (
    product?.client_display_name ||
    product?.raw_name ||
    product?.original_name ||
    product?.name ||
    ""
  );
}

function getProductLabel(product) {
  return (
    product?.display_name ||
    product?.alias ||
    product?.internal_alias ||
    getClientFacingProductName(product)
  );
}

function syncQuoteLinesFromCatalogProducts(products = []) {
  const byId = new Map(
    (Array.isArray(products) ? products : [])
      .map((product) => [Number(product?.id), product])
      .filter(([id]) => Number.isFinite(id) && id > 0)
  );

  if (!byId.size) return;

  useQuoteStore.setState((state) => {
    const currentLines = Array.isArray(state?.lines) ? state.lines : [];
    const nextLines = currentLines.map((line) => {
      const product = byId.get(Number(line?.product_id));
      if (!product) return line;

      const nextRawName = getClientFacingProductName(product) || line?.raw_name || null;
      const nextName = getProductLabel(product) || line?.name || null;

      return {
        ...line,
        odoo_external_id: Number(product?.odoo_variant_id || line?.odoo_external_id || line?.product_id || 0) || 0,
        odoo_variant_id: Number(product?.odoo_variant_id || line?.odoo_variant_id || line?.odoo_external_id || line?.product_id || 0) || 0,
        odoo_id: Number(product?.odoo_id || line?.odoo_id || 0) || 0,
        odoo_template_id: Number(product?.odoo_template_id || line?.odoo_template_id || 0) || 0,
        name: nextName,
        raw_name: nextRawName,
        code: product?.code ?? line?.code ?? null,
      };
    });

    return { lines: nextLines };
  });
}

function getVisibleOdooId(product) {
  return Number(product?.odoo_id || product?.odoo_template_id || product?.id || 0) || 0;
}

function collectProductIdsFromProduct(product = {}) {
  return [
    product?.id,
    product?.product_id,
    product?.odoo_id,
    product?.odoo_product_id,
    product?.odoo_template_id,
    product?.odoo_variant_id,
    product?.odoo_external_id,
  ]
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function resolveProductPricingId(product = {}) {
  const candidates = [
    product?.odoo_variant_id,
    product?.odoo_external_id,
    product?.odoo_product_id,
    product?.odoo_id,
    product?.odoo_template_id,
    product?.product_id,
    product?.id,
  ];
  for (const value of candidates) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return 0;
}
function normalizePriceContext(pricelistId, partnerId) {
  const pl = Number(pricelistId || 0);
  const partner = Number(partnerId || 0);
  return {
    pricelist_id: Number.isFinite(pl) && pl > 0 ? Math.trunc(pl) : null,
    partner_id: Number.isFinite(partner) && partner > 0 ? Math.trunc(partner) : null,
  };
}
function pricingContextMatches(boot, pricelistId, partnerId) {
  const expected = normalizePriceContext(pricelistId, partnerId);
  const actual = normalizePriceContext(boot?.pricing_context?.pricelist_id, boot?.pricing_context?.partner_id);
  return Number(boot?.pricing_context?.version || 0) === CATALOG_PRICING_VERSION
    && !!expected.pricelist_id
    && actual.pricelist_id === expected.pricelist_id
    && (actual.partner_id || null) === (expected.partner_id || null);
}
function prepareCatalogForPricelistContext(data, { pricelistId, partnerId }) {
  const products = Array.isArray(data?.products) ? data.products : [];
  const context = normalizePriceContext(pricelistId, partnerId);

  // No precalculamos todo el catálogo contra Odoo: en catálogos grandes esa llamada
  // puede superar el timeout del navegador. En cambio, marcamos el catálogo como
  // perteneciente a la lista correcta y dejamos los productos sin precio inicial.
  // El precio real se pide sólo para los productos seleccionados, usando el
  // pricelist_id correcto. Así nunca se muestra primero la lista predeterminada.
  const safeProducts = products.map((product) => ({
    ...product,
    price: 0,
    basePrice: 0,
    base_price: 0,
    list_price: 0,
    listPrice: 0,
    price_predeterminado: 0,
    price_list: 0,
    price_pending: true,
    price_unresolved: true,
    price_pricelist_id: context.pricelist_id,
    price_partner_id: context.partner_id,
  }));

  return {
    ...(data || {}),
    products: safeProducts,
    pricing_context: { ...context, version: CATALOG_PRICING_VERSION, mode: "selected-lines" },
  };
}


function collectProductIdsFromLine(line = {}) {
  return [
    line?.product_id,
    line?.id,
    line?.odoo_id,
    line?.odoo_product_id,
    line?.odoo_template_id,
    line?.odoo_variant_id,
    line?.odoo_external_id,
  ]
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function buildCatalogSelectionKey(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => [
      Number(line?.product_id || 0) || 0,
      Number(line?.id || 0) || 0,
      Number(line?.odoo_id || 0) || 0,
      Number(line?.odoo_template_id || 0) || 0,
      Number(line?.odoo_variant_id || 0) || 0,
      Number(line?.odoo_external_id || 0) || 0,
    ].join(","))
    .filter((part) => part !== "0,0,0,0,0,0")
    .sort()
    .join("|");
}

function parseCatalogSelectionKey(key) {
  const text = String(key || "").trim();
  if (!text) return [];
  return text.split("|").filter(Boolean).map((part, index) => {
    const [product_id, id, odoo_id, odoo_template_id, odoo_variant_id, odoo_external_id] = part.split(",").map((value) => Number(value || 0) || 0);
    return {
      product_id,
      id,
      odoo_id,
      odoo_template_id,
      odoo_variant_id,
      odoo_external_id,
      line_key: `selection-${index}-${product_id}`,
    };
  });
}

function findProductByAnyId(products = [], targetId) {
  const id = Number(targetId || 0);
  if (!id) return null;
  return (Array.isArray(products) ? products : []).find((product) => collectProductIdsFromProduct(product).includes(id)) || null;
}

function isDisabledForUser(product, user) {
  if (!product || !user) return false;
  const disableForVendedor = !!product.disable_for_vendedor;
  const disableForDistribuidor = !!product.disable_for_distribuidor;
  if (user?.is_vendedor && disableForVendedor) return true;
  if (user?.is_distribuidor && disableForDistribuidor) return true;
  return false;
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : [])
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0);
}

function matchProductIds(selectedIds, requiredIds, matchMode = "any") {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const required = normalizeIdList(requiredIds);
  if (!required.length) return false;
  if (String(matchMode || "any").trim().toLowerCase() === "all") {
    return required.every((id) => selected.has(id));
  }
  return required.some((id) => selected.has(id));
}

function dependencyRuleMatchesSelection(selectedIds, rule = {}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const requiredIds = normalizeIdList(rule?.required_product_ids);

  // En el dashboard, la condición "Si elige cualquier producto de la sección"
  // se guarda sin IDs requeridos. En ese caso, la regla debe activarse con
  // cualquier selección dentro de la sección padre.
  if (!requiredIds.length) return selected.size > 0;

  return matchProductIds(selected, requiredIds, rule?.match_mode || "any");
}

function parseTriggerGroups(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(/[;,\n]+/)
    .flatMap((part) => String(part || "").trim().split(/\s+/))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split("+").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0))
    .filter((group) => group.length > 0);
}

function triggerGroupsMatch(selectedIds, triggerText) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const groups = parseTriggerGroups(triggerText);
  return groups.some((group) => group.every((id) => selected.has(id)));
}

function hasSurfaceParamContent(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function getRulesSurfaceParameters(rulesData = {}) {
  const root = rulesData || {};
  return {
    ...(hasSurfaceParamContent(root.measurement_surface_params) ? root.measurement_surface_params : {}),
    ...(hasSurfaceParamContent(root.surface_params) ? root.surface_params : {}),
    ...(hasSurfaceParamContent(root.surface_calc_params) ? root.surface_calc_params : {}),
    ...(hasSurfaceParamContent(root.surface_parameters) ? root.surface_parameters : {}),
    ...(hasSurfaceParamContent(root.parantes_config) ? root.parantes_config : {}),
  };
}

function normalizeAutoBudgetRules(surfaceParameters = {}) {
  const rawJson = String(surfaceParameters?.auto_budget_product_rules_json || "").trim();
  let parsed = [];
  if (rawJson) {
    try {
      parsed = JSON.parse(rawJson);
    } catch (_err) {
      parsed = [];
    }
  }

  const rules = (Array.isArray(parsed) ? parsed : [])
    .map((rule, index) => ({
      id: String(rule?.id || `auto_budget_rule_${index + 1}`),
      name: String(rule?.name || `Automatización #${index + 1}`).trim(),
      active: rule?.active !== false,
      trigger_product_ids: String(rule?.trigger_product_ids || rule?.trigger_ids || "").trim(),
      target_product_id: Number(rule?.target_product_id || rule?.product_id || rule?.target_odoo_id || 0) || null,
      target_product_label: String(rule?.target_product_label || rule?.product_label || "").trim(),
      quantity_mode: String(rule?.quantity_mode || "unit").trim().toLowerCase() === "surface" ? "surface" : "unit",
      only_apto_revestir: rule?.only_apto_revestir !== false,
    }))
    .filter((rule) => rule.trigger_product_ids && rule.target_product_id);

  const legacyTriggerText = String(surfaceParameters?.apto_revestir_profile_trigger_product_ids || "").trim();
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

function cloneSelectionMap(sectionList, selectedProductIdsBySection) {
  const map = new Map();
  for (const section of sectionList) {
    const sid = Number(section.id);
    map.set(sid, new Set(selectedProductIdsBySection.get(sid) || []));
  }
  return map;
}

function computeOrderedSectionIds({
  kind,
  sectionList,
  sectionMap,
  initialSectionId,
  dependencyRules,
  selectedProductIdsBySection,
}) {
  void kind;
  if (!sectionList.length) return [];

  const activeDependencyRules = (Array.isArray(dependencyRules) ? dependencyRules : [])
    .filter((rule) => rule?.active !== false);

  if (!initialSectionId && !activeDependencyRules.length) {
    return sectionList.map((section) => Number(section.id));
  }

  const startId =
    initialSectionId && sectionMap.has(Number(initialSectionId))
      ? Number(initialSectionId)
      : null;

  if (!startId) return [];

  const ordered = [startId];
  const seen = new Set(ordered);

  let changed = true;
  let guard = 0;
  while (changed && guard < 30) {
    changed = false;
    guard += 1;

    for (const currentSectionId of [...ordered]) {
      const selectedInParent =
        selectedProductIdsBySection.get(Number(currentSectionId)) || new Set();

      for (const rule of activeDependencyRules) {
        const parentSectionId = Number(rule?.parent_section_id || 0);
        if (parentSectionId !== Number(currentSectionId)) continue;

        if (!dependencyRuleMatchesSelection(selectedInParent, rule)) {
          continue;
        }

        for (const childSectionId of normalizeIdList(rule?.child_section_ids)) {
          if (!sectionMap.has(childSectionId) || seen.has(childSectionId)) continue;
          ordered.push(childSectionId);
          seen.add(childSectionId);
          changed = true;
        }
      }
    }
  }

  return ordered;
}

export default function SectionCatalog({ kind = "porton", onDownloadPresupuesto = null }) {
  const catalogKind = normalizeCatalogKind(kind);

  const addLine = useQuoteStore((s) => s.addLine);
  const forceRemoveLine = useQuoteStore((s) => s.forceRemoveLine);
  const pricelistId = useQuoteStore((s) => s.pricelistId);
  const partnerId = useQuoteStore((s) => s.partnerId);
  const catalogSelectionKey = useQuoteStore((s) => buildCatalogSelectionKey(s.lines));
  const lines = useMemo(() => parseCatalogSelectionKey(catalogSelectionKey), [catalogSelectionKey]);
  const dimensions = useQuoteStore((s) => s.dimensions);
  const setDimensions = useQuoteStore((s) => s.setDimensions);
  const portonType = useQuoteStore((s) => s.portonType);
  const setPortonType = useQuoteStore((s) => s.setPortonType);

  const user = useAuthStore((s) => s.user);

  const [boot, setBoot] = useState(null);
  const [openSectionId, setOpenSectionIdState] = useState(() => readStoredOpenSectionId(catalogKind));
  const setOpenSectionId = useCallback((nextValue) => {
    setOpenSectionIdState((prevValue) => {
      const resolved = typeof nextValue === "function" ? nextValue(prevValue) : nextValue;
      writeStoredOpenSectionId(catalogKind, resolved);
      return resolved;
    });
  }, [catalogKind]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoloadAttempted, setAutoloadAttempted] = useState(false);
  const [catalogHelpOpen, setCatalogHelpOpen] = useState(true);
  const sectionRefs = useRef(new Map());
  const pendingAutoScrollSectionIdRef = useRef(null);
  const autoScrollTimeoutRef = useRef(null);

  const sections = Array.isArray(boot?.sections) ? boot.sections : [];
  const products = Array.isArray(boot?.products) ? boot.products : [];
  const catalogPricingReady = !!user
    && !!Number(pricelistId || 0)
    && (!user?.is_distribuidor || !user?.odoo_partner_id || !!partnerId);
  const shouldHideIpanelPlegado4036 = catalogKind === "ipanel" && isIpanelLamasMeasureRange(dimensions);

  const scrollToSection = useCallback((sectionId) => {
    const id = Number(sectionId || 0);
    if (!id) return;

    const run = () => {
      const target = sectionRefs.current.get(id);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const top = Math.max(0, window.scrollY + rect.top - 96);
      window.scrollTo({ top, behavior: "smooth" });
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
      return;
    }
    run();
  }, []);

  const openSectionAndScroll = useCallback((sectionId) => {
    const id = Number(sectionId || 0);
    if (!id) return;
    pendingAutoScrollSectionIdRef.current = id;
    setOpenSectionId(id);
  }, []);

  useEffect(() => {
    const pendingId = Number(pendingAutoScrollSectionIdRef.current || 0);
    if (!pendingId || Number(openSectionId || 0) !== pendingId) return undefined;

    if (autoScrollTimeoutRef.current) {
      window.clearTimeout(autoScrollTimeoutRef.current);
    }

    autoScrollTimeoutRef.current = window.setTimeout(() => {
      scrollToSection(pendingId);
      pendingAutoScrollSectionIdRef.current = null;
      autoScrollTimeoutRef.current = null;
    }, 90);

    return () => {
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
  }, [openSectionId, scrollToSection]);

  useEffect(() => {
    return () => {
      if (autoScrollTimeoutRef.current) {
        window.clearTimeout(autoScrollTimeoutRef.current);
        autoScrollTimeoutRef.current = null;
      }
    };
  }, []);

  const rulesQ = useQuery({
    queryKey: ["technical-rules-for-section-catalog", catalogKind],
    queryFn: () => adminGetTechnicalMeasurementRules(catalogKind),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled: !!catalogKind,
  });

  const initialSectionId = Number(rulesQ.data?.initial_section_id || 0) || null;
  const surfaceParameters = useMemo(() => getRulesSurfaceParameters(rulesQ.data || {}), [rulesQ.data]);
  const autoBudgetProductRules = useMemo(() => normalizeAutoBudgetRules(surfaceParameters), [surfaceParameters]);

  const dependencyRules = useMemo(() => {
    const raw = Array.isArray(rulesQ.data?.section_dependency_rules)
      ? rulesQ.data.section_dependency_rules
      : [];
    return raw
      .filter((rule) => rule?.active !== false)
      .slice()
      .sort(
        (a, b) =>
          Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
          String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
      );
  }, [rulesQ.data]);

  const hasSectionFlowConfig = !!initialSectionId || dependencyRules.length > 0;
  const shouldUseSectionFlow = catalogKind === "puerta" || hasSectionFlowConfig;


  const systemRules = useMemo(() => {
    if (catalogKind !== "porton") return [];
    const raw = Array.isArray(rulesQ.data?.system_derivation_rules)
      ? rulesQ.data.system_derivation_rules
      : [];
    return raw
      .filter((rule) => rule?.active !== false)
      .slice()
      .sort(
        (a, b) =>
          Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
          String(a?.name || "").localeCompare(String(b?.name || ""), "es"),
      );
  }, [catalogKind, rulesQ.data]);

  const refreshCatalog = useCallback(async () => {
    if (!catalogPricingReady) return;
    setRefreshing(true);
    try {
      await adminRefreshCatalog();
      const data = await getCatalogBootstrap(catalogKind);
      const pricedData = prepareCatalogForPricelistContext(data, { pricelistId, partnerId });
      setOdooBootstrap(pricedData, catalogKind);
      setBoot(pricedData);
      syncQuoteLinesFromCatalogProducts(pricedData?.products || []);
    } finally {
      setRefreshing(false);
      setAutoloadAttempted(true);
    }
  }, [catalogKind, catalogPricingReady, pricelistId, partnerId]);

  useEffect(() => {
    const cached = getOdooBootstrap(catalogKind);
    setBoot(catalogPricingReady && pricingContextMatches(cached, pricelistId, partnerId) ? cached : null);
    setAutoloadAttempted(false);
    setOpenSectionIdState(readStoredOpenSectionId(catalogKind));
    sectionRefs.current.clear();
    pendingAutoScrollSectionIdRef.current = null;
  }, [catalogKind, catalogPricingReady, pricelistId, partnerId]);

  useEffect(() => {
    if (autoloadAttempted || !catalogPricingReady) return;
    const cached = getOdooBootstrap(catalogKind);
    if (pricingContextMatches(cached, pricelistId, partnerId)) {
      setBoot(cached);
      syncQuoteLinesFromCatalogProducts(cached?.products || []);
      setAutoloadAttempted(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setRefreshing(true);
        const data = await getCatalogBootstrap(catalogKind);
        const pricedData = prepareCatalogForPricelistContext(data, { pricelistId, partnerId });
        if (cancelled) return;
        setOdooBootstrap(pricedData, catalogKind);
        setBoot(pricedData);
        syncQuoteLinesFromCatalogProducts(pricedData?.products || []);
      } finally {
        if (!cancelled) {
          setRefreshing(false);
          setAutoloadAttempted(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoloadAttempted, catalogKind, catalogPricingReady, pricelistId, partnerId]);

  useEffect(() => {
    syncQuoteLinesFromCatalogProducts(products);
  }, [products]);

  const sectionList = useMemo(() => {
    return [...sections].sort(
      (a, b) =>
        Number(a.position || 0) - Number(b.position || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""), "es"),
    );
  }, [sections]);

  const sectionMap = useMemo(
    () => new Map(sectionList.map((section) => [Number(section.id), section])),
    [sectionList],
  );

  const productsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sectionList) map.set(Number(section.id), []);
    for (const product of products) {
      const sectionIds = Array.isArray(product.section_ids) ? product.section_ids : [];
      for (const rawSectionId of sectionIds) {
        const sectionId = Number(rawSectionId);
        if (map.has(sectionId)) map.get(sectionId).push(product);
      }
    }
    return map;
  }, [products, sectionList]);

  const selectedProductIdsGlobalKey = useMemo(() => {
    const ids = (Array.isArray(lines) ? lines : [])
      .map((line) => Number(line?.product_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    return [...new Set(ids)].sort((a, b) => a - b).join("|");
  }, [lines]);

  const selectedProductIdsGlobal = useMemo(() => {
    if (!selectedProductIdsGlobalKey) return new Set();
    return new Set(
      selectedProductIdsGlobalKey
        .split("|")
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  }, [selectedProductIdsGlobalKey]);

  const selectedProductIdsForAutomationKey = useMemo(() => {
    const ids = [];
    for (const line of Array.isArray(lines) ? lines : []) ids.push(...collectProductIdsFromLine(line));
    return [...new Set(ids.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0).map((id) => Number(id)))]
      .sort((a, b) => a - b)
      .join("|");
  }, [lines]);

  const selectedProductIdsForAutomation = useMemo(() => {
    if (!selectedProductIdsForAutomationKey) return new Set();
    return new Set(
      selectedProductIdsForAutomationKey
        .split("|")
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  }, [selectedProductIdsForAutomationKey]);

  const selectedProductIdsBySection = useMemo(() => {
    const map = new Map();
    for (const section of sectionList) map.set(Number(section.id), new Set());

    for (const [sectionId, sectionProducts] of productsBySection.entries()) {
      for (const product of sectionProducts) {
        const productId = Number(product?.id || 0);
        if (productId && selectedProductIdsGlobal.has(productId)) {
          map.get(Number(sectionId))?.add(productId);
        }
      }
    }
    return map;
  }, [selectedProductIdsGlobalKey, selectedProductIdsGlobal, productsBySection, sectionList]);

  const orderedVisibleSectionIds = useMemo(() => {
    if (rulesQ.isLoading || rulesQ.isFetching) return [];

    const ordered = computeOrderedSectionIds({
      kind: catalogKind,
      sectionList,
      sectionMap,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection,
    });

    if (ordered.length) return ordered;

    // Para catálogos configurados por secciones dependientes, no mostramos
    // todas las secciones como fallback porque rompe el flujo de carga.
    if (shouldUseSectionFlow) return [];

    return sectionList.map((section) => Number(section.id));
  }, [rulesQ.isLoading, rulesQ.isFetching, catalogKind, sectionList, sectionMap, initialSectionId, dependencyRules, selectedProductIdsBySection, shouldUseSectionFlow]);

  const visibleSections = useMemo(
    () => orderedVisibleSectionIds.map((id) => sectionMap.get(Number(id))).filter(Boolean),
    [orderedVisibleSectionIds, sectionMap],
  );

  const terminalStepCompleted = useMemo(() => {
    if (!visibleSections.length) return false;
    const lastSection = visibleSections[visibleSections.length - 1];
    if (!lastSection) return false;
    const selected = selectedProductIdsBySection.get(Number(lastSection.id));
    return !!selected && selected.size > 0;
  }, [visibleSections, selectedProductIdsBySection]);

  const isAptoParaRevestir = useMemo(() => {
    const normalizedType = norm(portonType);
    if (normalizedType === APTOS_PARA_REVESTIR_TYPE || normalizedType.includes("para_revestir") || normalizedType.includes("apto")) return true;
    if (selectedProductIdsForAutomation.has(REVESTIMIENTO_ESPECIAL_PRODUCT_ID)) return true;
    const aptoProductId = Number(surfaceParameters?.no_cladding_product_id || 0);
    return !!(aptoProductId && selectedProductIdsForAutomation.has(aptoProductId));
  }, [portonType, selectedProductIdsForAutomationKey, selectedProductIdsForAutomation, surfaceParameters]);

  const [revestimientoKgModalOpen, setRevestimientoKgModalOpen] = useState(false);
  const hasRevestimientoEspecial = selectedProductIdsGlobal.has(REVESTIMIENTO_ESPECIAL_PRODUCT_ID);
  useEffect(() => {
    if (!hasRevestimientoEspecial) {
      if (dimensions?.revestimiento_especial_kg_m2) setDimensions({ revestimiento_especial_kg_m2: "", kg_m2: "" });
      setRevestimientoKgModalOpen(false);
      return;
    }
    if (!dimensions?.revestimiento_especial_kg_m2) setRevestimientoKgModalOpen(true);
  }, [hasRevestimientoEspecial, dimensions?.revestimiento_especial_kg_m2, setDimensions]);
  function confirmRevestimientoKg(kgM2) {
    setDimensions({ revestimiento_especial_kg_m2: kgM2, kg_m2: kgM2 });
    setRevestimientoKgModalOpen(false);
  }
  function cancelRevestimientoKg() {
    forceRemoveLine(REVESTIMIENTO_ESPECIAL_PRODUCT_ID);
    setDimensions({ revestimiento_especial_kg_m2: "", kg_m2: "" });
    setRevestimientoKgModalOpen(false);
  }

  useEffect(() => {
    if (catalogKind !== "porton") return;

    let derivedType = "";
    for (const rule of systemRules) {
      if (
        matchProductIds(
          selectedProductIdsGlobal,
          rule?.required_product_ids,
          rule?.match_mode || "all",
        )
      ) {
        derivedType = String(rule?.derived_porton_type || "").trim();
        break;
      }
    }

    if (derivedType !== String(portonType || "")) {
      setPortonType(derivedType);
    }
  }, [catalogKind, systemRules, selectedProductIdsGlobalKey, selectedProductIdsGlobal, portonType, setPortonType]);

  useEffect(() => {
    if (catalogKind !== "porton" || !products.length || !autoBudgetProductRules.length) return;

    const desiredProductIds = new Set();

    for (const rule of autoBudgetProductRules) {
      if (rule?.active === false) continue;
      if (rule?.only_apto_revestir !== false && !isAptoParaRevestir) continue;
      if (!triggerGroupsMatch(selectedProductIdsForAutomation, rule?.trigger_product_ids)) continue;

      const product = findProductByAnyId(products, rule?.target_product_id);
      if (!product) continue;

      const productId = Number(product.id || 0);
      if (!productId) continue;
      desiredProductIds.add(productId);

      const isAlreadySelected = selectedProductIdsGlobal.has(productId);
      if (!isAlreadySelected) {
        addLine({
          ...product,
          name: getProductLabel(product) || rule.target_product_label || `Producto ${productId}`,
          raw_name: getClientFacingProductName(product) || rule.target_product_label || getProductLabel(product) || `Producto ${productId}`,
          uses_surface_quantity: rule.quantity_mode === "surface",
        });
      }
    }

    const possibleTargetProductIds = new Set();
    for (const rule of autoBudgetProductRules) {
      const product = findProductByAnyId(products, rule?.target_product_id);
      if (product?.id) possibleTargetProductIds.add(Number(product.id));
    }

    const currentLineProductIds = selectedProductIdsGlobal;

    for (const productId of possibleTargetProductIds) {
      if (!desiredProductIds.has(productId) && currentLineProductIds.has(productId)) {
        dflexCatalogDebug("autoBudget:forceRemoveLine", {
          productId,
          desiredProductIds: Array.from(desiredProductIds),
          possibleTargetProductIds: Array.from(possibleTargetProductIds),
          currentLineProductIds: Array.from(currentLineProductIds),
          selectedProductIdsForAutomation: Array.from(selectedProductIdsForAutomation || []),
          isAptoParaRevestir,
          includeStack: true,
        });
        forceRemoveLine(productId);
      }
    }
  }, [catalogKind, products, autoBudgetProductRules, selectedProductIdsForAutomationKey, selectedProductIdsForAutomation, selectedProductIdsGlobalKey, selectedProductIdsGlobal, isAptoParaRevestir, addLine, forceRemoveLine]);

  useEffect(() => {
    if (!shouldHideIpanelPlegado4036) return;
    if (!selectedProductIdsGlobal.has(4036) && !selectedProductIdsGlobal.has(3565)) return;
    forceRemoveLine(4036);
    forceRemoveLine(3565);
  }, [shouldHideIpanelPlegado4036, selectedProductIdsGlobalKey, selectedProductIdsGlobal, forceRemoveLine]);

  useEffect(() => {
    if (!visibleSections.length) return;

    const visibleIds = new Set(visibleSections.map((section) => Number(section.id)));
    const currentOpenSectionId = Number(openSectionId || 0) || null;
    if (currentOpenSectionId && visibleIds.has(currentOpenSectionId)) return;

    const rememberedSectionId = Number(readStoredOpenSectionId(catalogKind) || 0) || null;
    if (rememberedSectionId && visibleIds.has(rememberedSectionId)) {
      setOpenSectionId(rememberedSectionId);
      return;
    }

    const firstVisibleSectionId = Number(visibleSections[0]?.id || 0) || null;
    if (firstVisibleSectionId) {
      dflexCatalogDebug("openSection:fallbackToFirst", {
        catalogKind,
        openSectionId,
        visibleSectionIds: visibleSections.map((section) => Number(section.id)),
        selectedProductIdsBySection: dflexSelectionMapSnapshot(selectedProductIdsBySection),
        includeStack: true,
      });
      setOpenSectionId(firstVisibleSectionId);
    }
  }, [visibleSections, openSectionId, catalogKind, setOpenSectionId, selectedProductIdsBySection]);

  function selectProductForSection(sectionId, product) {
    const currentSelected = selectedProductIdsBySection.get(Number(sectionId)) || new Set();
    const targetProductId = Number(product?.id);
    dflexCatalogDebug("selectProductForSection:start", {
      sectionId: Number(sectionId),
      targetProductId,
      productName: getProductLabel(product),
      currentSelected: Array.from(currentSelected),
      selectedProductIdsBySection: dflexSelectionMapSnapshot(selectedProductIdsBySection),
      includeStack: true,
    });

    const sectionProductIds = new Set(
      (productsBySection.get(Number(sectionId)) || [])
        .map((item) => Number(item.id))
        .filter(Boolean),
    );
    const currentSelectedIds = [...currentSelected].filter((id) => id !== targetProductId);

    const currentIndex = orderedVisibleSectionIds.findIndex((id) => Number(id) === Number(sectionId));
    const downstreamSectionIds =
      currentIndex >= 0 ? orderedVisibleSectionIds.slice(currentIndex + 1) : [];
    const hasDownstreamSelections = downstreamSectionIds.some((sid) => {
      const selected = selectedProductIdsBySection.get(Number(sid));
      return selected && selected.size > 0;
    });

    if (currentSelected.has(targetProductId) && currentSelected.size === 1) {
      const nextSectionId = downstreamSectionIds[0] || null;
      if (nextSectionId) openSectionAndScroll(nextSectionId);
      return;
    }

    if (currentSelectedIds.length > 0 && hasDownstreamSelections) {
      const ok = window.confirm(
        "Si cambiás este producto, vas a tener que volver a cargar las secciones siguientes. ¿Deseás continuar?",
      );
      if (!ok) return;
    }

    const nextSelectionMap = cloneSelectionMap(sectionList, selectedProductIdsBySection);

    for (const productId of sectionProductIds) {
      forceRemoveLine(productId);
      nextSelectionMap.get(Number(sectionId))?.delete(Number(productId));
    }

    if (hasDownstreamSelections) {
      for (const downstreamSectionId of downstreamSectionIds) {
        const selectedDownstream = [
          ...(nextSelectionMap.get(Number(downstreamSectionId)) || new Set()),
        ];
        for (const productId of selectedDownstream) {
          forceRemoveLine(productId);
          nextSelectionMap.get(Number(downstreamSectionId))?.delete(Number(productId));
        }
      }
    }

    addLine({
      ...product,
      name: getProductLabel(product),
      raw_name: getClientFacingProductName(product),
    });

    if (product?.no_permanent_stock) {
      window.alert(
        "El producto seleccionado no se encuentra en stock permanente. Los tiempos de producción pueden extenderse considerablemente."
      );
    }

    nextSelectionMap.set(Number(sectionId), new Set([targetProductId]));

    const nextOrderedIds = computeOrderedSectionIds({
      kind: catalogKind,
      sectionList,
      sectionMap,
      initialSectionId,
      dependencyRules,
      selectedProductIdsBySection: nextSelectionMap,
    });

    const nextIndex = nextOrderedIds.findIndex((id) => Number(id) === Number(sectionId));
    const nextSectionId = nextIndex >= 0 ? nextOrderedIds[nextIndex + 1] : null;

    if (nextSectionId) openSectionAndScroll(nextSectionId);
  }

  const catalogFlowDebugData = useMemo(() => ({
    catalogKind,
    catalogPricingReady,
    rulesLoading: !!rulesQ.isLoading,
    rulesFetching: !!rulesQ.isFetching,
    rulesError: rulesQ.error?.message || null,
    rulesInitialSectionIdRaw: rulesQ.data?.initial_section_id ?? null,
    initialSectionId,
    dependencyRulesCount: dependencyRules.length,
    dependencyRules: dependencyRules.map((rule) => ({
      id: rule?.id,
      name: rule?.name,
      active: rule?.active !== false,
      parent_section_id: Number(rule?.parent_section_id || 0) || null,
      required_product_ids: normalizeIdList(rule?.required_product_ids),
      match_mode: rule?.match_mode || "any",
      child_section_ids: normalizeIdList(rule?.child_section_ids),
    })),
    hasSectionFlowConfig,
    shouldUseSectionFlow,
    sections: sectionList.map((section) => ({ id: Number(section.id), name: section.name })),
    selectedProductIdsBySection: Array.from(selectedProductIdsBySection.entries()).map(([sectionId, ids]) => ({
      sectionId: Number(sectionId),
      selectedProductIds: Array.from(ids || []).map(Number),
    })),
    orderedVisibleSectionIds,
    visibleSections: visibleSections.map((section) => ({ id: Number(section.id), name: section.name })),
    openSectionId: Number(openSectionId || 0) || null,
  }), [
    catalogKind,
    catalogPricingReady,
    rulesQ.isLoading,
    rulesQ.isFetching,
    rulesQ.error,
    rulesQ.data,
    initialSectionId,
    dependencyRules,
    hasSectionFlowConfig,
    shouldUseSectionFlow,
    sectionList,
    selectedProductIdsBySection,
    orderedVisibleSectionIds,
    visibleSections,
    openSectionId,
  ]);

  const title =
    catalogKind === "porton"
      ? "Características del portón"
      : catalogKind === "ipanel"
        ? "Características del Ipanel"
        : catalogKind === "plegados"
          ? "Características de Plegados"
          : catalogKind === "puerta"
            ? "Características de Puertas"
            : "Características / productos";

  if (!boot) {
    return (
      <div>
        <div className="dg-row dg-row--between dg-row--center">
          <h3 className="dg-h3">{title}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" disabled={refreshing || !catalogPricingReady} onClick={refreshCatalog}>
              {refreshing ? "Cargando…" : "Actualizar catálogo"}
            </Button>
            {catalogKind === "porton" ? (
              <ExteriorHelpButton open={catalogHelpOpen} onToggle={() => setCatalogHelpOpen((prev) => !prev)} />
            ) : null}
          </div>
        </div>
        {catalogKind === "porton" && catalogHelpOpen ? <ExteriorHelpBox /> : null}
        <CatalogFlowDebugPanel data={catalogFlowDebugData} />
        <div className="spacer" />
        <div className="muted">
          {!catalogPricingReady
            ? "Esperando lista de precios del usuario antes de cargar el catálogo…"
            : refreshing
              ? "Cargando catálogo con la lista de precios del usuario…"
              : "No se pudo cargar el catálogo con la lista de precios del usuario. Podés reintentar con el botón de actualizar."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dg-row dg-row--between dg-row--center">
        <h3 className="dg-h3">{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button variant="ghost" disabled={refreshing || !catalogPricingReady} onClick={refreshCatalog}>
            {refreshing ? "Actualizando…" : "Actualizar catálogo"}
          </Button>
          {catalogKind === "porton" ? (
            <ExteriorHelpButton open={catalogHelpOpen} onToggle={() => setCatalogHelpOpen((prev) => !prev)} />
          ) : null}
        </div>
      </div>
      {catalogKind === "porton" && catalogHelpOpen ? <ExteriorHelpBox /> : null}
      <RevestimientoKgM2Modal
        open={revestimientoKgModalOpen}
        initialValue={dimensions?.revestimiento_especial_kg_m2 || ""}
        onConfirm={confirmRevestimientoKg}
        onCancel={cancelRevestimientoKg}
      />
      <CatalogFlowDebugPanel data={catalogFlowDebugData} />

      {!visibleSections.length ? (
        <>
          <div className="spacer" />
          <div className="muted">
            {rulesQ.isLoading || rulesQ.isFetching
              ? "Cargando flujo de secciones del catálogo…"
              : "No hay secciones habilitadas todavía. Configurá la sección inicial y sus dependencias desde el dashboard."}
          </div>
        </>
      ) : (
        <div className="dg-accordion">
          {visibleSections.map((section) => {
            const sectionId = Number(section.id);
            const isOpen = openSectionId === sectionId;
            const rawSectionProducts = productsBySection.get(sectionId) || [];
            const sectionProducts = shouldHideIpanelPlegado4036
              ? rawSectionProducts.filter((product) => !productMatchesIdSet(product, IPANEL_BLOCKED_PLEGADO_PRODUCT_IDS))
              : rawSectionProducts;
            const selectedInSection = selectedProductIdsBySection.get(sectionId) || new Set();
            return (
              <div
                key={sectionId}
                ref={(el) => {
                  if (el) sectionRefs.current.set(sectionId, el);
                  else sectionRefs.current.delete(sectionId);
                }}
                className={isOpen ? "dg-acc-item is-open" : "dg-acc-item"}
              >
                <div className="dg-acc-header" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setOpenSectionId(isOpen ? null : sectionId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      minWidth: 0,
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div className="dg-acc-title">
                      {section.name}
                    </div>
                    <div className="dg-acc-meta">
                      {selectedInSection.size ? `${selectedInSection.size} seleccionado` : "Sin selección"}{" "}
                      · {sectionProducts.length}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="dg-acc-chevron"
                    onClick={() => setOpenSectionId(isOpen ? null : sectionId)}
                    aria-label={isOpen ? "Cerrar sección" : "Abrir sección"}
                    style={{ border: 0, background: "transparent", cursor: "pointer" }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                </div>

                {isOpen ? (
                  <div className="dg-acc-body">
                    <div className="dg-product-list">
                      {sectionProducts.map((product) => {
                        const disabledForUser = isDisabledForUser(product, user);
                        const isSelected = selectedInSection.has(Number(product.id));
                        const visibleOdooId = getVisibleOdooId(product);

                        return (
                          <div
                            key={product.id}
                            className="dg-product-card"
                            style={
                              disabledForUser
                                ? { opacity: 0.55, background: "#f3f4f6" }
                                : isSelected
                                  ? { border: "1px solid #60a5fa", background: "#eff6ff" }
                                  : undefined
                            }
                          >
                            <div className="dg-product-info">
                              <div className="dg-product-name" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                {getProductLabel(product)}
                                {product.no_permanent_stock ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      color: "#92400e",
                                      background: "#fef3c7",
                                      border: "1px solid #f59e0b",
                                      borderRadius: 999,
                                      padding: "2px 8px",
                                      whiteSpace: "nowrap",
                                    }}
                                    title="Este producto no se encuentra en stock permanente"
                                  >
                                    Sin stock permanente
                                  </span>
                                ) : null}
                              </div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                ID Presupuestador: {product.id}
                                {" · "}
                                ID Odoo: {visibleOdooId || product.id}
                                {product.code ? ` · ${product.code}` : ""}
                                {disabledForUser ? " · No habilitado para tu rol" : ""}
                              </div>
                            </div>

                            <Button
                              variant={isSelected ? "primary" : "secondary"}
                              disabled={disabledForUser}
                              onClick={() => selectProductForSection(sectionId, product)}
                            >
                              {isSelected ? "Elegido" : "Elegir"}
                            </Button>
                          </div>
                        );
                      })}

                      {!sectionProducts.length && (
                        <div className="muted">Sin productos para mostrar en esta sección</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {terminalStepCompleted && typeof onDownloadPresupuesto === "function" ? (
        <>
          <div className="spacer" />
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <Button variant="secondary" onClick={onDownloadPresupuesto}>
              Descargar presupuesto
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
