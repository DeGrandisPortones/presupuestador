import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetTechnicalMeasurementRules } from "../../../api/admin.js";
import { getCatalogBootstrap } from "../../../api/catalog.js";
import { getPrices } from "../../../api/odoo";
import { getOdooBootstrap, setOdooBootstrap } from "../../../domain/odoo/bootstrap.js";
import { useQuoteStore } from "../../../domain/quote/store";

const APTOS_PARA_REVESTIR_TYPE = "para_revestir_con_al_pvc_otros";
const PARANTES_SPECIAL_PRODUCT_ID = 3006;
const PARANTES_INTERNAL_ODOO_PRODUCT_ID = 3538;
const PARAM_PRODUCT_ID_KEYS = [
  "parantes_pricing_product_id",
  "parantes_price_product_id",
  "parantes_odoo_product_id",
  "parantes_auto_product_id",
  "producto_parantes_id",
  "producto_precio_parantes_id",
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isAptoParaRevestir(portonType) {
  const value = normalizeText(portonType).replace(/\s+/g, "_");
  return value === APTOS_PARA_REVESTIR_TYPE || value.includes("revestir");
}

function normalizeOrientation(value) {
  const text = normalizeText(value);
  return text.includes("horizontal") ? "horizontal" : "vertical";
}

function parsePositiveInt(value) {
  const n = Number(String(value || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function hasContent(value) {
  return !!(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function getRulesParams(rulesData) {
  const root = rulesData || {};
  const portonRules = root.catalog_rules?.porton || {};
  return {
    ...(hasContent(root.measurement_surface_params) ? root.measurement_surface_params : {}),
    ...(hasContent(root.surface_params) ? root.surface_params : {}),
    ...(hasContent(root.surface_calc_params) ? root.surface_calc_params : {}),
    ...(hasContent(root.surface_parameters) ? root.surface_parameters : {}),
    ...(hasContent(root.parantes_config) ? root.parantes_config : {}),
    ...(hasContent(portonRules.measurement_surface_params) ? portonRules.measurement_surface_params : {}),
    ...(hasContent(portonRules.surface_params) ? portonRules.surface_params : {}),
    ...(hasContent(portonRules.surface_calc_params) ? portonRules.surface_calc_params : {}),
    ...(hasContent(portonRules.surface_parameters) ? portonRules.surface_parameters : {}),
    ...(hasContent(portonRules.parantes_config) ? portonRules.parantes_config : {}),
  };
}

function getConfiguredProductId(params) {
  for (const key of PARAM_PRODUCT_ID_KEYS) {
    const id = parsePositiveInt(params?.[key]);
    if (id > 0) return id;
  }
  return 0;
}

function removeAutoParantesLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !line?.auto_parantes_pricing_line || !!line?.locked_qty);
}

function getClientFacingProductName(product = {}) {
  return String(
    product?.client_display_name ||
      product?.raw_name ||
      product?.rawName ||
      product?.original_name ||
      product?.name ||
      product?.display_name ||
      "",
  ).trim();
}

function getProductLabel(product = {}) {
  return String(
    product?.display_name ||
      product?.alias ||
      product?.internal_alias ||
      getClientFacingProductName(product) ||
      "",
  ).trim();
}

function matchesConfiguredProduct(product, productId) {
  const id = Number(productId || 0);
  if (!id) return false;
  return [
    product?.id,
    product?.product_id,
    product?.presupuestador_id,
    product?.presupuestador_product_id,
    product?.catalog_product_id,
    product?.odoo_id,
    product?.odoo_external_id,
    product?.odoo_variant_id,
    product?.odoo_template_id,
  ].some((value) => Number(value || 0) === id);
}

function resolveCatalogProduct(catalogData, productId) {
  const products = Array.isArray(catalogData?.products) ? catalogData.products : [];
  return products.find((product) => matchesConfiguredProduct(product, productId)) || null;
}

function getCatalogOdooProductId(catalogProduct) {
  if (!catalogProduct) return 0;
  const candidates = [
    catalogProduct?.odoo_variant_id,
    catalogProduct?.odoo_external_id,
    catalogProduct?.odoo_id,
    catalogProduct?.odoo_template_id,
  ];
  for (const value of candidates) {
    const n = Number(value || 0);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return 0;
}

function resolveParantesOdooProductId({ configuredProductId, catalogProduct }) {
  const fromCatalog = getCatalogOdooProductId(catalogProduct);
  if (fromCatalog > 0) return fromCatalog;

  // En el dashboard quedó guardado 3006 como ID del presupuestador para la línea automática,
  // pero en Odoo 3006 corresponde a "SIN PUERTA DE PASO PEATONAL". El producto real de
  // "Parante Interno" en Odoo es el template 3538, que /api/odoo/prices ya resuelve bien.
  if (Number(configuredProductId || 0) === PARANTES_SPECIAL_PRODUCT_ID) return PARANTES_INTERNAL_ODOO_PRODUCT_ID;

  return Number(configuredProductId || 0) || 0;
}

function buildPlaceholderLine({ productId, odooProductId, qty, multiplier, existing = null, catalogProduct = null }) {
  const previousMultiplier = Number(existing?.auto_parantes_pricing_multiplier || 1) || 1;
  const storedRaw = Number(existing?.auto_parantes_pricing_raw_price || 0) || 0;
  const inferredRaw = !storedRaw && Number(existing?.basePrice || 0) > 0
    ? Number(existing.basePrice || 0) / previousMultiplier
    : 0;
  const rawPrice = storedRaw || inferredRaw || 0;
  const basePrice = rawPrice > 0 ? rawPrice * multiplier : Number(existing?.basePrice || 0) || 0;
  const catalogName = getProductLabel(catalogProduct);
  const catalogRawName = getClientFacingProductName(catalogProduct);
  const effectiveOdooProductId = Number(odooProductId || productId || 0) || productId;
  const lockedQty = !!existing?.locked_qty;
  const effectiveQty = lockedQty ? (Number(existing.qty) || qty) : qty;

  return {
    ...(existing || {}),
    product_id: effectiveOdooProductId,
    presupuestador_product_id: productId,
    catalog_product_id: productId,
    odoo_external_id: Number(catalogProduct?.odoo_variant_id || catalogProduct?.odoo_external_id || existing?.odoo_external_id || existing?.odoo_variant_id || effectiveOdooProductId) || effectiveOdooProductId,
    odoo_variant_id: Number(catalogProduct?.odoo_variant_id || catalogProduct?.odoo_external_id || existing?.odoo_variant_id || existing?.odoo_external_id || effectiveOdooProductId) || effectiveOdooProductId,
    odoo_id: Number(catalogProduct?.odoo_id || existing?.odoo_id || 0) || 0,
    odoo_template_id: Number(catalogProduct?.odoo_template_id || existing?.odoo_template_id || effectiveOdooProductId) || effectiveOdooProductId,
    name: catalogName || String(existing?.name || "").trim() || "Parante Interno",
    raw_name: catalogRawName || String(existing?.raw_name || "").trim() || catalogName || "Parante Interno",
    code: catalogProduct?.code ?? existing?.code ?? null,
    qty: effectiveQty,
    locked_qty: lockedQty,
    basePrice,
    integer_qty: true,
    locked_line: true,
    auto_parantes_pricing_line: true,
    auto_parantes_pricing_raw_price: rawPrice,
    auto_parantes_pricing_multiplier: multiplier,
    auto_parantes_configured_product_id: productId,
    auto_parantes_odoo_product_id: effectiveOdooProductId,
    line_key: `auto-parantes-pricing-${productId}`,
  };
}

export default function PortonParantesPricingSync() {
  const pricelistId = useQuoteStore((state) => state.pricelistId);
  const partnerId = useQuoteStore((state) => state.partnerId);
  const lines = useQuoteStore((state) => state.lines);
  const dimensions = useQuoteStore((state) => state.dimensions);
  const portonType = useQuoteStore((state) => state.portonType);
  const paranteQtyLocked = useQuoteStore((state) => state.paranteQtyLocked);

  const rulesQ = useQuery({
    queryKey: ["technical-rules-parantes-pricing-sync", "porton"],
    queryFn: () => adminGetTechnicalMeasurementRules("porton"),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const params = useMemo(() => getRulesParams(rulesQ.data), [rulesQ.data]);
  const productId = useMemo(() => getConfiguredProductId(params), [params]);
  const qty = useMemo(() => parsePositiveInt(dimensions?.cantidad_parantes), [dimensions?.cantidad_parantes]);
  const orientation = useMemo(() => normalizeOrientation(dimensions?.orientacion_parantes), [dimensions?.orientacion_parantes]);
  const multiplier = orientation === "horizontal" ? 2 : 1;
  const shouldApply = productId > 0 && qty > 0 && isAptoParaRevestir(portonType) && !paranteQtyLocked;

  const catalogQ = useQuery({
    queryKey: ["catalog-bootstrap-parantes-pricing-sync", "porton", productId],
    queryFn: async () => {
      const cached = getOdooBootstrap("porton");
      if (Array.isArray(cached?.products) && cached.products.length) return cached;
      const data = await getCatalogBootstrap("porton");
      setOdooBootstrap(data, "porton");
      return data;
    },
    enabled: productId > 0,
    staleTime: 60 * 1000,
  });

  const catalogProduct = useMemo(() => {
    const fromQuery = resolveCatalogProduct(catalogQ.data, productId);
    if (fromQuery) return fromQuery;
    return resolveCatalogProduct(getOdooBootstrap("porton"), productId);
  }, [catalogQ.data, productId]);

  const odooProductId = useMemo(
    () => resolveParantesOdooProductId({ configuredProductId: productId, catalogProduct }),
    [productId, catalogProduct],
  );

  const catalogProductKey = useMemo(() => {
    if (!catalogProduct) return "";
    return JSON.stringify({
      id: catalogProduct.id,
      alias: catalogProduct.alias,
      display_name: catalogProduct.display_name,
      internal_alias: catalogProduct.internal_alias,
      client_display_name: catalogProduct.client_display_name,
      raw_name: catalogProduct.raw_name,
      name: catalogProduct.name,
      code: catalogProduct.code,
      odoo_id: catalogProduct.odoo_id,
      odoo_template_id: catalogProduct.odoo_template_id,
      odoo_variant_id: catalogProduct.odoo_variant_id,
      odoo_external_id: catalogProduct.odoo_external_id,
    });
  }, [catalogProduct]);

  useEffect(() => {
    useQuoteStore.setState((state) => {
      const current = Array.isArray(state.lines) ? state.lines : [];
      const autoLine = current.find((line) => line?.auto_parantes_pricing_line && Number(line.auto_parantes_configured_product_id || line.presupuestador_product_id || line.product_id) === productId) || null;
      const manualSameProduct = current.find((line) => Number(line.product_id) === productId && !line?.previously_billed_line) || null;

      if (!shouldApply) {
        const cleaned = removeAutoParantesLines(current);
        return cleaned.length === current.length ? {} : { lines: cleaned };
      }

      if (autoLine?.locked_qty) return {};

      const withoutAuto = removeAutoParantesLines(current).filter((line) => Number(line.product_id) !== productId || line?.previously_billed_line);
      const existing = autoLine || manualSameProduct || null;
      const nextLine = buildPlaceholderLine({ productId, odooProductId, qty, multiplier, existing, catalogProduct });
      return { lines: [...withoutAuto, nextLine] };
    });
  }, [shouldApply, productId, odooProductId, qty, multiplier, catalogProductKey]);

  useEffect(() => {
    if (!shouldApply || !odooProductId || !pricelistId) return undefined;

    let cancelled = false;
    async function run() {
      const data = await getPrices({
        pricelist_id: pricelistId,
        partner_id: partnerId,
        lines: [{ product_id: odooProductId, qty: 1 }],
      });
      if (cancelled) return;

      const priceRow = Array.isArray(data?.prices)
        ? data.prices.find((item) => Number(item.product_id) === odooProductId) || data.prices[0]
        : null;
      const rawPrice = Number(priceRow?.price || 0) || 0;
      const odooName = String(priceRow?.name || "").trim();
      const code = priceRow?.code || null;
      const catalogName = getProductLabel(catalogProduct);
      const catalogRawName = getClientFacingProductName(catalogProduct);

      useQuoteStore.setState((state) => {
        const current = Array.isArray(state.lines) ? state.lines : [];
        let changed = false;
        const next = current.map((line) => {
          if (!line?.auto_parantes_pricing_line || Number(line.auto_parantes_configured_product_id || line.presupuestador_product_id || line.product_id) !== productId) return line;
          changed = true;
          return {
            ...line,
            product_id: odooProductId,
            presupuestador_product_id: productId,
            catalog_product_id: productId,
            name: catalogName || line.name || odooName || `Producto ${odooProductId}`,
            raw_name: catalogRawName || odooName || line.raw_name || line.name || `Producto ${odooProductId}`,
            code: catalogProduct?.code ?? code ?? line.code ?? null,
            odoo_external_id: Number(catalogProduct?.odoo_variant_id || catalogProduct?.odoo_external_id || line.odoo_external_id || line.odoo_variant_id || odooProductId) || odooProductId,
            odoo_variant_id: Number(catalogProduct?.odoo_variant_id || catalogProduct?.odoo_external_id || line.odoo_variant_id || line.odoo_external_id || odooProductId) || odooProductId,
            odoo_id: Number(catalogProduct?.odoo_id || line.odoo_id || 0) || 0,
            odoo_template_id: Number(catalogProduct?.odoo_template_id || priceRow?.odoo_template_id || line.odoo_template_id || odooProductId) || odooProductId,
            basePrice: rawPrice * multiplier,
            auto_parantes_pricing_raw_price: rawPrice,
            auto_parantes_pricing_multiplier: multiplier,
            auto_parantes_configured_product_id: productId,
            auto_parantes_odoo_product_id: odooProductId,
          };
        });
        return changed ? { lines: next } : {};
      });
    }

    run().catch((err) => {
      console.error("[Parantes pricing] No se pudo cargar precio desde Odoo", err);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldApply, productId, odooProductId, pricelistId, partnerId, multiplier, catalogProductKey]);

  useEffect(() => {
    if (!shouldApply) return;
    const autoLine = (Array.isArray(lines) ? lines : []).find((line) => line?.auto_parantes_pricing_line && Number(line.auto_parantes_configured_product_id || line.presupuestador_product_id || line.product_id) === productId);
    if (!autoLine) return;
    if (autoLine.locked_qty) return;
    if (Number(autoLine.qty) === qty && Number(autoLine.auto_parantes_pricing_multiplier || 1) === multiplier) return;
    useQuoteStore.setState((state) => ({
      lines: (Array.isArray(state.lines) ? state.lines : []).map((line) => {
        if (!line?.auto_parantes_pricing_line || Number(line.auto_parantes_configured_product_id || line.presupuestador_product_id || line.product_id) !== productId) return line;
        const rawPrice = Number(line.auto_parantes_pricing_raw_price || 0) || 0;
        return {
          ...line,
          product_id: odooProductId || line.product_id,
          presupuestador_product_id: productId,
          catalog_product_id: productId,
          qty,
          auto_parantes_pricing_multiplier: multiplier,
          auto_parantes_configured_product_id: productId,
          auto_parantes_odoo_product_id: odooProductId || line.auto_parantes_odoo_product_id,
          basePrice: rawPrice > 0 ? rawPrice * multiplier : line.basePrice,
        };
      }),
    }));
  }, [lines, shouldApply, productId, odooProductId, qty, multiplier]);

  return null;
}
