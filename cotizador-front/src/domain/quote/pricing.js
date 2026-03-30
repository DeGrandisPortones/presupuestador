export function calcFinalUnitPrice(basePrice, marginPercent) {
    const base = Number(basePrice || 0);
    const m = Number(marginPercent || 0);
    const factor = 1 + m / 100;
    return round2(base * factor);
}

export function calcLineTotal(qty, unitPrice) {
    const q = Number(qty || 0);
    const p = Number(unitPrice || 0);
    return round2(q * p);
}

export function calcFinancingAmount(amount, financingPercent) {
  const base = Number(amount || 0);
  const percent = Number(financingPercent || 0);
  if (!Number.isFinite(base) || !Number.isFinite(percent) || percent <= 0) return 0;
  return round2(base * percent / 100);
}

export function calcTotals(lines, marginPercent, ivaRate, financingPercent = 0) {
  const subtotal = round2(
    (lines || []).reduce((acc, l) => {
      const finalUnit = calcFinalUnitPrice(l.basePrice, marginPercent);
      const total = calcLineTotal(l.qty, finalUnit);
      return acc + total;
    }, 0)
  );

  const iva = round2(subtotal * Number(ivaRate || 0));
  const totalWithoutFinancing = round2(subtotal + iva);
  const financingAmount = calcFinancingAmount(totalWithoutFinancing, financingPercent);
  const total = round2(totalWithoutFinancing + financingAmount);

  return {
    subtotal,
    iva,
    financingAmount,
    totalWithoutFinancing,
    total,
    financingPercent: round2(financingPercent),
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
