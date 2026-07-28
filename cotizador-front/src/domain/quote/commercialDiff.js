// Diff entre las lineas "originales" (antes de que el vendedor edite un
// presupuesto devuelto por medicion/tecnica/comercial) y las lineas actuales,
// para mostrarle a Comercial que cambio antes de aprobar.
const PREVIOUSLY_BILLED_PRODUCT_ID = -900001;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isPreviouslyBilledLine(line) {
  return line?.previously_billed_line === true || Number(line?.product_id) === PREVIOUSLY_BILLED_PRODUCT_ID;
}

function stripPreviouslyBilledLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !isPreviouslyBilledLine(line));
}

function lineAmount(line) {
  const qty = Number(line?.qty || 0) || 0;
  const basePrice = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  return qty * basePrice;
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
function aggregateLines(lines) {
  const map = new Map();
  for (const line of lines) {
    const key = lineDiffKey(line);
    const qty = Number(line?.qty || 0) || 0;
    const amount = round2(lineAmount(line));
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

export function computeCommercialLinesDiff(originalLines, currentLines) {
  const cleanOriginal = stripPreviouslyBilledLines(originalLines);
  const cleanCurrent = stripPreviouslyBilledLines(currentLines);
  const originalTotal = round2(cleanOriginal.reduce((acc, l) => acc + lineAmount(l), 0));
  const currentTotal = round2(cleanCurrent.reduce((acc, l) => acc + lineAmount(l), 0));
  const diffAmount = round2(currentTotal - originalTotal);
  const diffPercent = originalTotal !== 0 ? round2((diffAmount / Math.abs(originalTotal)) * 100) : null;

  const originalMap = aggregateLines(cleanOriginal);
  const currentMap = aggregateLines(cleanCurrent);
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
