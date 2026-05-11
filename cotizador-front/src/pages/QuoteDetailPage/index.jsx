import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Button from "../../ui/Button.jsx";
import Input from "../../ui/Input.jsx";
import { getQuote, reviewCommercial, reviewTechnical, createRevisionQuote } from "../../api/quotes.js";
import { listDoorsByQuote } from "../../api/doors.js";
import { downloadMedicionPdf } from "../../api/pdf.js";
import { getBillingOptions } from "../../api/odoo.js";
import { useAuthStore } from "../../domain/auth/store.js";
import { formatARS } from "../../domain/quote/pricing.js";
import MeasurementReadOnlyView from "../../components/MeasurementReadOnlyView.jsx";

function quoteEditorPath(quote) {
  const kind = String(quote?.payload?.quote_subkind || quote?.catalog_kind || "porton").toLowerCase();
  if (kind === "ipanel") return `/cotizador/ipanel/${quote.id}`;
  if (kind === "otros") return `/cotizador/otros/${quote.id}`;
  return `/cotizador/${quote.id}`;
}

function pillStyle(bg, border) {
  return {
    padding: "2px 8px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    fontSize: 12,
    fontWeight: 800,
  };
}

function measurementStatusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "submitted") return "Enviada";
  if (s === "needs_fix") return "A corregir";
  if (s === "approved") return "Aprobada";
  if (s === "none" || !s) return "Pendiente";
  return s;
}

function hasMeasurementForPdf(q) {
  return !!q?.measurement_form || !!q?.measurement_source_quote_id || ["submitted", "needs_fix", "approved"].includes(q?.measurement_status);
}

function decisionLabel(d) {
  if (d === "approved") return "Aprobado";
  if (d === "rejected") return "Rechazado";
  return "Pendiente";
}

function displayQuoteNumber(quote, fallbackId = null) {
  if (quote?.quote_number !== null && quote?.quote_number !== undefined && String(quote.quote_number).trim()) return String(quote.quote_number);
  if (quote?.odoo_sale_order_name) return String(quote.odoo_sale_order_name);
  return fallbackId ? String(fallbackId).slice(0, 8) : "—";
}

function normalizeBillingText(value) {
  return String(value || "").trim();
}

function normalizeBillingTypeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}

function sanitizeDocumentNumber(value, identificationTypeName) {
  const raw = normalizeBillingText(value);
  const key = normalizeBillingTypeKey(identificationTypeName);
  if (["cuit", "cuil", "dni"].includes(key)) return digitsOnly(raw);
  return raw;
}

function isValidCuitCuil(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * weights[i];
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === Number(digits[10]);
}

function validateBillingDocument(value) {
  const typeName = normalizeBillingText(value?.identification_type_name);
  const typeKey = normalizeBillingTypeKey(typeName);
  const vatRaw = normalizeBillingText(value?.vat);
  if (!typeKey || !vatRaw) return null;
  const digits = digitsOnly(vatRaw);
  if (typeKey === "cuit" || typeKey === "cuil") {
    if (digits.length !== 11) return `El ${typeName} debe tener 11 dígitos.`;
    if (!isValidCuitCuil(digits)) return `El ${typeName} ingresado no es válido.`;
  }
  if (typeKey === "dni") {
    if (digits.length < 7 || digits.length > 8) return "El DNI debe tener 7 u 8 dígitos.";
  }
  return null;
}

function emptyBillingCustomer(source = {}) {
  const identificationTypeName = normalizeBillingText(source?.identification_type_name || "");
  return {
    name: normalizeBillingText(source?.name || ""),
    vat: sanitizeDocumentNumber(source?.vat || "", identificationTypeName),
    email: normalizeBillingText(source?.email || ""),
    phone: normalizeBillingText(source?.phone || ""),
    address: normalizeBillingText(source?.address || source?.street || ""),
    city: normalizeBillingText(source?.city || ""),
    identification_type_id: source?.identification_type_id ? String(source.identification_type_id) : "",
    identification_type_name: identificationTypeName,
    afip_responsibility_type_id: source?.afip_responsibility_type_id ? String(source.afip_responsibility_type_id) : "",
    afip_responsibility_type_name: normalizeBillingText(source?.afip_responsibility_type_name || ""),
  };
}

function hasBillingCustomerData(customer) {
  if (!customer) return false;
  return [
    customer.name,
    customer.vat,
    customer.email,
    customer.phone,
    customer.address,
    customer.city,
    customer.identification_type_id,
    customer.afip_responsibility_type_id,
  ].some((value) => String(value || "").trim());
}

function billingSummary(customer) {
  if (!hasBillingCustomerData(customer)) return "Se facturará con los datos del cliente cargado.";
  return [
    customer.name,
    customer.identification_type_name || "",
    customer.vat ? `N° ${customer.vat}` : "",
    customer.afip_responsibility_type_name || "",
    customer.address,
    customer.city,
  ].filter(Boolean).join(" · ");
}

function normalizeBillingSelectionValue(list, idValue) {
  const id = String(idValue || "").trim();
  if (!id) return null;
  return (Array.isArray(list) ? list : []).find((item) => String(item?.id || "") === id) || null;
}

function normalizeTechnicalKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isFilledTechnicalValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function formatTechnicalScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("es-AR") : "";
  return String(value || "").trim();
}

function formatTechnicalObject(value) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["name", "label", "display_name", "displayName", "title", "value", "description"]) {
    const direct = value?.[key];
    if (isFilledTechnicalValue(direct)) return formatTechnicalScalar(direct);
  }
  return "";
}

function formatTechnicalValue(value) {
  if (Array.isArray(value)) {
    return value.map(formatTechnicalValue).filter(Boolean).slice(0, 6).join(" · ");
  }
  if (value && typeof value === "object") return formatTechnicalObject(value);
  return formatTechnicalScalar(value);
}

function findFirstTechnicalEntry(source, keyCandidates, maxDepth = 6) {
  const wanted = new Set((keyCandidates || []).map(normalizeTechnicalKey).filter(Boolean));
  const seen = new WeakSet();

  function walk(value, depth) {
    if (!value || typeof value !== "object" || depth > maxDepth) return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const [key, raw] of Object.entries(value)) {
      if (wanted.has(normalizeTechnicalKey(key)) && isFilledTechnicalValue(raw)) {
        return { key, value: raw };
      }
    }

    for (const raw of Object.values(value)) {
      const found = walk(raw, depth + 1);
      if (found) return found;
    }
    return null;
  }

  return walk(source, 0);
}

function firstTechnicalEntry(sources, keyCandidates) {
  for (const source of sources || []) {
    const found = findFirstTechnicalEntry(source, keyCandidates);
    if (found) return found;
  }
  return null;
}

function formatDimensionEntry(entry) {
  const raw = entry?.value;
  const key = normalizeTechnicalKey(entry?.key);
  const n = Number(String(raw ?? "").replace(",", "."));
  if (Number.isFinite(n)) {
    if (key.includes("mm") || Math.abs(n) > 50) return `${Math.round(n).toLocaleString("es-AR")} mm`;
    return `${n.toLocaleString("es-AR")} m`;
  }
  return formatTechnicalValue(raw);
}

function formatKgEntry(entry) {
  const raw = entry?.value;
  const n = Number(String(raw ?? "").replace(",", "."));
  if (Number.isFinite(n)) return `${n.toLocaleString("es-AR")} kg`;
  return formatTechnicalValue(raw);
}


function parseTechnicalNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function round2Technical(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normTechnicalText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getByCleanPath(source, path) {
  const parts = String(path || "").replace(/^payload\./, "").split(".").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function getRulesParamsForApproval(quote) {
  const rules = quote?.technical_rules || {};
  return rules.surface_parameters || rules.surface_calc_params || rules.surface_params || rules.measurement_surface_params || {};
}

function getNumberParamForApproval(params, keys, fallback) {
  for (const key of keys) {
    const n = parseTechnicalNumber(params?.[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function getQuoteProductIdSet(quote) {
  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  return new Set(lines.map((line) => Number(line?.product_id || 0)).filter(Boolean));
}

function detectInstallationModeForApproval(quote, params) {
  const ids = getQuoteProductIdSet(quote);
  const insideId = Number(params?.installation_inside_product_id || 0);
  const behindId = Number(params?.installation_behind_product_id || 0);
  if (insideId && ids.has(insideId)) return "dentro_vano";
  if (behindId && ids.has(behindId)) return "detras_vano";
  return "sin_instalacion";
}

function detectNoCladdingForApproval(quote, params) {
  const ids = getQuoteProductIdSet(quote);
  const noCladdingId = Number(params?.no_cladding_product_id || 0);
  return !!(noCladdingId && ids.has(noCladdingId));
}

function inferKgM2FromTypeForApproval(portonType) {
  const t = normTechnicalText(portonType);
  if (!t) return 0;
  if (t.includes("para_revestir")) return 0;
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) return 25;
  if (t.includes("clas") || t.includes("estandar")) return 15;
  return 0;
}

function isAptoDerivedTypeForApproval(portonType) {
  return normTechnicalText(portonType) === "para_revestir_con_al_pvc_otros";
}

function normalizeAptoKgRulesForApproval(raw = []) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      product_id: Number(item?.product_id || 0),
      kg_m2: parseTechnicalNumber(item?.kg_m2),
    }))
    .filter((item) => item.product_id > 0 && Number.isFinite(item.kg_m2) && item.kg_m2 > 0);
}

function resolveAptoKgM2ByProductsForApproval(quote, params) {
  const rules = normalizeAptoKgRulesForApproval(params?.apto_revestir_kg_m2_rules);
  const ids = getQuoteProductIdSet(quote);
  for (const rule of rules) {
    if (ids.has(rule.product_id)) return Number(rule.kg_m2 || 0);
  }
  return 0;
}

function resolveSellerKgM2EntryForApproval(quote, params) {
  const payload = quote?.payload || {};
  const candidates = [];
  if (params?.seller_kg_m2_field_path) candidates.push(params.seller_kg_m2_field_path);
  candidates.push("dimensions.kg_m2", "kg_m2_entry", "kg_m2", "entry_kg_m2", "custom_kg_m2", "peso_m2", "payload.kg_m2_entry");
  for (const path of candidates) {
    const value = String(path || "").includes(".") ? getByCleanPath(payload, path) : payload?.[path];
    const n = parseTechnicalNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function legsTypeForWeightForApproval(weightKg, isApto, params) {
  const limitAngostas = getNumberParamForApproval(
    params,
    [
      isApto ? "no_cladding_angostas_max_kg" : "legs_angostas_max_kg",
      isApto ? "limit_angostas_apto_kg" : "limit_angostas_kg",
      "piernas_angostas_hasta_kg",
    ],
    isApto ? 80 : 140,
  );
  const limitComunes = getNumberParamForApproval(params, ["legs_comunes_max_kg", "limit_comunes_kg", "piernas_comunes_hasta_kg"], 175);
  const limitAnchas = getNumberParamForApproval(params, ["legs_anchas_max_kg", "limit_anchas_kg", "piernas_anchas_hasta_kg"], 240);
  const limitSuper = getNumberParamForApproval(params, ["legs_superanchas_max_kg", "limit_superanchas_kg", "piernas_superanchas_hasta_kg"], 300);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return "";
  if (weightKg <= limitAngostas) return "Angostas";
  if (weightKg <= limitComunes) return "Comunes";
  if (weightKg <= limitAnchas) return "Anchas";
  if (weightKg <= limitSuper) return "Superanchas";
  return "Especiales";
}

function mapLegsKeyForWidthForApproval(legsLabel) {
  const t = normTechnicalText(legsLabel);
  if (t.includes("super")) return "superanchas";
  if (t.includes("especial")) return "especiales";
  if (t.includes("ancha")) return "anchas";
  if (t.includes("comun")) return "comunes";
  return "angostas";
}

function formatMetersForApproval(valueM) {
  const n = parseTechnicalNumber(valueM);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 3 })} m`;
}

function formatMetersFromMmForApproval(valueMm) {
  const n = Number(valueMm || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${(n / 1000).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function normalizeOrientationLabelForApproval(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "horizontal" || raw === "horizontales") return "Horizontal";
  if (raw === "vertical" || raw === "verticales") return "Verticales";
  return formatTechnicalValue(value);
}

function normalizeDistributionLabelForApproval(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "especial") return "Especial";
  if (raw === "repartido") return "Repartido";
  return formatTechnicalValue(value);
}

function computeApprovalTechnicalPreview(quote) {
  const payload = quote?.payload || {};
  const dimensions = payload?.dimensions || {};
  const widthM = parseTechnicalNumber(dimensions?.width ?? dimensions?.ancho ?? payload?.width ?? payload?.ancho);
  const heightM = parseTechnicalNumber(dimensions?.height ?? dimensions?.alto ?? payload?.height ?? payload?.alto);
  const widthMm = Math.round((Number(widthM || 0) || 0) * 1000);
  const heightMm = Math.round((Number(heightM || 0) || 0) * 1000);
  const areaM2 = (Number(widthM || 0) || 0) * (Number(heightM || 0) || 0);
  const params = getRulesParamsForApproval(quote);
  const portonType = payload?.porton_type || payload?.tipo_porton || payload?.tipo_sistema || payload?.system_type || "";
  const installationMode = detectInstallationModeForApproval(quote, params);
  const aptoParaRevestir = isAptoDerivedTypeForApproval(portonType) || detectNoCladdingForApproval(quote, params);
  const aptoKg = aptoParaRevestir ? resolveAptoKgM2ByProductsForApproval(quote, params) : 0;
  const inferredKg = inferKgM2FromTypeForApproval(portonType);
  const sellerKgM2 = resolveSellerKgM2EntryForApproval(quote, params);
  const effectiveKgM2 = aptoParaRevestir ? (aptoKg || sellerKgM2 || inferredKg) : (sellerKgM2 || inferredKg);
  const weightHeightDiscountMm = Number(params?.weight_height_discount_mm || 10);
  const weightWidthDiscountMm = Number(params?.weight_width_discount_mm || 14);
  const discountedHeightMm = Math.max(0, heightMm - weightHeightDiscountMm);
  const discountedWidthMm = Math.max(0, widthMm - weightWidthDiscountMm);
  const estimatedWeightKg = areaM2 > 0 && effectiveKgM2 > 0
    ? round2Technical((discountedHeightMm / 1000) * (discountedWidthMm / 1000) * effectiveKgM2)
    : 0;
  const legsLabel = legsTypeForWeightForApproval(estimatedWeightKg, aptoParaRevestir, params);
  const legsKey = mapLegsKeyForWidthForApproval(legsLabel);

  let altoPasoMm = discountedHeightMm;
  let anchoPasoMm = discountedWidthMm;
  if (installationMode === "detras_vano") {
    const addMap = {
      angostas: Number(params?.legs_angostas_add_width_mm || 140),
      comunes: Number(params?.legs_comunes_add_width_mm || 200),
      anchas: Number(params?.legs_anchas_add_width_mm || 280),
      superanchas: Number(params?.legs_superanchas_add_width_mm || 380),
      especiales: Number(params?.legs_especiales_add_width_mm || params?.legs_superanchas_add_width_mm || 380),
    };
    altoPasoMm = Math.max(0, heightMm + Number(params?.behind_vano_add_height_mm || 100));
    anchoPasoMm = Math.max(0, widthMm + Number(addMap[legsKey] || 0));
  } else if (installationMode === "dentro_vano") {
    altoPasoMm = Math.max(0, heightMm - Number(params?.inside_vano_subtract_height_mm || 10));
    anchoPasoMm = Math.max(0, widthMm - Number(params?.inside_vano_subtract_width_mm || 20));
  }

  return {
    widthM,
    heightM,
    areaM2,
    effectiveKgM2,
    estimatedWeightKg,
    legsLabel,
    altoPasoMm,
    anchoPasoMm,
  };
}

function conditionModeLabel(mode) {
  const key = String(mode || "").trim();
  if (key === "cond1") return "Condición 1";
  if (key === "cond2") return "Condición 2";
  if (key === "special") return "Especial";
  return key;
}

function fulfillmentModeLabel(mode) {
  const key = String(mode || "").trim();
  if (key === "acopio") return "Acopio";
  if (key === "produccion") return "Producción";
  return key;
}

function technicalLineSummary(lines) {
  const values = (Array.isArray(lines) ? lines : [])
    .map((line) => line?.name || line?.raw_name || line?.code || line?.product_name || line?.product?.name)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, 6).join(" · ");
}

function pushApprovalContextRow(rows, label, value) {
  const formatted = formatTechnicalValue(value);
  if (!formatted) return;
  rows.push({ label, value: formatted });
}

function pushApprovalContextEntry(rows, label, entry, formatter = formatTechnicalValue) {
  if (!entry) return;
  const formatted = formatter(entry);
  if (!formatted) return;
  rows.push({ label, value: formatted });
}

function buildApprovalContextRows(quote, conditionMode) {
  if (!quote) return [];
  const payload = quote?.payload && typeof quote.payload === "object" ? quote.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  const measurementForm = quote?.measurement_form && typeof quote.measurement_form === "object" ? quote.measurement_form : {};
  const preview = computeApprovalTechnicalPreview(quote);
  const sources = [
    quote,
    payload,
    dimensions,
    payload?.technical_summary,
    payload?.technical,
    payload?.datos_tecnicos,
    payload?.production_planning,
    payload?.surface_context,
    payload?.automatic_context,
    payload?.surfaceContext,
    payload?.automaticContext,
    measurementForm,
    measurementForm?.computed,
    measurementForm?.surface_context,
    measurementForm?.automatic_context,
    measurementForm?.surfaceContext,
    measurementForm?.automaticContext,
  ].filter(Boolean);

  const rows = [];
  const sistemaEntry = firstTechnicalEntry(sources, ["tipologia_sistema", "tipologia", "tipología", "sistema", "system", "system_type", "tipo_sistema", "porton_type", "tipo_porton", "levadizo"]);
  const paymentEntry = firstTechnicalEntry(sources, ["payment_method", "paymentMethod", "forma_pago", "forma_de_pago", "metodo_pago", "método_pago", "selected_payment_method", "financing_label", "financing"]);
  const cantidadParantesEntry = firstTechnicalEntry(sources, ["cantidad_parantes", "parantes_cantidad", "cant_parantes", "parantes_cant"]);
  const orientacionParantesEntry = firstTechnicalEntry(sources, ["orientacion_parantes", "orientación_parantes", "parantes_orientacion", "parantes_orientación"]);
  const distribucionParantesEntry = firstTechnicalEntry(sources, ["distribucion_parantes", "distribución_parantes", "parantes_distribucion", "parantes_distribución"]);
  const observacionesParantesEntry = firstTechnicalEntry(sources, ["observaciones_parantes", "observacion_parantes", "obs_parantes"]);

  pushApprovalContextRow(rows, "Ancho", formatMetersForApproval(preview.widthM) || formatDimensionEntry(firstTechnicalEntry(sources, ["ancho", "width", "ancho_m", "width_m", "ancho_mm", "width_mm"])));
  pushApprovalContextRow(rows, "Alto", formatMetersForApproval(preview.heightM) || formatDimensionEntry(firstTechnicalEntry(sources, ["alto", "height", "alto_m", "height_m", "alto_mm", "height_mm"])));
  pushApprovalContextEntry(rows, "Tipología / sistema", sistemaEntry);
  pushApprovalContextRow(rows, "Kg/m² efectivo", preview.effectiveKgM2 > 0 ? `${preview.effectiveKgM2.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/m²` : "");
  pushApprovalContextRow(rows, "Superficie", preview.areaM2 > 0 ? `${preview.areaM2.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : "");
  pushApprovalContextRow(rows, "Medidas de paso", preview.altoPasoMm > 0 && preview.anchoPasoMm > 0 ? `${formatMetersFromMmForApproval(preview.altoPasoMm)} x ${formatMetersFromMmForApproval(preview.anchoPasoMm)}` : "");
  pushApprovalContextRow(rows, "Peso estimado", preview.estimatedWeightKg > 0 ? `${preview.estimatedWeightKg.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : "");
  pushApprovalContextRow(rows, "Piernas estimadas", preview.legsLabel || formatTechnicalValue(firstTechnicalEntry(sources, ["piernas_tipo", "tipo_piernas", "piernas", "leg_type", "legs_type"])?.value));
  pushApprovalContextRow(rows, "Orientación de parantes", normalizeOrientationLabelForApproval(orientacionParantesEntry?.value || "verticales"));
  pushApprovalContextEntry(rows, "Cantidad de parantes", cantidadParantesEntry);
  pushApprovalContextRow(rows, "Distribución de parantes", normalizeDistributionLabelForApproval(distribucionParantesEntry?.value || "repartido"));
  pushApprovalContextEntry(rows, "Obs. parantes", observacionesParantesEntry);
  pushApprovalContextEntry(rows, "Forma de pago", paymentEntry);
  pushApprovalContextRow(rows, "Condición", conditionModeLabel(conditionMode));
  pushApprovalContextRow(rows, "Destino", fulfillmentModeLabel(quote?.fulfillment_mode));
  pushApprovalContextRow(rows, "Estado medición", measurementStatusLabel(quote?.measurement_status));
  pushApprovalContextRow(rows, "Productos clave", technicalLineSummary(quote?.lines));

  return rows;
}

function ApprovalContextCard({ rows }) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return (
    <div className="card" style={{ background: "#fafafa" }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Datos técnicos y comerciales para aprobar</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Resumen de solo lectura para Comercial y Técnica. No modifica el flujo de aprobación.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {rows.map((item) => (
          <div key={item.label} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
            <div className="muted" style={{ fontSize: 12 }}>{item.label}</div>
            <div style={{ fontWeight: 800, marginTop: 4 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingModal({
  value,
  onChange,
  onClose,
  onConfirm,
  loading,
  requiresBilling = false,
  billingOptions,
  optionsLoading = false,
  optionsError = null,
}) {
  const identificationTypes = Array.isArray(billingOptions?.identification_types) ? billingOptions.identification_types : [];
  const afipResponsibilityTypes = Array.isArray(billingOptions?.afip_responsibility_types) ? billingOptions.afip_responsibility_types : [];

  const selectedIdentificationType = normalizeBillingSelectionValue(identificationTypes, value.identification_type_id);
  const selectedAfipResponsibilityType = normalizeBillingSelectionValue(afipResponsibilityTypes, value.afip_responsibility_type_id);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 860, background: "#fff", border: "1px solid #ddd", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 8 }}>Datos fiscales de facturación</div>
        <div className="muted" style={{ marginBottom: 16 }}>
          {requiresBilling ? "Para esta condición debés cargar los datos fiscales de facturación antes de aprobar." : "Si no cargás estos datos, se facturará con los datos del cliente cargado en el presupuesto."}
        </div>

        {optionsError ? <div style={{ color: "#d93025", fontSize: 13, marginBottom: 12 }}>{optionsError}</div> : null}
        {optionsLoading ? <div className="muted" style={{ marginBottom: 12 }}>Cargando opciones fiscales desde Odoo…</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Razón social / nombre fiscal</div>
            <Input value={value.name} onChange={(v) => onChange({ ...value, name: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Tipo de identificación</div>
            <select
              value={value.identification_type_id}
              onChange={(e) => {
                const selected = normalizeBillingSelectionValue(identificationTypes, e.target.value);
                onChange({
                  ...value,
                  identification_type_id: String(e.target.value || ""),
                  identification_type_name: selected?.name || "",
                });
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
            >
              <option value="">Seleccionar…</option>
              {identificationTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Número de identificación</div>
            <Input value={value.vat} onChange={(v) => onChange({ ...value, vat: sanitizeDocumentNumber(v, value.identification_type_name) })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Tipo de responsabilidad AFIP</div>
            <select
              value={value.afip_responsibility_type_id}
              onChange={(e) => {
                const selected = normalizeBillingSelectionValue(afipResponsibilityTypes, e.target.value);
                onChange({
                  ...value,
                  afip_responsibility_type_id: String(e.target.value || ""),
                  afip_responsibility_type_name: selected?.name || "",
                });
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", outline: "none", background: "#fff" }}
            >
              <option value="">Seleccionar…</option>
              {afipResponsibilityTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Correo</div>
            <Input value={value.email} onChange={(v) => onChange({ ...value, email: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Teléfono</div>
            <Input value={value.phone} onChange={(v) => onChange({ ...value, phone: v })} style={{ width: "100%" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="muted" style={{ marginBottom: 6 }}>Dirección fiscal</div>
            <Input value={value.address} onChange={(v) => onChange({ ...value, address: v })} style={{ width: "100%" }} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Localidad</div>
            <Input value={value.city} onChange={(v) => onChange({ ...value, city: v })} style={{ width: "100%" }} />
          </div>
        </div>

        {(selectedIdentificationType || selectedAfipResponsibilityType) ? (
          <div className="muted" style={{ marginTop: 12 }}>
            {[selectedIdentificationType?.name ? `Documento: ${selectedIdentificationType.name}` : "", selectedAfipResponsibilityType?.name ? `AFIP: ${selectedAfipResponsibilityType.name}` : ""].filter(Boolean).join(" · ")}
          </div>
        ) : null}

        <div className="muted" style={{ marginTop: 12 }}>
          {requiresBilling ? "Estos datos son obligatorios para aprobar esta condición." : "Dejá todos los campos vacíos si querés facturar con el cliente del presupuesto."}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={loading || (requiresBilling && optionsLoading)}>{loading ? "Aprobando..." : "Aprobar Comercial"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function QuoteDetailPage() {
  const params = useParams();
  const quoteId = params.id ? String(params.id) : null;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [notes, setNotes] = useState("");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingCustomer, setBillingCustomer] = useState(emptyBillingCustomer());

  const q = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getQuote(quoteId), enabled: !!quoteId });
  const linkedDoorsQ = useQuery({ queryKey: ["doors", "by-quote", quoteId], queryFn: () => listDoorsByQuote(quoteId), enabled: !!quoteId });
  const quote = q.data;
  const isRevision = (quote?.quote_kind || "original") === "copy";
  const canCommercial = !!user?.is_enc_comercial && quote?.created_by_role === "vendedor" && !isRevision;
  const canTech = !!user?.is_rev_tecnica && !isRevision;
  const canCommercialAct = canCommercial && quote?.status === "pending_approvals" && quote?.commercial_decision === "pending";
  const canTechAct = canTech && quote?.status === "pending_approvals" && quote?.technical_decision === "pending";
  const conditionMode = String(quote?.payload?.condition_mode || "cond1").trim();
  const requiresCommercialBillingData = quote?.created_by_role === "vendedor" && ["cond1", "special"].includes(conditionMode);
  const billingOptionsQ = useQuery({
    queryKey: ["billing-options"],
    queryFn: () => getBillingOptions(),
    enabled: billingModalOpen && canCommercialAct && requiresCommercialBillingData,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    setBillingCustomer(emptyBillingCustomer(quote?.payload?.billing_customer || {}));
  }, [quote?.id, quote?.payload?.billing_customer]);

  const effectiveKind = String(quote?.payload?.quote_subkind || quote?.catalog_kind || "porton").toLowerCase();
  const showMeasurement = effectiveKind === "porton" && (!!quote?.requires_measurement || (quote?.status === "synced_odoo" && quote?.fulfillment_mode === "produccion"));
  const approvalReturnPath = useMemo(() => {
    const from = location.state?.from;
    if (typeof from === "string" && from.trim()) return from;
    if (canTech && !user?.is_vendedor && !user?.is_distribuidor) return "/aprobacion/tecnica";
    if (canCommercial && !user?.is_vendedor && !user?.is_distribuidor) return "/aprobacion/comercial";
    return "/presupuestos";
  }, [location.state, canTech, canCommercial, user]);

  const commercialM = useMutation({
    mutationFn: ({ action, billingCustomer: nextBillingCustomer }) => reviewCommercial(quoteId, { action, notes, billingCustomer: nextBillingCustomer }),
    onSuccess: () => navigate(approvalReturnPath),
  });
  const revisionM = useMutation({
    mutationFn: () => createRevisionQuote(quoteId),
    onSuccess: (newQuote) => {
      if (!newQuote?.id) return;
      navigate(quoteEditorPath(newQuote));
    },
  });
  const techM = useMutation({
    mutationFn: ({ action }) => reviewTechnical(quoteId, { action, notes }),
    onSuccess: () => navigate(approvalReturnPath),
  });

  const lines = Array.isArray(quote?.lines) ? quote.lines : [];
  const rejectionBoxes = useMemo(() => {
    if (!quote) return [];
    const arr = [];
    if (quote.commercial_decision === "rejected") arr.push({ title: "Rechazo Comercial", body: quote.commercial_notes || "(sin motivo)" });
    if (quote.technical_decision === "rejected") arr.push({ title: "Rechazo Técnica", body: quote.technical_notes || "(sin motivo)" });
    return arr;
  }, [quote]);
  const approvalContextRows = useMemo(() => buildApprovalContextRows(quote, conditionMode), [quote, conditionMode]);

  function handleCommercialApproveClick() {
    if (requiresCommercialBillingData) {
      setBillingModalOpen(true);
      return;
    }
    commercialM.mutate({ action: "approve", billingCustomer: null });
  }

  function confirmCommercialApproval() {
    const normalized = emptyBillingCustomer(billingCustomer);
    if (requiresCommercialBillingData) {
      const missing = [];
      if (!normalized.name) missing.push("razón social / nombre fiscal");
      if (!normalized.identification_type_id) missing.push("tipo de identificación");
      if (!normalized.vat) missing.push("número de identificación");
      if (!normalized.afip_responsibility_type_id) missing.push("tipo de responsabilidad AFIP");
      if (!normalized.phone) missing.push("teléfono");
      if (!normalized.address) missing.push("dirección fiscal");
      if (!normalized.city) missing.push("localidad");
      if (missing.length) {
        window.alert(`Completá los datos fiscales obligatorios: ${missing.join(", ")}.`);
        return;
      }
    } else if (hasBillingCustomerData(normalized) && !normalized.name) {
      window.alert("Si cargás datos fiscales, completá al menos la razón social / nombre fiscal.");
      return;
    }
    commercialM.mutate({ action: "approve", billingCustomer: hasBillingCustomerData(normalized) ? normalized : null });
  }

  return (
    <div className="container">
      {billingModalOpen ? (
        <BillingModal
          value={billingCustomer}
          onChange={setBillingCustomer}
          onClose={() => setBillingModalOpen(false)}
          onConfirm={confirmCommercialApproval}
          loading={commercialM.isPending}
          requiresBilling={requiresCommercialBillingData}
          billingOptions={billingOptionsQ.data}
          optionsLoading={billingOptionsQ.isLoading || billingOptionsQ.isFetching}
          optionsError={billingOptionsQ.isError ? billingOptionsQ.error.message : null}
        />
      ) : null}

      <div className="card">
        <h2 style={{ margin: 0 }}>{isRevision ? "Ajuste" : "Presupuesto"} #{displayQuoteNumber(quote, quoteId)}</h2>
        {q.isLoading ? <div className="muted">Cargando...</div> : null}
        {q.isError ? <div style={{ color: "#d93025", fontSize: 13 }}>{q.error.message}</div> : null}

        {quote ? (
          <>
            <div className="spacer" />
            <div className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>Estado: <b>{isRevision ? (quote.final_status || quote.status) : quote.status}</b></span>
              <span>· Número: <b>{displayQuoteNumber(quote, quoteId)}</b></span>
              <span>· Creado por: <b>{quote.created_by_role}</b></span>
              <span>· Destino: <b>{quote.fulfillment_mode === "acopio" ? "Acopio" : "Producción"}</b></span>
              {!isRevision && quote.status === "synced_odoo" ? <span style={pillStyle("#e7f7ed", "#bfe6c8")}>En Odoo: {quote.odoo_sale_order_name || `SO#${quote.odoo_sale_order_id}`}</span> : null}
              {isRevision && quote.final_sale_order_name ? <span style={pillStyle("#e7f7ed", "#bfe6c8")}>Odoo final: {quote.final_sale_order_name}</span> : null}
              {isRevision && quote.final_absorbed_by_company ? <span style={pillStyle("#fff7e6", "#ffd9a8")}>Diferencia absorbida por empresa</span> : null}
              {quote.status === "syncing_odoo" ? <span style={pillStyle("#fff7e6", "#ffd9a8")}>Sincronizando a Odoo…</span> : null}
              {quote.status === "pending_approvals" && !isRevision ? <span style={pillStyle("#eef4ff", "#c7dafc")}>En aprobación</span> : null}
            </div>

            {!!rejectionBoxes.length ? (
              <>
                <div className="spacer" />
                {rejectionBoxes.map((b) => (
                  <div key={b.title} style={{ padding: 10, borderRadius: 10, border: "1px solid #f2c1be", background: "#fff5f5", marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>{b.title}</div>
                    <div>{b.body}</div>
                  </div>
                ))}
              </>
            ) : null}

            <div className="spacer" />
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="muted">Cliente</div>
                <div style={{ fontWeight: 700 }}>{quote.end_customer?.name || "(sin nombre)"}</div>
                <div className="muted">{quote.end_customer?.phone || ""}</div>
                <div className="muted">{quote.end_customer?.address || ""}</div>
                {isRevision && quote.parent_quote_id ? <div className="muted">Ref. original: <b>{String(quote.parent_quote_id).slice(0, 8)}</b></div> : null}
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted">Observaciones</div>
                <div>{quote.note || <span className="muted">(sin notas)</span>}</div>
                {isRevision && typeof quote.final_difference_amount === "number" ? <div className="muted" style={{ marginTop: 8 }}>Diferencia final: <b>{formatARS(quote.final_difference_amount)}</b></div> : null}
              </div>
              <div style={{ flex: 1 }}>
                <div className="muted">Facturación</div>
                <div>{billingSummary(emptyBillingCustomer(quote.payload?.billing_customer || {}))}</div>
                <div className="muted" style={{ marginTop: 6 }}>Condición: <b>{conditionMode === "cond1" ? "Condición 1" : conditionMode === "cond2" ? "Condición 2" : "Especial"}</b></div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {((!isRevision && quote.status === "draft") || (isRevision && !["syncing_odoo", "synced_odoo"].includes(quote.final_status || ""))) ? <Button onClick={() => navigate(quoteEditorPath(quote))}>{isRevision ? "Editar final" : "Editar"}</Button> : null}
                {!isRevision && quote.final_copy_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${quote.final_copy_id}`)}>Ver final</Button> : null}
                {((user?.is_vendedor || user?.is_distribuidor) && String(quote.created_by_user_id) === String(user.user_id) && !isRevision && quote.status === "synced_odoo" && hasMeasurementForPdf(quote) && !quote.final_copy_id) ? (
                  <Button variant="ghost" disabled={revisionM.isPending} onClick={() => revisionM.mutate()} title="Crear un nuevo presupuesto (ajuste) referenciado a este">
                    {revisionM.isPending ? "Creando…" : "Crear ajuste"}
                  </Button>
                ) : null}
                {isRevision && quote.parent_quote_id ? <Button variant="ghost" onClick={() => navigate(`/presupuestos/${quote.parent_quote_id}`)}>Ver original</Button> : null}
                <Button variant="ghost" onClick={() => navigate(approvalReturnPath)}>Volver</Button>
              </div>
            </div>

            <div className="spacer" />
            {!!linkedDoorsQ.data?.length && !isRevision ? (
              <div className="card" style={{ background: "#fafafa" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Puertas vinculadas</div>
                <table>
                  <thead>
                    <tr><th>Código</th><th>Cliente</th><th>Estado</th><th>Venta Odoo</th><th>Compra Odoo</th><th></th></tr>
                  </thead>
                  <tbody>
                    {linkedDoorsQ.data.map((d) => (
                      <tr key={d.id}>
                        <td>{d.door_code}</td>
                        <td>{d.record?.end_customer?.name || d.record?.obra_cliente || "—"}</td>
                        <td>{d.status}</td>
                        <td>{d.odoo_sale_order_name || "—"}</td>
                        <td>{d.odoo_purchase_order_name || "—"}</td>
                        <td className="right"><Button variant="ghost" onClick={() => navigate(`/puertas/${d.id}`)}>Ver puerta</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="spacer" />
            {!isRevision ? (
              <div className="card" style={{ background: "#fafafa" }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Aprobaciones</div>
                <div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>Comercial: <b>{decisionLabel(quote.commercial_decision)}</b>{quote.commercial_decision === "rejected" && quote.commercial_notes ? ` · ${quote.commercial_notes}` : ""}</span>
                  <span>Técnica: <b>{decisionLabel(quote.technical_decision)}</b>{quote.technical_decision === "rejected" && quote.technical_notes ? ` · ${quote.technical_notes}` : ""}</span>
                </div>
              </div>
            ) : null}

            {!!approvalContextRows.length ? (
              <>
                <div className="spacer" />
                <ApprovalContextCard rows={approvalContextRows} />
              </>
            ) : null}

            {showMeasurement && !isRevision ? (
              <>
                <div className="spacer" />
                <div className="card" style={{ background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>Planilla de medición</div>
                      <div className="muted">Estado: <b>{measurementStatusLabel(quote.measurement_status)}</b></div>
                    </div>
                    {hasMeasurementForPdf(quote) ? <Button variant="secondary" onClick={() => downloadMedicionPdf(quote.id)}>Descargar PDF</Button> : null}
                  </div>
                  <div className="spacer" />
                  {quote.measurement_form ? <MeasurementReadOnlyView quote={quote} /> : null}
                </div>
              </>
            ) : null}

            <h3 style={{ marginTop: 0 }}>Ítems</h3>
            {!lines.length ? <div className="muted">Sin ítems</div> : null}
            {!!lines.length ? (
              <table>
                <thead>
                  <tr><th>Producto</th><th className="right">Cant.</th><th className="right">Base</th><th className="right">Total</th></tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const qty = Number(l.qty || 0);
                    const base = Number(l.basePrice ?? l.price ?? 0);
                    const total = qty * base;
                    return (
                      <tr key={`${l.product_id}-${idx}`}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{l.name || `Producto ${l.product_id}`}</div>
                          <div className="muted">ID: {l.product_id} {l.code ? `| ${l.code}` : ""}</div>
                        </td>
                        <td className="right">{qty}</td>
                        <td className="right">{formatARS(base)}</td>
                        <td className="right" style={{ fontWeight: 800 }}>{formatARS(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}

            {(canCommercial || canTech) ? (
              <>
                <div className="spacer" />
                <div className="card" style={{ background: "#fafafa" }}>
                  <div style={{ fontWeight: 900 }}>Acciones de revisión</div>
                  <div className="muted">Solo si está en <b>pending_approvals</b> y tu decisión está en <b>pending</b>.</div>
                  <div className="spacer" />
                  <div className="muted">Observaciones del revisor</div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Motivo si rechaza / notas si aprueba…"
                    style={{ width: "100%", minHeight: 60, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", outline: "none", resize: "vertical" }}
                  />
                  <div className="spacer" />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {canCommercial ? (
                      <>
                        <Button disabled={!canCommercialAct || commercialM.isPending} onClick={handleCommercialApproveClick}>{commercialM.isPending ? "Procesando..." : "Aprobar Comercial"}</Button>
                        <Button variant="danger" disabled={!canCommercialAct || commercialM.isPending} onClick={() => commercialM.mutate({ action: "reject", billingCustomer: null })}>Rechazar Comercial</Button>
                      </>
                    ) : null}
                    {canTech ? (
                      <>
                        <Button disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "approve" })}>{techM.isPending ? "Procesando..." : "Aprobar Técnica"}</Button>
                        <Button variant="danger" disabled={!canTechAct || techM.isPending} onClick={() => techM.mutate({ action: "reject" })}>Rechazar Técnica</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
