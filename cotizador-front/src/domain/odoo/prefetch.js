import { getPricelists } from "../../api/odoo.js";
import { getCatalogBootstrap } from "../../api/catalog.js";
import { setOdooBootstrap } from "./bootstrap.js";

function mergeBootstrapWithPricelists(catalogData, pricelists) {
  return {
    ...(catalogData || {}),
    pricelists: Array.isArray(pricelists) ? pricelists : [],
    products: Array.isArray(catalogData?.products) ? catalogData.products : [],
  };
}

export async function prefetchOdooSessionData() {
  const pricelists = await getPricelists();

  const [portonCatalog, ipanelCatalog] = await Promise.all([
    getCatalogBootstrap("porton"),
    getCatalogBootstrap("ipanel"),
  ]);

  setOdooBootstrap(mergeBootstrapWithPricelists(portonCatalog, pricelists), "porton");
  setOdooBootstrap(mergeBootstrapWithPricelists(ipanelCatalog, pricelists), "ipanel");

  return {
    pricelists,
    portonCatalog,
    ipanelCatalog,
  };
}
