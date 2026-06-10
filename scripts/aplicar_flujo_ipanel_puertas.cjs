#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const skipped = [];

function filePath(rel) {
  return path.join(root, rel);
}

function read(rel) {
  const p = filePath(rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}. Ejecutar desde la raiz del repositorio.`);
  return fs.readFileSync(p, 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(filePath(rel), content, 'utf8');
  changed.push(rel);
}

function replaceOnce(content, search, replacement, label, already = null) {
  if (content.includes(search)) return content.replace(search, replacement);
  if (already && content.includes(already)) {
    skipped.push(`${label}: ya estaba aplicado`);
    return content;
  }
  throw new Error(`No se encontro bloque esperado: ${label}`);
}

function replaceAllSafe(content, search, replacement, label) {
  if (!content.includes(search)) {
    if (content.includes(replacement)) {
      skipped.push(`${label}: ya estaba aplicado`);
      return content;
    }
    throw new Error(`No se encontro bloque esperado: ${label}`);
  }
  return content.split(search).join(replacement);
}

function updateQuotesRoutes() {
  const rel = 'cotizador-back/src/routes/quotes.routes.js';
  let s = read(rel);

  s = replaceOnce(
    s,
    'const IPANEL_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_IPANEL_ACOPIO_PRODUCT_ID || 3557);',
    'const IPANEL_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_IPANEL_ACOPIO_PRODUCT_ID || 3607);',
    'quotes IPANEL acopio product id',
    'const IPANEL_ACOPIO_PRODUCT_ID = Number(process.env.ODOO_IPANEL_ACOPIO_PRODUCT_ID || 3607);',
  );

  s = replaceOnce(
    s,
`  if (kind === "porton" && mode === "produccion") {
    return {
      requires_measurement: true,
      measurement_mode: hasLine ? "medidor" : "tecnica_only",
      measurement_subtype: hasLine ? "normal" : "sin_medicion",
      measurement_status: "pending",
    };
  }`,
`  if (kind === "ipanel") {
    if (mode === "produccion") {
      return {
        requires_measurement: true,
        measurement_mode: "tecnica_only",
        measurement_subtype: "sin_medicion",
        measurement_status: "pending",
      };
    }
    return {
      requires_measurement: false,
      measurement_mode: "medidor",
      measurement_subtype: "normal",
      measurement_status: "none",
    };
  }

  if (["porton", "puerta"].includes(kind) && mode === "produccion") {
    return {
      requires_measurement: true,
      measurement_mode: hasLine ? "medidor" : "tecnica_only",
      measurement_subtype: hasLine ? "normal" : "sin_medicion",
      measurement_status: "pending",
    };
  }`,
    'quotes measurement flow ipanel puerta',
    'if (kind === "ipanel") {',
  );

  s = replaceOnce(
    s,
`function isDirectProductionTechnicalOnlyQuote(quote) {
  return String(quote?.catalog_kind || "porton").toLowerCase().trim() === "porton"
    && String(quote?.fulfillment_mode || "").trim() === "produccion"`,
`function isDirectProductionTechnicalOnlyQuote(quote) {
  return ["porton", "puerta"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())
    && String(quote?.fulfillment_mode || "").trim() === "produccion"`,
    'quotes direct production technical only kind',
    'return ["porton", "puerta"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())',
  );

  s = replaceOnce(
    s,
`  return String(quote?.catalog_kind || "porton").toLowerCase().trim() === "porton"
    && String(quote?.fulfillment_mode || "").trim() === "produccion"
    && (
      quote?.requires_measurement === true
      || hasMeasurementLine(quote?.lines)
    );`,
`  return ["porton", "puerta", "ipanel"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())
    && String(quote?.fulfillment_mode || "").trim() === "produccion"
    && (
      quote?.requires_measurement === true
      || hasMeasurementLine(quote?.lines)
    );`,
    'quotes defer sync kinds',
    'return ["porton", "puerta", "ipanel"].includes(String(quote?.catalog_kind || "porton").toLowerCase().trim())',
  );

  s = replaceOnce(
    s,
    "                  and coalesce(q.catalog_kind, 'porton') = 'porton'",
    "                  and coalesce(q.catalog_kind, 'porton') in ('porton', 'ipanel', 'puerta')",
    'quotes production_sent kind filter',
    "and coalesce(q.catalog_kind, 'porton') in ('porton', 'ipanel', 'puerta')",
  );

  write(rel, s);
}

function updateMeasurementsRoutes() {
  const rel = 'cotizador-back/src/routes/measurements.routes.js';
  let s = read(rel);

  s = replaceOnce(
    s,
`function quoteAllowsMeasurementWorkflow(quote) {
  return (
    String(quote?.catalog_kind || "").toLowerCase().trim() === "porton" &&
    isMeasurementReadyQuote(quote) &&
    quoteRequiresMeasurementWorkflow(quote)
  );
}`,
`function quoteAllowsMeasurementWorkflow(quote) {
  const kind = String(quote?.catalog_kind || "porton").toLowerCase().trim();
  const kindAllowsCircuit = ["porton", "puerta"].includes(kind) || (kind === "ipanel" && isTecnicaOnlyQuote(quote));
  return (
    kindAllowsCircuit &&
    isMeasurementReadyQuote(quote) &&
    quoteRequiresMeasurementWorkflow(quote)
  );
}`,
    'measurements allowed kinds',
    'const kindAllowsCircuit = ["porton", "puerta"].includes(kind) || (kind === "ipanel" && isTecnicaOnlyQuote(quote));',
  );

  s = replaceOnce(
    s,
`function validateFinalDimensions(form) {
  const altoFinal = String(form?.alto_final_mm || "").trim();
  const anchoFinal = String(form?.ancho_final_mm || "").trim();
  if (!altoFinal) return "Falta alto_final_mm";
  if (!anchoFinal) return "Falta ancho_final_mm";
  return null;
}`,
`function validateFinalDimensions(form) {
  const altoFinal = String(form?.alto_final_mm || "").trim();
  const anchoFinal = String(form?.ancho_final_mm || "").trim();
  if (!altoFinal) return "Falta alto_final_mm";
  if (!anchoFinal) return "Falta ancho_final_mm";
  return null;
}
function isDoorQuote(quote) {
  return String(quote?.catalog_kind || "").toLowerCase().trim() === "puerta";
}
function normalizeMeasurementAxis(values = []) {
  return (Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean);
}
function validateDoorMeasurementPointCount(quote, form) {
  if (!isDoorQuote(quote)) return null;
  const altos = normalizeMeasurementAxis(form?.esquema?.alto || []);
  const anchos = normalizeMeasurementAxis(form?.esquema?.ancho || []);
  if (altos.length !== 2 || anchos.length !== 2) {
    return "Para puertas se deben cargar exactamente 2 medidas de alto y 2 medidas de ancho.";
  }
  return null;
}
function detectDoorBudgetSectionChangeByMedidor({ quote, form, baselineForm }) {
  if (!isDoorQuote(quote)) return false;
  const keys = [
    "__selected_binding_product",
    "__fallback_selected_section_products",
    "__budget_section_override",
  ];
  return keys.some((key) => valuesDiffer(form?.[key], baselineForm?.[key]));
}`,
    'measurements door helpers',
    'function validateDoorMeasurementPointCount(quote, form) {',
  );

  s = replaceOnce(
    s,
    '        "q.catalog_kind = \'porton\'",',
    '        "coalesce(q.catalog_kind, \'porton\') in (\'porton\', \'puerta\', \'ipanel\')",',
    'measurements list kind filter',
    "coalesce(q.catalog_kind, 'porton') in ('porton', 'puerta', 'ipanel')",
  );

  s = replaceOnce(
    s,
`      const areaGuard = await buildMeasurementSurfaceGuard({ quote, form });
      const observationReason = buildObservationReturnReason(form);`,
`      const areaGuard = await buildMeasurementSurfaceGuard({ quote, form });
      if (submit) {
        const doorMeasuresErr = validateDoorMeasurementPointCount(quote, form);
        if (doorMeasuresErr) return res.status(400).json({ ok: false, error: doorMeasuresErr });
      }
      if (submit && u?.is_medidor && detectDoorBudgetSectionChangeByMedidor({ quote, form, baselineForm })) {
        return res.status(400).json({
          ok: false,
          error: "En puertas el medidor no puede cambiar secciones/productos. Deja observaciones para devolverlo al vendedor o envia a aprobacion tecnica final.",
        });
      }
      const observationReason = buildObservationReturnReason(form);`,
    'measurements door medidor guard',
    'detectDoorBudgetSectionChangeByMedidor({ quote, form, baselineForm })',
  );

  s = replaceOnce(
    s,
`      if (act === "approve") {
        const form = quote?.measurement_form || {};
        const finalDimsErr = validateFinalDimensions(form);`,
`      if (act === "approve") {
        const form = quote?.measurement_form || {};
        const doorMeasuresErr = validateDoorMeasurementPointCount(quote, form);
        if (doorMeasuresErr) return res.status(400).json({ ok: false, error: doorMeasuresErr });
        const finalDimsErr = validateFinalDimensions(form);`,
    'measurements final review door point count',
    'const doorMeasuresErr = validateDoorMeasurementPointCount(quote, form);',
  );

  write(rel, s);
}

function updateQuotesSchema() {
  const rel = 'cotizador-back/src/quotesSchema.js';
  let s = read(rel);
  s = replaceOnce(
    s,
`  await dbQuery(
    \`
      update public.presupuestador_quotes
      set requires_measurement = true,
          measurement_mode = 'medidor',
          measurement_subtype = 'normal',
          measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end
      where catalog_kind = 'porton'
        and status = 'synced_odoo'
        and fulfillment_mode = 'produccion'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem
          where (elem->>'product_id') = any($1::text[])
        )
    \`,
    [measurementProductIds],
  );

  await ensureSettingsTable();`,
`  await dbQuery(
    \`
      update public.presupuestador_quotes
      set requires_measurement = true,
          measurement_mode = 'medidor',
          measurement_subtype = 'normal',
          measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end
      where catalog_kind = 'porton'
        and status = 'synced_odoo'
        and fulfillment_mode = 'produccion'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem
          where (elem->>'product_id') = any($1::text[])
        )
    \`,
    [measurementProductIds],
  );

  await dbQuery(\`
    update public.presupuestador_quotes
       set requires_measurement = false,
           measurement_mode = 'medidor',
           measurement_subtype = 'normal',
           measurement_status = 'none'
     where catalog_kind = 'ipanel'
       and fulfillment_mode = 'acopio'
       and coalesce(measurement_status, 'none') <> 'approved'
  \`);

  await dbQuery(\`
    update public.presupuestador_quotes
       set requires_measurement = true,
           measurement_mode = 'tecnica_only',
           measurement_subtype = 'sin_medicion',
           measurement_status = case
             when measurement_status = 'approved' then measurement_status
             else 'pending'
           end
     where catalog_kind = 'ipanel'
       and fulfillment_mode = 'produccion'
       and quote_kind = 'original'
       and coalesce(final_sale_order_id, 0) = 0
       and coalesce(final_status, '') not in ('synced_odoo', 'syncing_odoo')
       and status in ('pending_approvals', 'synced_odoo', 'syncing_odoo')
  \`);

  await ensureSettingsTable();`,
    'quotesSchema ipanel migrations',
    "where catalog_kind = 'ipanel'",
  );
  write(rel, s);
}

function updateMeasurementFinalization() {
  const rel = 'cotizador-back/src/measurementFinalization.js';
  let s = read(rel);

  s = replaceOnce(
    s,
`function extractNvInteger(value) {`,
`function getReferenceFamilyPrefix(quote) {
  const kind = String(quote?.catalog_kind || quote?.payload?.catalog_kind || "porton").toLowerCase().trim();
  if (kind === "ipanel") return "I";
  if (kind === "plegados") return "PL";
  if (kind === "puerta") return "P";
  if (kind === "otros") return "O";
  return "";
}
function extractNvInteger(value) {`,
    'measurementFinalization reference family helper',
    'function getReferenceFamilyPrefix(quote) {',
  );

  s = replaceOnce(
    s,
`  const referenceNv = refNo
    ? \`NV\${refNo}\`
    : \`NV\${toText(revisionQuote?.quote_number || originalQuote?.quote_number)}\`;`,
`  const familyPrefix = getReferenceFamilyPrefix(revisionQuote || sourceQuote || originalQuote || {});
  const referenceNv = refNo
    ? \`\${familyPrefix}NV\${refNo}\`
    : \`\${familyPrefix}NV\${toText(revisionQuote?.quote_number || originalQuote?.quote_number)}\`;`,
    'measurementFinalization family prefix NV',
    'const familyPrefix = getReferenceFamilyPrefix(revisionQuote || sourceQuote || originalQuote || {});',
  );

  s = replaceOnce(
    s,
`async function buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm }) {
  const sourceQuote = await resolveBaseSourceQuote(originalQuote);
  const legacyMappings = await getMeasurementProductMappings();`,
`async function buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm }) {
  const sourceQuote = await resolveBaseSourceQuote(originalQuote);
  if (String(originalQuote?.catalog_kind || sourceQuote?.catalog_kind || "").toLowerCase().trim() === "ipanel") {
    const pricingPayload = sourceQuote?.payload || originalQuote?.payload || {};
    const positiveLines = buildBasePositiveLinesFromQuote(sourceQuote || originalQuote);
    const positiveTotal = totalLinesAmount(positiveLines, pricingPayload, sourceQuote || originalQuote);
    const discountLine = buildDiscountPreviewLine({
      originalQuote,
      absorbedSurfaceAmount: 0,
      positiveTotal,
    });
    const finalLines = discountLine ? [...positiveLines, discountLine] : positiveLines;
    const finalAmountToCharge = totalLinesAmount(finalLines, pricingPayload, sourceQuote || originalQuote);
    return {
      source_quote_id: sourceQuote?.id || originalQuote?.id || null,
      source_quote: sourceQuote,
      generated_lines: finalLines,
      priced_positive_lines: positiveLines,
      metrics: {
        detailed_total: positiveTotal,
        tolerance_percent: 0,
        tolerance_amount: 0,
        tolerance_area_m2: 0,
        source_surface_m2: computeQuoteSurfaceM2(sourceQuote || originalQuote),
        final_surface_m2: computeQuoteSurfaceM2(sourceQuote || originalQuote),
        surface_diff_m2: 0,
        surface_chargeable_diff_m2: 0,
        surface_absorbed_diff_m2: 0,
        source_surface_amount: positiveTotal,
        final_surface_amount: positiveTotal,
        surface_increment_amount: 0,
        surface_absorbed_amount: 0,
        surface_chargeable_amount: 0,
        extra_amount: 0,
        difference_amount: finalAmountToCharge,
        absorbed_by_company: false,
        final_amount_to_charge: finalAmountToCharge,
        reference_nv: referenceNumberFromQuote(originalQuote, null),
      },
    };
  }
  const legacyMappings = await getMeasurementProductMappings();`,
    'measurementFinalization ipanel finalization branch',
    'String(originalQuote?.catalog_kind || sourceQuote?.catalog_kind || "").toLowerCase().trim() === "ipanel"',
  );

  write(rel, s);
}

function updateMedicionDetailPage() {
  const rel = 'cotizador-front/src/pages/MedicionDetailPage/index.jsx';
  let s = read(rel);

  s = replaceOnce(
    s,
`function minTripleFinalMm(values = [], fallback = "") {
  const min = minMm(values);
  if (min > 0) return String(Math.round(min));
  return text(fallback);
}`,
`function minTripleFinalMm(values = [], fallback = "") {
  const min = minMm(values);
  if (min > 0) return String(Math.round(min));
  return text(fallback);
}
function quoteCatalogKind(quote) {
  return String(quote?.catalog_kind || quote?.payload?.catalog_kind || "porton").toLowerCase().trim();
}
function isDoorQuote(quote) {
  return quoteCatalogKind(quote) === "puerta";
}
function isIpanelQuote(quote) {
  return quoteCatalogKind(quote) === "ipanel";
}
function measurementPointCount(quote) {
  return isDoorQuote(quote) ? 2 : 3;
}`,
    'MedicionDetail quote kind helpers',
    'function quoteCatalogKind(quote) {',
  );

  s = replaceOnce(
    s,
`function normalizeTriple(values = [], suggested = "") {
  const arr = Array.isArray(values) ? values.slice(0, 3).map((v) => text(v)) : [];
  while (arr.length < 3) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[1] = suggested;
  return arr;
}`,
`function normalizeTriple(values = [], suggested = "", count = 3) {
  const safeCount = Math.max(1, Number(count || 3) || 3);
  const arr = Array.isArray(values) ? values.slice(0, safeCount).map((v) => text(v)) : [];
  while (arr.length < safeCount) arr.push("");
  if (!arr.some(Boolean) && suggested) arr[Math.min(1, safeCount - 1)] = suggested;
  return arr;
}`,
    'MedicionDetail normalizeTriple count',
    'function normalizeTriple(values = [], suggested = "", count = 3) {',
  );

  s = replaceOnce(
    s,
`  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  const esquemaAlto = normalizeTriple(current?.esquema?.alto || [], suggestedAlto);
  const esquemaAncho = normalizeTriple(current?.esquema?.ancho || [], suggestedAncho);`,
`  const suggestedAlto = extractBudgetDimensionMm(quote, "alto");
  const suggestedAncho = extractBudgetDimensionMm(quote, "ancho");
  const pointCount = measurementPointCount(quote);
  const esquemaAlto = normalizeTriple(current?.esquema?.alto || [], suggestedAlto, pointCount);
  const esquemaAncho = normalizeTriple(current?.esquema?.ancho || [], suggestedAncho, pointCount);`,
    'MedicionDetail initial form point count',
    'const pointCount = measurementPointCount(quote);',
  );

  s = replaceOnce(
    s,
`function updateSchemeValue(form, axis, index, value) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || []),
    ancho: normalizeTriple(form.esquema?.ancho || []),
  };`,
`function updateSchemeValue(form, axis, index, value, count = 3) {
  const next = {
    ...(form.esquema || {}),
    alto: normalizeTriple(form.esquema?.alto || [], "", count),
    ancho: normalizeTriple(form.esquema?.ancho || [], "", count),
  };`,
    'MedicionDetail updateSchemeValue point count',
    'function updateSchemeValue(form, axis, index, value, count = 3) {',
  );

  s = replaceOnce(
    s,
`function MeasurementSchemeVisual({ form }) {
  const altos = normalizeTriple(form?.esquema?.alto || []);
  const anchos = normalizeTriple(form?.esquema?.ancho || []);`,
`function MeasurementSchemeVisual({ form, pointCount = 3 }) {
  const altos = normalizeTriple(form?.esquema?.alto || [], "", pointCount);
  const anchos = normalizeTriple(form?.esquema?.ancho || [], "", pointCount);
  const altoRects = SCHEME_RECT_PCTS.alto.slice(0, pointCount);
  const anchoRects = SCHEME_RECT_PCTS.ancho.slice(0, pointCount);`,
    'MedicionDetail visual point count vars',
    'const altoRects = SCHEME_RECT_PCTS.alto.slice(0, pointCount);',
  );

  s = replaceOnce(s, 'Esquema de 3 medidas de alto y 3 de ancho', 'Esquema de {pointCount} medidas de alto y {pointCount} de ancho', 'MedicionDetail visual label', 'Esquema de {pointCount} medidas de alto');
  s = replaceOnce(s, '        {SCHEME_RECT_PCTS.alto.map((rect, idx) => (', '        {altoRects.map((rect, idx) => (', 'MedicionDetail visual altos rects', 'altoRects.map');
  s = replaceOnce(s, '        {SCHEME_RECT_PCTS.ancho.map((rect, idx) => (', '        {anchoRects.map((rect, idx) => (', 'MedicionDetail visual anchos rects', 'anchoRects.map');

  s = replaceOnce(
    s,
`  const editableConfiguredFields = useMemo(() => {
    return allFields.filter((field) => {`,
`  const editableConfiguredFields = useMemo(() => {
    if (isDoorQuote(quote) && isMedidor && !isTechnical) return [];
    if (isIpanelQuote(quote)) return [];
    return allFields.filter((field) => {`,
    'MedicionDetail disable medidor sections door/ipanel configured',
    'if (isDoorQuote(quote) && isMedidor && !isTechnical) return [];',
  );
  s = replaceOnce(s, '  }, [allFields, dynamicUi.hidden, allowedSectionIds]);', '  }, [allFields, dynamicUi.hidden, allowedSectionIds, quote, isMedidor, isTechnical]);', 'MedicionDetail configured fields deps', '[allFields, dynamicUi.hidden, allowedSectionIds, quote, isMedidor, isTechnical]');

  s = replaceOnce(
    s,
`  const fallbackSections = useMemo(() => {
    const byId = budgetContext?.budget_sections?.by_id || {};`,
`  const fallbackSections = useMemo(() => {
    if (isDoorQuote(quote) && isMedidor && !isTechnical) return [];
    if (isIpanelQuote(quote)) return [];
    const byId = budgetContext?.budget_sections?.by_id || {};`,
    'MedicionDetail disable medidor sections door/ipanel fallback',
    'if (isIpanelQuote(quote)) return [];',
  );
  s = replaceOnce(s, '  }, [budgetContext, editableConfiguredFields, catalogQ.data, allowedSectionIds]);', '  }, [budgetContext, editableConfiguredFields, catalogQ.data, allowedSectionIds, quote, isMedidor, isTechnical]);', 'MedicionDetail fallback deps', '[budgetContext, editableConfiguredFields, catalogQ.data, allowedSectionIds, quote, isMedidor, isTechnical]');

  s = replaceOnce(
    s,
`  const returnPath =
    (typeof location.state?.from === "string" && location.state.from.trim()) || "/mediciones";
  const editableCount = editableConfiguredFields.length + fallbackSections.length;`,
`  const returnPath =
    (typeof location.state?.from === "string" && location.state.from.trim()) || "/mediciones";
  const pointCount = measurementPointCount(quote);
  const kindLabel = isIpanelQuote(quote) ? "Ipanel" : isDoorQuote(quote) ? "puerta" : "porton";
  const editableCount = editableConfiguredFields.length + fallbackSections.length;`,
    'MedicionDetail render point count kind label',
    'const kindLabel = isIpanelQuote(quote) ? "Ipanel"',
  );

  s = replaceOnce(s, '  const pageTitle = isTechnical ? "Revisión técnica final" : "Medición";', '  const pageTitle = isTechnical ? `Revisión técnica final ${kindLabel}` : `Medición de ${kindLabel}`;', 'MedicionDetail pageTitle', 'Medicion de ${kindLabel}');
  s = replaceOnce(s, '<MeasurementSchemeVisual form={form} />', '<MeasurementSchemeVisual form={form} pointCount={pointCount} />', 'MedicionDetail visual prop', 'pointCount={pointCount}');
  s = replaceOnce(s, '            {[0, 1, 2].map((idx) => (', '            {Array.from({ length: pointCount }, (_, idx) => idx).map((idx) => (', 'MedicionDetail altos map count', 'Array.from({ length: pointCount }');
  s = replaceOnce(s, 'onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", idx, v))}', 'onChange={(v) => setForm((prev) => updateSchemeValue(prev, "alto", idx, v, pointCount))}', 'MedicionDetail alto update count', 'updateSchemeValue(prev, "alto", idx, v, pointCount)');
  s = replaceOnce(s, '            {[0, 1, 2].map((idx) => (', '            {Array.from({ length: pointCount }, (_, idx) => idx).map((idx) => (', 'MedicionDetail anchos map count', 'Array.from({ length: pointCount }');
  s = replaceOnce(s, 'onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", idx, v))}', 'onChange={(v) => setForm((prev) => updateSchemeValue(prev, "ancho", idx, v, pointCount))}', 'MedicionDetail ancho update count', 'updateSchemeValue(prev, "ancho", idx, v, pointCount)');
  s = replaceOnce(s, '<Field label="Medidas finales del portón">', '<Field label={`Medidas finales del ${kindLabel}`}>', 'MedicionDetail final dimensions label', 'Medidas finales del ${kindLabel}');

  write(rel, s);
}

function main() {
  updateQuotesRoutes();
  updateMeasurementsRoutes();
  updateQuotesSchema();
  updateMeasurementFinalization();
  updateMedicionDetailPage();

  console.log('Listo. Archivos actualizados:');
  for (const rel of changed) console.log(`- ${rel}`);
  if (skipped.length) {
    console.log('\nSaltos seguros:');
    for (const item of skipped) console.log(`- ${item}`);
  }
}

main();
