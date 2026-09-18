// Aviso de "reserva nueva" para el header, mismo criterio que el badge de Tickets:
// sin tabla de "leido" en la base, la marca de "ultima vez que mire" vive en
// localStorage del navegador. La primera vez que se abre (sin marca todavia) se
// sella "ahora" como base en vez de contar todo el historico como "nuevo" - evita
// el bug de un badge inicial enorme que ya se vio y se corrigio en Tickets.
const LAST_SEEN_KEY = "dg_meet_bookings_last_seen_v1";

export function getMeetBookingsLastSeen() {
  try {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    if (stored) return stored;
  } catch {
    // localStorage no disponible (ventana privada, etc.) - seguimos sin persistir.
  }
  const now = new Date().toISOString();
  try {
    localStorage.setItem(LAST_SEEN_KEY, now);
  } catch {
    // no-op
  }
  return now;
}

export function markMeetBookingsSeenNow() {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(LAST_SEEN_KEY, now);
  } catch {
    // no-op
  }
  return now;
}
