export const CONDITION_2_IVA_RATE = 0.105;

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

// Lineas como "Descuento anticipo presupuesto X" llegan con basePrice:0 (no es un
// producto real de catalogo) y el monto de verdad en price_unit, ya definitivo
// (sin margen/financiacion) - es el mismo campo que syncFinalQuoteToOdoo prioriza
// al mandar la orden a Odoo. Si no lo respetamos aca, la pantalla muestra $0 para
// esa linea y el total se ve mas alto de lo que en realidad se va a facturar.
export function resolveLineFinalUnitPrice(line, marginPercent, financingPercent = 0, conditionMode = "cond1") {
  if (typeof line?.price_unit === "number" && Number.isFinite(line.price_unit)) {
    return round2(line.price_unit);
  }
  return calcFinalUnitPrice(line?.basePrice, marginPercent, financingPercent, conditionMode);
}

export function calcTotals(lines, marginPercent, ivaRate, financingPercent = 0, conditionMode = "cond1") {
  const effectiveAdjustmentPercent = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
  const effectiveIvaRate = resolveQuoteIvaRate(ivaRate, conditionMode);
  const subtotal = round2(
    (lines || []).reduce((acc, l) => {
      const finalUnit = resolveLineFinalUnitPrice(l, marginPercent, effectiveAdjustmentPercent, conditionMode);
      const total = calcLineTotal(l.qty, finalUnit);
      return acc + total;
    }, 0)
  );

  const iva = round2(subtotal * effectiveIvaRate);
  const total = round2(subtotal + iva);

  return {
    subtotal,
    iva,
    total,
    ivaRate: effectiveIvaRate,
    financingPercent: round2(effectiveAdjustmentPercent),
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
