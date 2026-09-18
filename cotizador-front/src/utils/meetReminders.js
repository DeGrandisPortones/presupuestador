// Registro de que aviso "en X minutos" ya se disparo para un horario puntual, para no
// repetirlo en cada poll mientras la reunion sigue dentro de esa ventana. Vive en
// localStorage (no en memoria) para que sobreviva un refresh de pagina justo en medio
// de la ventana de aviso.
const KEY = "dg_meet_reminders_fired_v1";
const MAX_ENTRIES = 200;

function readFired() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function hasReminderFired(slotId, thresholdMinutes) {
  return readFired().has(`${slotId}-${thresholdMinutes}`);
}

export function markReminderFired(slotId, thresholdMinutes) {
  const set = readFired();
  set.add(`${slotId}-${thresholdMinutes}`);
  const trimmed = [...set].slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // no-op
  }
}
