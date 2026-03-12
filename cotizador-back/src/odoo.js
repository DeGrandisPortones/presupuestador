// src/odoo.js
import axios from "axios";

export function createOdooClient({ url, db, username, password, companyId = null }) {
  const baseUrl = String(url || "").replace(/\/+$/, "");
  const ODOO_DB = db;
  const ODOO_USERNAME = username;
  const ODOO_PASSWORD = password;
  const ODOO_COMPANY_ID = companyId ? Number(companyId) : null;

  let uidCache = null;
  let uidCacheAt = 0;
  const UID_TTL_MS = 10 * 60 * 1000;

  let chosenJsonrpcUrl = null;

  function buildJsonrpcCandidates(inputUrl) {
    const clean = String(inputUrl || "").replace(/\/+$/, "");
    if (!clean) return [];

    const out = [];
    const add = (v) => {
      const s = String(v || "").replace(/\/+$/, "");
      if (!s) return;
      if (!out.includes(s)) out.push(s);
    };

    // Caso normal: ODOO_URL = https://dominio
    add(`${clean}/jsonrpc`);

    // Caso proxy/subruta: ODOO_URL = https://dominio/odoo
    if (clean.endsWith("/odoo")) {
      add(`${clean}/jsonrpc`);
      add(`${clean.slice(0, -5)}/jsonrpc`);
    } else {
      add(`${clean}/odoo/jsonrpc`);
    }

    return out;
  }

  const jsonrpcCandidates = buildJsonrpcCandidates(baseUrl);

  async function rawJsonrpcCall(jsonrpcUrl, params) {
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

  async function jsonrpcCall(params) {
    const tried = [];
    const errors = [];

    const candidates = [];
    if (chosenJsonrpcUrl) candidates.push(chosenJsonrpcUrl);
    for (const c of jsonrpcCandidates) {
      if (!candidates.includes(c)) candidates.push(c);
    }

    for (const jsonrpcUrl of candidates) {
      tried.push(jsonrpcUrl);
      try {
        const result = await rawJsonrpcCall(jsonrpcUrl, params);
        chosenJsonrpcUrl = jsonrpcUrl;
        return result;
      } catch (err) {
        const status = err?.response?.status;
        errors.push({
          url: jsonrpcUrl,
          status: status || null,
          message: err?.message || "Unknown error",
        });

        if (status === 404 || status === 301 || status === 302 || status === 307 || status === 308) {
          continue;
        }

        err.message = `${err.message} [jsonrpc=${jsonrpcUrl}]`;
        throw err;
      }
    }

    const err = new Error(
      `No se pudo conectar a Odoo por JSON-RPC. Probé: ${tried.join(" | ")}`
    );
    err.status = 502;
    err.odoo = { candidates: errors };
    throw err;
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

  return {
    executeKw,
    _debugAuth: async () => getUid(),
    _debugInfo: () => ({
      baseUrl,
      chosenJsonrpcUrl,
      jsonrpcCandidates,
    }),
  };
}
