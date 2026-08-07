import { getPricelists, preloadEffectivePriceCache } from "../../api/odoo.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import { getOdooBootstrap, mergeOdooBootstrap, setOdooBootstrap } from "./bootstrap.js";
import { useAuthStore } from "../auth/store.js";

const KINDS = ["porton", "ipanel", "plegados", "otros"];

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

  // La lista de precios del catalogo (arriba) trae nombres/metadata, pero NO los precios
  // en si de cada producto - eso lo pide aparte el cotizador (fetchPriceCacheForPricelist
  // en api/odoo.js) recien cuando el vendedor entra a cotizar, y esa espera es la que se
  // ve como "Cargando precio" en pantalla. Se precarga acá, en paralelo con el catalogo,
  // para que ya este tibio en cache (localStorage, 1hs de validez) para cuando el usuario
  // llegue al cotizador desde el menu - mismo mecanismo que ya usa App.jsx para el
  // refresco horario, solo que ahora tambien corre apenas se loguea.
  const [catalogResults] = await Promise.all([
    Promise.allSettled(KINDS.map((kind) => getCatalogBootstrap(kind))),
    preloadEffectivePriceCache().catch(() => null),
  ]);
  catalogResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    anySuccess = true;
    const kind = KINDS[index];
    storeBootstrap(kind, result.value, pricelists);
  });

  authState.setOdooStatus(anySuccess ? "online" : "offline");
  return anySuccess;
}
