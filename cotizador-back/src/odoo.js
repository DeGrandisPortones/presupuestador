// src/odoo.js
import axios from "axios";

export function createOdooClient({ url, db, username, password, companyId = null }) {
  const baseUrl = url.replace(/\/$/, "");
  // JSON-RPC real está en la raíz:
  const rootUrl = baseUrl.replace(/\/odoo$/, "");
  const jsonrpcUrl = `${rootUrl}/jsonrpc`;

  const ODOO_DB = db;
  const ODOO_USERNAME = username;
  const ODOO_PASSWORD = password;
  const ODOO_COMPANY_ID = companyId ? Number(companyId) : null;

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
    if (ODOO_COMPANY_ID) {
      ctx.company_id = ODOO_COMPANY_ID;
      ctx.allowed_company_ids = [ODOO_COMPANY_ID];
    }
    return { ...kwargs, context: ctx };
  }

  async function executeKw(model, method, args = [], kwargs = {}) {
    const uid = await getUid();
    const finalKwargs = withCompanyContext(kwargs);

    return jsonrpcCall({
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, finalKwargs],
    });
  }

  async function commonVersion() {
    return jsonrpcCall({
      service: "common",
      method: "version",
      args: [],
    });
  }

  return {
    executeKw,
    _debugAuth: async () => getUid(),
    _debugVersion: async () => commonVersion(),
    _debugInfo: () => ({ rootUrl, jsonrpcUrl, db: ODOO_DB }),
  };
}
