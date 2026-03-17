function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const DEFAULT_FORMULA = "precio_ipanel + precio_venta_marco";
const ALLOWED_VARS = ["precio_ipanel", "precio_compra_marco", "precio_venta_marco"];

function normalizeFormula(value) {
  const s = String(value || "").trim();
  return s || DEFAULT_FORMULA;
}

function injectVars(formula, vars) {
  let expr = ` ${formula} `;
  for (const name of ALLOWED_VARS) {
    const val = round2(vars?.[name] || 0);
    expr = expr.replace(new RegExp(`\b${name}\b`, 'g'), `(${val})`);
  }
  return expr;
}

function validateFinalExpression(expr) {
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    throw new Error('La fórmula de puerta contiene caracteres no permitidos.');
  }
  return expr;
}

export function evaluateDoorQuoteFormula(formula, vars = {}) {
  const normalized = normalizeFormula(formula);
  const expr = validateFinalExpression(injectVars(normalized, vars));
  let result = 0;
  try {
    result = Function(`"use strict"; return (${expr});`)();
  } catch {
    throw new Error('La fórmula de puerta es inválida.');
  }
  if (!Number.isFinite(Number(result))) throw new Error('La fórmula de puerta devolvió un valor inválido.');
  return round2(result);
}

export function normalizeDoorQuoteFormula(value) {
  const normalized = normalizeFormula(value);
  evaluateDoorQuoteFormula(normalized, {
    precio_ipanel: 100,
    precio_compra_marco: 50,
    precio_venta_marco: 80,
  });
  return normalized;
}

export function getDoorQuoteFormulaVariablesHelp() {
  return [
    { key: 'precio_ipanel', label: 'Precio Ipanel' },
    { key: 'precio_compra_marco', label: 'Precio compra marco' },
    { key: 'precio_venta_marco', label: 'Precio venta marco' },
  ];
}

export { DEFAULT_FORMULA };
