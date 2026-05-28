const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/pages/QuoteDetailPage/index.jsx');
if (!fs.existsSync(file)) {
  console.log('[quote-detail-medidas-paso] Archivo no encontrado, se omite.');
  process.exit(0);
}

let src = fs.readFileSync(file, 'utf8');
let changed = false;

function replaceOnce(pattern, replacement, label) {
  const next = src.replace(pattern, replacement);
  if (next !== src) {
    src = next;
    changed = true;
    console.log(`[quote-detail-medidas-paso] ${label}`);
    return true;
  }
  return false;
}

// El detalle de aprobación estaba recalculando las medidas técnicas con una
// fórmula vieja. Estas funciones copian los mismos criterios que usa
// PortonDimensions en el presupuestador.
if (!src.includes('function resolveDefaultKgM2FromTypeForApproval(portonType, params)')) {
  const helpers = `
function resolveDefaultKgM2FromTypeForApproval(portonType, params) {
  const t = normTechnicalText(portonType);
  if (t.includes("inyect") || t.includes("doble_iny") || t.endsWith("_iny") || t.includes("_iny_")) {
    return getNumberParamForApproval(params, ["injected_kg_m2", "kg_m2_inyectado"], 25);
  }
  return getNumberParamForApproval(params, ["classic_kg_m2", "kg_m2_clasico", "kg_m2_clasico_estandar"], 15);
}

function getOptionalNumberParamForApproval(params, keys) {
  for (const key of keys) {
    const raw = params?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const value = Number(String(raw).replace(",", "."));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function getPasoWidthDiscountByLegMmForApproval(legsKey, params) {
  const key = String(legsKey || "").trim().toLowerCase();
  const defaults = {
    angostas: 80,
    comunes: 110,
    anchas: 150,
    superanchas: 200,
    especiales: 200,
  };
  const keyMap = {
    angostas: ["paso_width_discount_angostas_mm", "paso_ancho_descuento_angostas_mm", "step_width_discount_angostas_mm"],
    comunes: ["paso_width_discount_comunes_mm", "paso_ancho_descuento_comunes_mm", "step_width_discount_comunes_mm"],
    anchas: ["paso_width_discount_anchas_mm", "paso_ancho_descuento_anchas_mm", "step_width_discount_anchas_mm"],
    superanchas: ["paso_width_discount_superanchas_mm", "paso_ancho_descuento_superanchas_mm", "step_width_discount_superanchas_mm"],
    especiales: ["paso_width_discount_especiales_mm", "paso_ancho_descuento_especiales_mm", "step_width_discount_especiales_mm"],
  };
  const selectedKey = Object.prototype.hasOwnProperty.call(keyMap, key) ? key : "angostas";
  const configured = getOptionalNumberParamForApproval(params, keyMap[selectedKey]);
  if (configured !== null) return configured;
  return defaults[selectedKey];
}
`;
  if (!replaceOnce(/\nfunction isAptoDerivedTypeForApproval\(portonType\) \{/, `${helpers}\nfunction isAptoDerivedTypeForApproval(portonType) {`, 'helpers de cálculo insertados')) {
    throw new Error('No se pudo insertar helpers de medidas de paso en QuoteDetailPage.');
  }
}

// Unificar kg/m2 efectivo con el presupuestador: si el vendedor no cargó kg/m2,
// usar los defaults configurables que ya usa PortonDimensions.
replaceOnce(
  /const aptoKg = aptoParaRevestir \? resolveAptoKgM2ByProductsForApproval\(quote, params\) : 0;\s*const inferredKg = inferKgM2FromTypeForApproval\(portonType\);\s*const sellerKgM2 = resolveSellerKgM2EntryForApproval\(quote, params\);\s*const effectiveKgM2 = aptoParaRevestir \? \(aptoKg \|\| sellerKgM2 \|\| inferredKg\) : \(sellerKgM2 \|\| inferredKg\);/,
  `const aptoKg = aptoParaRevestir ? resolveAptoKgM2ByProductsForApproval(quote, params) : 0;
  const inferredKg = inferKgM2FromTypeForApproval(portonType);
  const sellerKgM2 = resolveSellerKgM2EntryForApproval(quote, params);
  const defaultKgM2 = resolveDefaultKgM2FromTypeForApproval(portonType, params);
  const effectiveKgM2 = aptoParaRevestir
    ? (aptoKg || sellerKgM2 || defaultKgM2 || inferredKg)
    : (sellerKgM2 || inferredKg || defaultKgM2);`,
  'kg/m2 efectivo unificado'
);

// Reemplazar la fórmula vieja de medidas de paso en detalle por la misma fórmula
// que usa el presupuestador en PortonDimensions.
replaceOnce(
  /let altoPasoMm = discountedHeightMm;\s*let anchoPasoMm = discountedWidthMm;\s*if \(installationMode === "detras_vano"\) \{[\s\S]*?\n  \}/,
  `const pasoHeightDiscountMm = getNumberParamForApproval(
    params,
    ["paso_height_discount_mm", "paso_alto_descuento_mm", "step_height_discount_mm"],
    110,
  );
  const pasoWidthDiscountMm = getPasoWidthDiscountByLegMmForApproval(legsKey, params);
  const altoPasoMm = Math.max(0, heightMm - pasoHeightDiscountMm);
  const anchoPasoMm = Math.max(0, widthMm - pasoWidthDiscountMm);`,
  'fórmula de medidas de paso corregida'
);

// Mostrar en el mismo orden que el presupuestador: ancho x alto.
replaceOnce(
  /pushApprovalContextRow\(rows, "Medidas de paso", preview\.altoPasoMm > 0 && preview\.anchoPasoMm > 0 \? `\$\{formatMetersFromMmForApproval\(preview\.altoPasoMm\)\} x \$\{formatMetersFromMmForApproval\(preview\.anchoPasoMm\)\}` : ""\);/,
  'pushApprovalContextRow(rows, "Medidas de paso", preview.altoPasoMm > 0 && preview.anchoPasoMm > 0 ? `${formatMetersFromMmForApproval(preview.anchoPasoMm)} x ${formatMetersFromMmForApproval(preview.altoPasoMm)}` : "");',
  'orden ancho x alto corregido'
);

if (changed) {
  fs.writeFileSync(file, src, 'utf8');
  console.log('[quote-detail-medidas-paso] Patch aplicado.');
} else {
  console.log('[quote-detail-medidas-paso] Sin cambios; ya estaba aplicado o no coincidió el patrón.');
}
