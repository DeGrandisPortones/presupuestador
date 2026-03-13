const GOOGLE_MAPS_HOSTS = new Set([
  "maps.app.goo.gl",
  "www.google.com",
  "google.com",
  "maps.google.com",
  "g.page",
]);

function clean(v) {
  return String(v || "").trim();
}

export function onlyPhoneDigits(v) {
  return clean(v).replace(/\D/g, "");
}

export function validateArgentinaPhone(phone, { required = false } = {}) {
  const raw = clean(phone);
  if (!raw) return required ? "Completá el teléfono del cliente." : null;

  const digits = onlyPhoneDigits(raw);
  if (!digits) return required ? "Completá el teléfono del cliente." : null;
  if (digits.startsWith("54")) return "Ingresá el teléfono sin 54, sin 0 y sin 15.";
  if (digits.startsWith("0")) return "Ingresá el teléfono sin 0 en la característica.";
  if (![10, 11].includes(digits.length)) return "Ingresá el teléfono sin 0 y sin 15.";
  return null;
}

export function validateEmailAddress(email, { required = false } = {}) {
  const raw = clean(email);
  if (!raw) return required ? "Completá el correo del cliente." : null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  return ok ? null : "Ingresá un correo válido.";
}

export function validateGoogleMapsUrl(url, { required = false } = {}) {
  const raw = clean(url);
  if (!raw) return required ? "Completá el enlace de Google Maps." : null;

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "").toLowerCase();

    if (GOOGLE_MAPS_HOSTS.has(host)) return null;
    if (host.endsWith(".google.com") && pathname.includes("maps")) return null;
  } catch {}

  return "Ingresá un enlace válido de Google Maps.";
}
