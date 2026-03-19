function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const DEFAULT_FORMULA = "precio_ipanel + precio_venta_marco";
const VARIABLE_ALIASES = Object.freeze({
  precio_ipanel: "precio_ipanel",
  precio_compra_marco: "precio_compra_marco",
  precio_compra: "precio_compra_marco",
  precio_venta_marco: "precio_venta_marco",
  precio_venta: "precio_venta_marco",
});

const VARIABLE_KEYS = Object.freeze(Object.keys(VARIABLE_ALIASES));

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFormula(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  return raw || DEFAULT_FORMULA;
}

function canonicalizeAliases(formula) {
  let normalized = normalizeFormula(formula);
  const aliases = [...VARIABLE_KEYS].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const canonical = VARIABLE_ALIASES[alias];
    normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), canonical);
  }
  return normalized;
}

function injectVars(formula, vars) {
  let expr = ` ${canonicalizeAliases(formula)} `;
  const aliases = [...new Set(Object.values(VARIABLE_ALIASES))].sort((a, b) => b.length - a.length);
  for (const name of aliases) {
    const val = round2(vars?.[name] || 0);
    expr = expr.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), `(${val})`);
  }
  return expr;
}

function validateFormulaTokens(formula) {
  let stripped = canonicalizeAliases(formula);
  const aliases = [...new Set(Object.values(VARIABLE_ALIASES))].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    stripped = stripped.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), "");
  }
  if (!/^[0-9+\-*/().\s]*$/.test(stripped)) {
    throw new Error("La fórmula de puerta contiene caracteres no permitidos.");
  }
  return canonicalizeAliases(formula);
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

export function evaluateDoorQuoteFormula(formula, vars = {}) {
  const normalized = validateFormulaTokens(formula);
  const expr = validateFinalExpression(injectVars(normalized, vars));
  let result = 0;
  try {
    result = Function(`"use strict"; return (${expr});`)();
  } catch {
    throw new Error("La fórmula de puerta es inválida.");
  }
  if (!Number.isFinite(Number(result))) throw new Error("La fórmula de puerta devolvió un valor inválido.");
  return round2(result);
}

export function normalizeDoorQuoteFormula(value) {
  const normalized = validateFormulaTokens(value);
  evaluateDoorQuoteFormula(normalized, {
    precio_ipanel: 100,
    precio_compra_marco: 50,
    precio_venta_marco: 80,
  });
  return normalized;
}

export function getDoorQuoteFormulaVariablesHelp() {
  return [
    { key: "precio_ipanel", label: "Precio Ipanel" },
    { key: "precio_compra_marco", label: "Precio compra marco" },
    { key: "precio_compra", label: "Precio compra marco (alias)" },
    { key: "precio_venta_marco", label: "Precio venta marco" },
    { key: "precio_venta", label: "Precio venta marco (alias)" },
  ];
}

export { DEFAULT_FORMULA };
