// Diff entre las lineas "originales" (antes de que el vendedor edite un
// presupuesto devuelto por medicion/tecnica/comercial) y las lineas actuales,
// para mostrarle a Comercial que cambio antes de aprobar.
//
// Los montos usan resolveLineFinalUnitPrice/calcTotals (mismas funciones que arma
// el resto de la pantalla de aprobación) para que "Total original"/"Total editado"
// coincidan con lo que realmente se sincroniza a Odoo (margen del vendedor +
// condición de venta) en vez de una suma cruda de qty*basePrice.
import { calcTotals, calcLineTotal, resolveLineFinalUnitPrice } from "./pricing.js";

const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;
const IVA_RATE_FOR_DIFF = 0.21;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isPreviouslyBilledLine(line) {
  return line?.previously_billed_line === true || Number(line?.product_id) === PREVIOUSLY_BILLED_PRODUCT_ID;
}

function stripPreviouslyBilledLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !isPreviouslyBilledLine(line));
}

function lineDisplayName(line) {
  return String(line?.name || line?.raw_name || (line?.product_id ? `Producto ${line.product_id}` : "Línea sin nombre")).trim();
}

function lineDiffKey(line) {
  const pid = Number(line?.product_id || 0);
  if (Number.isFinite(pid) && pid > 0) return `pid:${pid}`;
  const code = String(line?.code || "").trim();
  if (code) return `code:${code}`;
  return `name:${lineDisplayName(line).toLowerCase()}`;
}

// Agrupa por key para tolerar lineas duplicadas del mismo producto.
function aggregateLines(lines, marginPercent, financingPercent, conditionMode) {
  const map = new Map();
  for (const line of lines) {
    const key = lineDiffKey(line);
    const qty = Number(line?.qty || 0) || 0;
    const unit = resolveLineFinalUnitPrice(line, marginPercent, financingPercent, conditionMode);
    const amount = calcLineTotal(qty, unit);
    const prev = map.get(key);
    map.set(
      key,
      prev
        ? { key, name: prev.name, qty: round2(prev.qty + qty), amount: round2(prev.amount + amount) }
        : { key, name: lineDisplayName(line), qty, amount },
    );
  }
  return map;
}

export function computeCommercialLinesDiff(originalLines, currentLines, opts = {}) {
  const {
    originalMarginPercent = 0,
    currentMarginPercent = 0,
    originalConditionMode = "cond1",
    currentConditionMode = "cond1",
    originalFinancingPercent = 0,
    currentFinancingPercent = 0,
  } = opts;

  const cleanOriginal = stripPreviouslyBilledLines(originalLines);
  const cleanCurrent = stripPreviouslyBilledLines(currentLines);

  const originalTotal = calcTotals(cleanOriginal, originalMarginPercent, IVA_RATE_FOR_DIFF, originalFinancingPercent, originalConditionMode).total;
  const currentTotal = calcTotals(cleanCurrent, currentMarginPercent, IVA_RATE_FOR_DIFF, currentFinancingPercent, currentConditionMode).total;
  const diffAmount = round2(currentTotal - originalTotal);
  const diffPercent = originalTotal !== 0 ? round2((diffAmount / Math.abs(originalTotal)) * 100) : null;

  const originalMap = aggregateLines(cleanOriginal, originalMarginPercent, originalFinancingPercent, originalConditionMode);
  const currentMap = aggregateLines(cleanCurrent, currentMarginPercent, currentFinancingPercent, currentConditionMode);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, cur] of currentMap) {
    if (!originalMap.has(key)) added.push({ key, name: cur.name, qty: cur.qty, amount: cur.amount });
  }
  for (const [key, orig] of originalMap) {
    const cur = currentMap.get(key);
    if (!cur) {
      removed.push({ key, name: orig.name, qty: orig.qty, amount: orig.amount });
      continue;
    }
    if (orig.qty !== cur.qty || orig.amount !== cur.amount) {
      changed.push({
        key,
        name: cur.name,
        original_qty: orig.qty,
        current_qty: cur.qty,
        original_amount: orig.amount,
        current_amount: cur.amount,
      });
    }
  }

  return {
    originalTotal,
    currentTotal,
    diffAmount,
    diffPercent,
    added,
    removed,
    changed,
    hasChanges: !!(added.length || removed.length || changed.length),
  };
}
