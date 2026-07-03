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

export function calcFinalUnitPrice(basePrice, marginPercent, financingPercent = 0, conditionMode = "cond1", { skipAdjustment = false } = {}) {
  const base = Number(basePrice || 0);
  // "Facturado previamente" (deposito ya cobrado): dato duro, no se le aplica
  // coeficiente/margen ni recargo por forma de pago.
  if (skipAdjustment) return round2(base);
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

export function calcTotals(lines, marginPercent, ivaRate, financingPercent = 0, conditionMode = "cond1") {
  const effectiveAdjustmentPercent = resolveQuoteAdjustmentPercent(financingPercent, conditionMode);
  const effectiveIvaRate = resolveQuoteIvaRate(ivaRate, conditionMode);
  const subtotal = round2(
    (lines || []).reduce((acc, l) => {
      const finalUnit = calcFinalUnitPrice(l.basePrice, marginPercent, effectiveAdjustmentPercent, "cond1", { skipAdjustment: !!l?.previously_billed_line });
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
