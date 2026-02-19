// src/domain/odoo/bootstrap.js

// v2: incluye tags/secciones/alias
export const ODOO_BOOTSTRAP_KEY = "odoo_bootstrap_v2";

export function setOdooBootstrap(data) {
  if (!data) return;
  try {
    localStorage.setItem(ODOO_BOOTSTRAP_KEY, JSON.stringify({
      saved_at: new Date().toISOString(),
      ...data,
    }));
  } catch (_) {
    // ignore quota
  }
}

export function getOdooBootstrap() {
  try {
    const raw = localStorage.getItem(ODOO_BOOTSTRAP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function clearOdooBootstrap() {
  try {
    localStorage.removeItem(ODOO_BOOTSTRAP_KEY);
  } catch (_) {}
}
