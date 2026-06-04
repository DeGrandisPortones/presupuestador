function keyFor(kind = "porton") {
  const k = (kind || "porton").toString().trim().toLowerCase();
  return `odoo_bootstrap_v3_${k}`;
}

function normalizeData(data) {
  return data && typeof data === "object" ? data : null;
}

export function setOdooBootstrap(data, kind = "porton") {
  const normalized = normalizeData(data);
  if (!normalized) return;
  try {
    localStorage.setItem(
      keyFor(kind),
      JSON.stringify({ saved_at: new Date().toISOString(), ...normalized })
    );
  } catch (_) {}
}

export function getOdooBootstrap(kind = "porton") {
  try {
    const raw = localStorage.getItem(keyFor(kind));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function mergeOdooBootstrap(patch, kind = "porton") {
  const current = getOdooBootstrap(kind) || {};
  const next = { ...current, ...(normalizeData(patch) || {}) };
  setOdooBootstrap(next, kind);
  return next;
}

export function hasAnyOdooBootstrap() {
  const kinds = ["porton", "ipanel", "plegados", "otros", "puerta"];
  return kinds.some((kind) => {
    const boot = getOdooBootstrap(kind);
    return !!(boot?.pricelists?.length || boot?.products?.length || boot?.sections?.length);
  });
}

export function clearOdooBootstrap(kind = "porton") {
  try { localStorage.removeItem(keyFor(kind)); } catch (_) {}
}

export function clearAllBootstraps() {
  try {
    for (const kind of ["porton", "ipanel", "plegados", "otros", "puerta"]) localStorage.removeItem(keyFor(kind));
  } catch (_) {}
}
