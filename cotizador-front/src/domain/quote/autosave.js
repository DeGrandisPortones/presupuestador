const AUTOSAVE_PREFIX = "dflex_presupuestador_autosave";

function cleanText(value) {
  return String(value || "").trim();
}

function safeJsonParse(value) {
  try { return JSON.parse(value); } catch (_err) { return null; }
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return cleanText(value) !== "";
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "boolean") return value === true;
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "object") return Object.values(value).some(hasValue);
  return false;
}

function hasCustomerContent(customer = {}) {
  const c = customer && typeof customer === "object" ? customer : {};
  return [
    c.name,
    c.first_name,
    c.last_name,
    c.phone,
    c.email,
    c.address,
    c.city,
    c.maps_url,
  ].some(hasValue);
}

function hasPayloadContent(payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const dimensions = p?.payload?.dimensions || p?.dimensions || {};
  const innerPayload = p?.payload && typeof p.payload === "object" ? { ...p.payload } : {};
  delete innerPayload.dimensions;
  return hasCustomerContent(p.end_customer)
    || (Array.isArray(p.lines) && p.lines.length > 0)
    || hasValue(p.note)
    || hasValue(dimensions)
    || hasValue(innerPayload);
}

export function buildAutosaveUserKey(user = {}) {
  return cleanText(user?.id || user?.user_id || user?.username || user?.email || "anon").replace(/[^a-zA-Z0-9_.@-]+/g, "_") || "anon";
}

export function buildQuoteAutosaveKey({ user, catalogKind = "porton", quoteId = "new" } = {}) {
  const kind = cleanText(catalogKind || "porton").toLowerCase() || "porton";
  const id = cleanText(quoteId || "new") || "new";
  return `${AUTOSAVE_PREFIX}:${buildAutosaveUserKey(user)}:${kind}:${id}`;
}

export function hasAutosaveCustomerMinimum(payload = {}) {
  const c = payload?.end_customer || {};
  return !!(cleanText(c.first_name) && cleanText(c.last_name) && cleanText(c.phone));
}

export function canRemoteAutosaveQuote({ status = "draft", fulfillmentMode = "" } = {}) {
  const s = cleanText(status || "draft").toLowerCase();
  if (["draft", "rejected", "rejected_commercial", "rejected_technical"].includes(s)) return true;
  return s === "synced_odoo" && cleanText(fulfillmentMode).toLowerCase() === "acopio";
}

export function serializeAutosavePayload(payload = {}) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  return JSON.stringify({
    catalog_kind: safePayload.catalog_kind || safePayload.payload?.catalog_kind || "porton",
    created_by_role: safePayload.created_by_role || "",
    fulfillment_mode: safePayload.fulfillment_mode || "",
    pricelist_id: safePayload.pricelist_id || null,
    partner_id: safePayload.partner_id || null,
    bill_to_odoo_partner_id: safePayload.bill_to_odoo_partner_id || null,
    end_customer: safePayload.end_customer || {},
    lines: Array.isArray(safePayload.lines) ? safePayload.lines : [],
    payload: safePayload.payload || {},
    note: safePayload.note || null,
  });
}

export function writeAutosaveDraft(key, payload, extra = {}) {
  if (!key || typeof window === "undefined") return false;
  try {
    if (!hasPayloadContent(payload)) {
      window.localStorage?.removeItem(key);
      return false;
    }
    window.localStorage?.setItem(key, JSON.stringify({
      version: 1,
      saved_at: new Date().toISOString(),
      payload,
      extra: extra && typeof extra === "object" ? extra : {},
    }));
    return true;
  } catch (_err) {
    return false;
  }
}

export function readAutosaveDraft(key) {
  if (!key || typeof window === "undefined") return null;
  try {
    const parsed = safeJsonParse(window.localStorage?.getItem(key));
    if (!parsed || !parsed.payload || typeof parsed.payload !== "object") return null;
    if (!hasPayloadContent(parsed.payload)) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

export function clearAutosaveDraft(key) {
  if (!key || typeof window === "undefined") return;
  try { window.localStorage?.removeItem(key); } catch (_err) {}
}

export function clearAllAutosaveDrafts() {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  try {
    const storage = window.localStorage;
    if (!storage) return 0;
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (String(key || "").startsWith(`${AUTOSAVE_PREFIX}:`)) keys.push(key);
    }
    for (const key of keys) {
      storage.removeItem(key);
      removed += 1;
    }
  } catch (_err) {}
  return removed;
}

export function formatAutosaveTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
