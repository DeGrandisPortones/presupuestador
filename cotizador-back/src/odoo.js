// src/odoo.js
import axios from "axios";

function extractDoorOrderReferenceFromNote(note) {
  const raw = String(note || "");
  const match = raw.match(/PRESUPUESTADOR_PUERTA_ORDER_REF\s*:\s*([A-Z0-9/_-]+)/i);
  if (!match) return "";
  const ref = String(match[1] || "").trim().toUpperCase();
  return ref.startsWith("PNP") ? ref : "";
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? [n] : [];
}

export function createOdooClient({ url, db, username, password, companyId = null }) {
  const baseUrl = url.replace(/\/$/, "");
  const rootUrl = baseUrl.replace(/\/odoo$/, "");
  const jsonrpcUrl = `${rootUrl}/jsonrpc`;

  const ODOO_DB = db;
  const ODOO_USERNAME = username;
  const ODOO_PASSWORD = password;
  const ODOO_COMPANY_ID = companyId ? Number(companyId) : null;
  const doorOrderRefsById = new Map();

  let uidCache = null;
  let uidCacheAt = 0;
  const UID_TTL_MS = 10 * 60 * 1000;

  async function jsonrpcCall(params) {
    const payload = { jsonrpc: "2.0", method: "call", params, id: Date.now() };

    const { data } = await axios.post(jsonrpcUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    if (data?.error) {
      const msg = data.error?.data?.message || data.error?.message || "Odoo JSON-RPC error";
      const err = new Error(msg);
      err.odoo = data.error;
      err.debug = data.error?.data?.debug;
      throw err;
    }
    return data.result;
  }

  async function getUid() {
    const now = Date.now();
    if (uidCache && now - uidCacheAt < UID_TTL_MS) return uidCache;

    const uid = await jsonrpcCall({
      service: "common",
      method: "authenticate",
      args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
    });

    if (!uid) throw new Error("No se pudo autenticar en Odoo (uid vacío).");
    uidCache = uid;
    uidCacheAt = now;
    return uid;
  }

  function withCompanyContext(kwargs = {}) {
    const ctx = { ...(kwargs.context || {}) };
    const skipDefaultCompanyContext =
      kwargs.skipDefaultCompanyContext === true ||
      ctx.__skip_default_company_context === true;

    delete ctx.__skip_default_company_context;

    // Si un router pasa company_id / allowed_company_ids, respetamos ese contexto.
    // Esto permite consultar listas de Vert aunque ODOO_COMPANY_ID apunte a Dflex.
    const hasExplicitCompany =
      ctx.company_id != null ||
      (Array.isArray(ctx.allowed_company_ids) && ctx.allowed_company_ids.length > 0);

    if (!skipDefaultCompanyContext && ODOO_COMPANY_ID && !hasExplicitCompany) {
      ctx.company_id = ODOO_COMPANY_ID;
      ctx.allowed_company_ids = [ODOO_COMPANY_ID];
    }

    const finalKwargs = { ...kwargs, context: ctx };
    delete finalKwargs.skipDefaultCompanyContext;
    return finalKwargs;
  }

  async function executeKw(model, method, args = [], kwargs = {}) {
    const uid = await getUid();
    const finalKwargs = withCompanyContext(kwargs);
    const finalArgs = Array.isArray(args) ? args : [];

    if (model === "sale.order" && method === "create" && finalArgs[0] && typeof finalArgs[0] === "object") {
      const vals = { ...(finalArgs[0] || {}) };
      const ref = extractDoorOrderReferenceFromNote(vals.note);
      if (ref) {
        vals.origin = ref;
        vals.client_order_ref = ref;
        finalArgs[0] = vals;
      }
      const created = await jsonrpcCall({
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, finalArgs, finalKwargs],
      });
      const ids = normalizeIdList(created);
      if (ref) ids.forEach((id) => doorOrderRefsById.set(Number(id), ref));
      return created;
    }

    if (model === "sale.order" && method === "write" && Array.isArray(finalArgs[0]) && finalArgs[1] && typeof finalArgs[1] === "object") {
      const ids = normalizeIdList(finalArgs[0]);
      const ref = ids.map((id) => doorOrderRefsById.get(Number(id))).find(Boolean);
      if (ref) {
        finalArgs[1] = {
          ...(finalArgs[1] || {}),
          name: ref,
          origin: ref,
          client_order_ref: ref,
        };
      }
    }

    return jsonrpcCall({
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, finalArgs, finalKwargs],
    });
  }

  return { executeKw, _debugAuth: async () => getUid() };
}
