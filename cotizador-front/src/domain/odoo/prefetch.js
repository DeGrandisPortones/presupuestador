import { getPricelists } from "../../api/odoo.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import { getOdooBootstrap, mergeOdooBootstrap, setOdooBootstrap } from "./bootstrap.js";
import { useAuthStore } from "../auth/store.js";

const KINDS = ["porton", "ipanel", "otros"];

function hasUsefulBootstrap(data) {
  return !!(data?.pricelists?.length || data?.products?.length || data?.sections?.length);
}

function storeBootstrap(kind, data, pricelists = null) {
  const current = getOdooBootstrap(kind) || {};
  const next = {
    ...current,
    ...(data || {}),
    pricelists: Array.isArray(pricelists) && pricelists.length ? pricelists : (data?.pricelists || current.pricelists || []),
  };
  setOdooBootstrap(next, kind);
  return next;
}

export async function prefetchOdooBootstrapInBackground({ loginBootstrap = null } = {}) {
  const authState = useAuthStore.getState();

  if (hasUsefulBootstrap(loginBootstrap)) {
    mergeOdooBootstrap(loginBootstrap, "porton");
    authState.setOdooStatus("online");
  }

  let pricelists = [];
  let anySuccess = hasUsefulBootstrap(loginBootstrap);

  try {
    pricelists = await getPricelists();
    if (Array.isArray(pricelists) && pricelists.length) {
      anySuccess = true;
      storeBootstrap("porton", getOdooBootstrap("porton") || {}, pricelists);
    }
  } catch (_) {
    // seguimos igual: la idea es no bloquear el login
  }

  const catalogResults = await Promise.allSettled(KINDS.map((kind) => getCatalogBootstrap(kind)));
  catalogResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    anySuccess = true;
    const kind = KINDS[index];
    storeBootstrap(kind, result.value, pricelists);
  });

  authState.setOdooStatus(anySuccess ? "online" : "offline");
  return anySuccess;
}
