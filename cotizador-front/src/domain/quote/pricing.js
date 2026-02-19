export function calcFinalUnitPrice(basePrice, marginPercent) {
    const base = Number(basePrice || 0);
    const m = Number (marginPercent || 0);
    const factor = 1 + m / 100;
    return round2(base * factor);
}

export function calcLineTotal(qty, unitPrice){
    const q = Number(qty || 0);
    const p = Number(unitPrice || 0);
    return round2(q * p);
}

export function calcTotals(lines, marginPercent, ivaRate) {
  const subtotal = round2(
    (lines || []).reduce((acc, l) => {
      const finalUnit = calcFinalUnitPrice(l.basePrice, marginPercent);
      const total = calcLineTotal(l.qty, finalUnit);
      return acc + total;
    }, 0)
  );

  const iva = round2(subtotal * Number(ivaRate || 0));
  const total = round2(subtotal + iva);

  return { subtotal, iva, total };
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