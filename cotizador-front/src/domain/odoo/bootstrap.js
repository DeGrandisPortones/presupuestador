// src/domain/odoo/bootstrap.js
//
// v3: bootstrap POR TIPO de cotizador (porton / ipanel)

function keyFor(kind = "porton") {
  const k = (kind || "porton").toString().trim().toLowerCase();
  return `odoo_bootstrap_v3_${k}`;
}

export function setOdooBootstrap(data, kind = "porton") {
  if (!data) return;
  try {
    localStorage.setItem(
      keyFor(kind),
      JSON.stringify({
        saved_at: new Date().toISOString(),
        ...data,
      })
    );
  } catch (_) {
    // ignore quota
  }
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

export function clearOdooBootstrap(kind = "porton") {
  try {
    localStorage.removeItem(keyFor(kind));
  } catch (_) {}
}

export function clearAllBootstraps() {
  try {
    // best-effort: limpiamos los 2 conocidos
    localStorage.removeItem(keyFor("porton"));
    localStorage.removeItem(keyFor("ipanel"));
  } catch (_) {}
}
