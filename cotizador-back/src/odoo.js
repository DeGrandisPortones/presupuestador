// src/odoo.js
import axios from "axios";

export function createOdooClient({ url, db, username, password, companyId = null }) {
  const baseUrl = String(url || "").replace(/\/+$/, "");
  const rootUrl = baseUrl.replace(/\/odoo$/, "");

  const ODOO_DB = db;
  const ODOO_USERNAME = username;
  const ODOO_PASSWORD = password;
  const ODOO_COMPANY_ID = companyId ? Number(companyId) : null;

  let uidCache = null;
  let uidCacheAt = 0;
  const UID_TTL_MS = 10 * 60 * 1000;

  let chosenMode = null; // "jsonrpc" | "web"
  let chosenBase = null;
  let sessionCookie = null;

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean).map((x) => String(x).replace(/\/+$/, "")))];
  }

  const webBaseCandidates = uniq([baseUrl, rootUrl]);
  const jsonrpcCandidates = uniq([
    `${rootUrl}/jsonrpc`,
    `${baseUrl}/jsonrpc`,
  ]);

  function withCompanyContext(kwargs = {}) {
    const ctx = { ...(kwargs.context || {}) };
    if (ODOO_COMPANY_ID) {
      ctx.company_id = ODOO_COMPANY_ID;
      ctx.allowed_company_ids = [ODOO_COMPANY_ID];
    }
    return { ...kwargs, context: ctx };
  }

  function extractCookie(setCookieHeader) {
    const values = Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader] : []);
    const cookieParts = values
      .map((entry) => String(entry || "").split(";")[0].trim())
      .filter(Boolean);
    return cookieParts.join("; ");
  }

  async function tryJsonRpc(params) {
    let lastErr = null;

    for (const jsonrpcUrl of jsonrpcCandidates) {
      try {
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

        chosenMode = "jsonrpc";
        chosenBase = jsonrpcUrl;
        return data.result;
      } catch (err) {
        lastErr = err;
        const status = err?.response?.status;
        if (status === 404 || status === 301 || status === 302 || status === 307 || status === 308) {
          continue;
        }
        throw err;
      }
    }

    if (lastErr) throw lastErr;
    throw new Error("No se pudo conectar por JSON-RPC");
  }

  async function authenticateWebAt(base) {
    const authUrl = `${base}/web/session/authenticate`;
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        db: ODOO_DB,
        login: ODOO_USERNAME,
        password: ODOO_PASSWORD,
      },
      id: Date.now(),
    };

    const res = await axios.post(authUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (res.status === 404) {
      const err = new Error(`Web authenticate 404 at ${authUrl}`);
      err.response = { status: 404 };
      throw err;
    }

    const cookie = extractCookie(res.headers?.["set-cookie"]);
    const result = res.data?.result || null;
    const uid = result?.uid;

    if (!uid || !cookie) {
      const err = new Error("No se pudo autenticar por /web/session/authenticate");
      err.response = { status: res.status || 500 };
      err.odoo = res.data;
      throw err;
    }

    return { uid, cookie, base };
  }

  async function ensureWebSession() {
    if (sessionCookie && uidCache && chosenMode === "web" && Date.now() - uidCacheAt < UID_TTL_MS && chosenBase) {
      return { uid: uidCache, cookie: sessionCookie, base: chosenBase };
    }

    let lastErr = null;
    for (const base of webBaseCandidates) {
      try {
        const session = await authenticateWebAt(base);
        sessionCookie = session.cookie;
        uidCache = session.uid;
        uidCacheAt = Date.now();
        chosenMode = "web";
        chosenBase = session.base;
        return session;
      } catch (err) {
        lastErr = err;
        const status = err?.response?.status;
        if (status === 404 || status === 301 || status === 302 || status === 307 || status === 308) {
          continue;
        }
        throw err;
      }
    }

    if (lastErr) throw lastErr;
    throw new Error("No se pudo autenticar por web");
  }

  async function callWebDataset({ model, method, args = [], kwargs = {} }) {
    const session = await ensureWebSession();
    const callUrl = `${session.base}/web/dataset/call_kw/${encodeURIComponent(model)}/${encodeURIComponent(method)}`;

    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        model,
        method,
        args,
        kwargs,
      },
      id: Date.now(),
    };

    const res = await axios.post(callUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Cookie: session.cookie,
      },
      timeout: 30000,
    });

    if (res.data?.error) {
      const msg = res.data.error?.data?.message || res.data.error?.message || "Odoo web call_kw error";
      const err = new Error(msg);
      err.odoo = res.data.error;
      err.debug = res.data.error?.data?.debug;
      throw err;
    }

    return res.data?.result;
  }

  async function getUid() {
    const now = Date.now();
    if (uidCache && now - uidCacheAt < UID_TTL_MS) return uidCache;

    try {
      const uid = await tryJsonRpc({
        service: "common",
        method: "authenticate",
        args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}],
      });

      if (!uid) throw new Error("No se pudo autenticar en Odoo (uid vacío).");
      uidCache = uid;
      uidCacheAt = now;
      return uid;
    } catch (jsonErr) {
      try {
        const session = await ensureWebSession();
        if (!session.uid) throw new Error("No se pudo autenticar en Odoo (uid vacío).");
        return session.uid;
      } catch (webErr) {
        const err = new Error(
          `No se pudo conectar a Odoo. JSON-RPC: ${jsonErr?.message || "error"} | WEB: ${webErr?.message || "error"}`
        );
        err.status = 502;
        err.odoo = {
          jsonrpcCandidates,
          webBaseCandidates,
        };
        throw err;
      }
    }
  }

  async function executeKw(model, method, args = [], kwargs = {}) {
    const finalKwargs = withCompanyContext(kwargs);

    if (chosenMode === "web" && chosenBase) {
      return callWebDataset({ model, method, args, kwargs: finalKwargs });
    }

    try {
      await getUid();

      if (chosenMode === "jsonrpc") {
        return await tryJsonRpc({
          service: "object",
          method: "execute_kw",
          args: [ODOO_DB, uidCache, ODOO_PASSWORD, model, method, args, finalKwargs],
        });
      }

      return await callWebDataset({ model, method, args, kwargs: finalKwargs });
    } catch (err) {
      if (chosenMode === "web") {
        return await callWebDataset({ model, method, args, kwargs: finalKwargs });
      }
      throw err;
    }
  }

  return {
    executeKw,
    _debugAuth: async () => getUid(),
    _debugInfo: () => ({
      baseUrl,
      rootUrl,
      chosenMode,
      chosenBase,
      jsonrpcCandidates,
      webBaseCandidates,
    }),
  };
}
