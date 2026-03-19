function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const DEFAULT_FORMULA = "precio_ipanel + precio_venta_marco";
const ALLOWED_VARS = ["precio_ipanel", "precio_compra_marco", "precio_venta_marco"];

function normalizeFormula(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^A-Za-z0-9_+\-*/().\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw || DEFAULT_FORMULA;
}

function injectVars(formula, vars) {
  let expr = ` ${formula} `;
  for (const name of ALLOWED_VARS) {
    const val = round2(vars?.[name] || 0);
    expr = expr.replace(new RegExp(`\\b${name}\\b`, "g"), `(${val})`);
  }
  return expr;
}

function validateFormulaTokens(formula) {
  const normalized = normalizeFormula(formula);
  const stripped = normalized
    .replace(/\bprecio_ipanel\b/g, "")
    .replace(/\bprecio_compra_marco\b/g, "")
    .replace(/\bprecio_venta_marco\b/g, "")
    .replace(/[0-9]+(?:\.[0-9]+)?/g, "")
    .replace(/[+\-*/().\s]/g, "");
  if (stripped.trim()) {
    throw new Error("La fórmula de puerta contiene caracteres no permitidos.");
  }
  return normalized;
}

function validateFinalExpression(expr) {
  const normalized = String(expr || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    throw new Error("La fórmula de puerta contiene caracteres no permitidos.");
  }
  return normalized;
}

function evaluateNormalizedFormula(normalized, vars = {}) {
  const expr = validateFinalExpression(injectVars(normalized, vars));
  let result = 0;
  try {
    result = Function(`"use strict"; return (${expr});`)();
  } catch {
    throw new Error("La fórmula de puerta es inválida.");
  }
  if (!Number.isFinite(Number(result))) {
    throw new Error("La fórmula de puerta devolvió un valor inválido.");
  }
  return round2(result);
}

export function evaluateDoorQuoteFormula(formula, vars = {}) {
  let normalized = DEFAULT_FORMULA;
  try {
    normalized = validateFormulaTokens(formula);
  } catch {
    normalized = DEFAULT_FORMULA;
  }
  return evaluateNormalizedFormula(normalized, vars);
}

export function normalizeDoorQuoteFormula(value) {
  let normalized = DEFAULT_FORMULA;
  try {
    normalized = validateFormulaTokens(value);
    evaluateNormalizedFormula(normalized, {
      precio_ipanel: 100,
      precio_compra_marco: 50,
      precio_venta_marco: 80,
    });
    return normalized;
  } catch {
    return DEFAULT_FORMULA;
  }
}

export function getDoorQuoteFormulaVariablesHelp() {
  return [
    { key: "precio_ipanel", label: "Precio Ipanel" },
    { key: "precio_compra_marco", label: "Precio compra marco" },
    { key: "precio_venta_marco", label: "Precio venta marco" },
  ];
}

export { DEFAULT_FORMULA };
