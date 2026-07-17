export const CONDITION_2_IVA_RATE = 0.105;
// "Facturado previamente" (linea auto-generada al editar un presupuesto ya con NP, para
// generar la NV): el monto viene del deposit_amount que se mando a Odoo. En Condicion 1 ese
// monto es neto sin IVA (calcOdooUnitPrice en el backend no le suma nada), en Condicion 2 ya
// viene con el 10,5% incluido. Hay que sumarle el 21% aca en Condicion 1 para que reste con
// IVA, sino se le descuenta al cliente menos de lo que ya pago.
const PREVIOUSLY_BILLED_COND1_IVA_RATE = 0.21;

export function isCondition2Mode(conditionMode = "cond1") {
  return String(conditionMode || "").trim().toLowerCase() === "cond2";
}

export function resolveQuoteIvaRate(ivaRate, conditionMode = "cond1") {
  return isCondition2Mode(conditionMode) ? CONDITION_2_IVA_RATE : Number(ivaRate || 0);
}

export function resolveQuoteAdjustmentPercent(financingPercent = 0, _conditionMode = "cond1") {
  // Condición 2 ya no descuenta 10,5% en los productos.
  // Sólo se mantiene el recargo/descuento propio de la forma de pago.
  const financing = Number(financingPercent || 0) || 0;
  return round2(financing);
}

export function calcFinalUnitPrice(basePrice, marginPercent, financingPercent = 0, conditionMode = "cond1") {
  const base = Number(basePrice || 0);
  const m = Number(marginPercent || 0);
  const f = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
  const marginFactor = 1 + m / 100;
  const financingFactor = 1 + f / 100;
  return round2(base * marginFactor * financingFactor);
}

export function calcLineTotal(qty, unitPrice) {
  const q = Number(qty || 0);
  const p = Number(unitPrice || 0);
  return round2(q * p);
}

// "Facturado previamente" es un dato duro (deposit_amount ya facturado en la NP anterior):
// no se le aplica margen ni recargo por forma de pago, igual que en el PDF (buildLines en
// pdf.routes.js). Solo se le suma IVA cuando el monto guardado todavia no lo tiene (Condicion 1).
export function resolvePreviouslyBilledUnitPrice(basePrice, conditionMode = "cond1") {
  const base = Number(basePrice || 0);
  return isCondition2Mode(conditionMode) ? round2(base) : round2(base * (1 + PREVIOUSLY_BILLED_COND1_IVA_RATE));
}

// Lineas como "Descuento anticipo presupuesto X" llegan con basePrice:0 (no es un
// producto real de catalogo) y el monto de verdad en price_unit, ya definitivo
// (sin margen/financiacion) - es el mismo campo que syncFinalQuoteToOdoo prioriza
// al mandar la orden a Odoo. Si no lo respetamos aca, la pantalla muestra $0 para
// esa linea y el total se ve mas alto de lo que en realidad se va a facturar.
export function resolveLineFinalUnitPrice(line, marginPercent, financingPercent = 0, conditionMode = "cond1") {
  if (typeof line?.price_unit === "number" && Number.isFinite(line.price_unit)) {
    return round2(line.price_unit);
  }
  if (line?.previously_billed_line) {
    return resolvePreviouslyBilledUnitPrice(line?.basePrice, conditionMode);
  }
  return calcFinalUnitPrice(line?.basePrice, marginPercent, financingPercent, conditionMode);
}

// "Facturado previamente" ya viene con el IVA que le corresponde (ver
// resolvePreviouslyBilledUnitPrice): no puede sumarse al subtotal gravable y despues
// aplicarle el IVA de vuelta, o se le estaria cobrando IVA dos veces. Se resta aparte,
// directo del total final ya con impuestos - mismo criterio que el PDF (Subtotal / resta
// en rojo / Total real).
export function calcTotals(lines, marginPercent, ivaRate, financingPercent = 0, conditionMode = "cond1") {
  const effectiveAdjustmentPercent = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
  const effectiveIvaRate = resolveQuoteIvaRate(ivaRate, conditionMode);

  let subtotal = 0;
  let previouslyBilledTotal = 0;
  let hasPreviouslyBilled = false;
  for (const l of lines || []) {
    const finalUnit = resolveLineFinalUnitPrice(l, marginPercent, effectiveAdjustmentPercent, conditionMode);
    const total = calcLineTotal(l?.qty, finalUnit);
    if (l?.previously_billed_line) {
      previouslyBilledTotal += total;
      hasPreviouslyBilled = true;
    } else {
      subtotal += total;
    }
  }
  subtotal = round2(subtotal);
  previouslyBilledTotal = round2(previouslyBilledTotal);

  const iva = round2(subtotal * effectiveIvaRate);
  const total = round2(subtotal + iva + previouslyBilledTotal);

  return {
    subtotal,
    iva,
    total,
    ivaRate: effectiveIvaRate,
    financingPercent: round2(effectiveAdjustmentPercent),
    previouslyBilled: hasPreviouslyBilled ? previouslyBilledTotal : null,
  };
}

export function formatARS(n) {
  const num = Number(n || 0);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(num);
}

export function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
