function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

const DEFAULT_FORMULA = "precio_ipanel + precio_venta_marco";

const VARIABLE_ALIASES = Object.freeze({
  precio_ipanel: ["precio_ipanel"],
  precio_compra_marco: ["precio_compra_marco", "precio_compra"],
  precio_venta_marco: ["precio_venta_marco", "precio_venta"],
});

const ALLOWED_TOKENS = Object.freeze(
  Object.values(VARIABLE_ALIASES).flat().sort((a, b) => b.length - a.length)
);

function normalizeFormula(value) {
  const raw = String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[×✕]/g, "*")
    .replace(/[÷]/g, "/")
    .trim();
  return raw || DEFAULT_FORMULA;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function injectVars(formula, vars) {
  let expr = ` ${formula} `;
  for (const [canonicalName, aliases] of Object.entries(VARIABLE_ALIASES)) {
    const val = round2(vars?.[canonicalName] || 0);
    for (const alias of aliases) {
      expr = expr.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), `(${val})`);
    }
  }
  return expr;
}

function validateFormulaTokens(formula) {
  let stripped = normalizeFormula(formula);
  for (const token of ALLOWED_TOKENS) {
    stripped = stripped.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "g"), "");
  }
  if (!/^[0-9+\-*/().\s]*$/.test(stripped)) {
    throw new Error("La fórmula de puerta contiene caracteres no permitidos.");
  }
  return normalizeFormula(formula);
}

function validateFinalExpression(expr) {
  const normalized = String(expr || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
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
    { key: "precio_compra", label: "Alias de precio_compra_marco" },
    { key: "precio_venta_marco", label: "Precio venta marco" },
    { key: "precio_venta", label: "Alias de precio_venta_marco" },
  ];
}

export { DEFAULT_FORMULA };
