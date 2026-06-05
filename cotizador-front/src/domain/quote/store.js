import { create } from "zustand";

const EMPTY_CUSTOMER = {
  name: "",
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address: "",
  maps_url: "",
  city: "",
};

const INTEGER_QTY_PRODUCT_IDS = new Set([3582, 3251]);
const SHIPPING_PRODUCT_IDS = new Set([2842]);
// Productos que el distribuidor puede valorizar para su presupuesto al cliente,
// pero que De Grandis no debe cobrar: en proforma/Odoo van siempre a $0.
const DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS = new Set([2842, 3956, 3957, 3961, 3962, 3963, 3966, 4037, 3991, 3992, 3993, 3994, 3995, 3996, 3485, 3486, 3490, 3491, 3492, 3495, 3566, 3520, 3521, 3522, 3523, 3524, 3525]);

function normMarginInput(v) {
  return String(v ?? "").replace(",", ".").trim();
}
function parseMargin(v) {
  const s = normMarginInput(v);
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function parseDimensionNumber(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function isIntegerQtyProductId(productId) {
  return INTEGER_QTY_PRODUCT_IDS.has(Number(productId));
}
function isShippingProductId(productId) {
  return SHIPPING_PRODUCT_IDS.has(Number(productId));
}
function isDistributorOwnSupplyProductId(productId) {
  return DISTRIBUTOR_OWN_SUPPLY_PRODUCT_IDS.has(Number(productId));
}

function dflexQuoteDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("DFLEX_DEBUG_COTIZADOR") === "1";
  } catch (_err) {
    return false;
  }
}
function dflexLineSnapshot(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    product_id: Number(line?.product_id || 0) || 0,
    name: line?.name || line?.raw_name || "",
    qty: line?.qty,
    basePrice: line?.basePrice,
    surface_quantity: !!line?.surface_quantity,
    free_quantity: !!line?.free_quantity,
    quantity_editable: !!line?.quantity_editable,
    manual_price: !!line?.manual_price,
    auto_system_item: !!line?.auto_system_item,
    previously_billed_line: !!line?.previously_billed_line,
  }));
}
function dflexQuoteDebug(action, payload = {}) {
  if (!dflexQuoteDebugEnabled()) return;
  try {
    console.groupCollapsed(`[DFLEX COTIZADOR] ${action}`);
    console.log(payload);
    if (payload?.includeStack) console.trace(`[DFLEX COTIZADOR] ${action} stack`);
    console.groupEnd();
  } catch (_err) {}
}
function isFreeQuantityLine(line) {
  return isShippingProductId(line?.product_id) || !!line?.free_quantity || !!line?.quantity_editable || String(line?.quantity_mode || "").toLowerCase() === "free";
}
function isProtectedLine(line) {
  return !!line?.auto_system_item || !!line?.surface_quantity || !!line?.previously_billed_line;
}
function normalizeIntegerQty(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}
function normalizeFreeQty(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, round2(n));
}
function normalizeEditableQty({ productId, qty, surfaceQuantity = false, freeQuantity = false }) {
  if (surfaceQuantity || freeQuantity) {
    return normalizeFreeQty(qty);
  }
  if (isIntegerQtyProductId(productId)) {
    return normalizeIntegerQty(qty);
  }
  return 1;
}
function getSurfaceQuantity(dimensions) {
  return round2(
    parseDimensionNumber(dimensions?.width) * parseDimensionNumber(dimensions?.height),
  );
}
function syncSurfaceLines(lines, dimensions) {
  const currentLines = Array.isArray(lines) ? lines : [];
  const area = getSurfaceQuantity(dimensions);
  return currentLines
    .filter((line) => !line?.auto_system_item)
    .map((line) => {
      if (line?.surface_quantity) return { ...line, qty: area };
      if (isFreeQuantityLine(line)) {
        return { ...line, qty: normalizeFreeQty(line?.qty) };
      }
      if (isIntegerQtyProductId(line?.product_id)) {
        return { ...line, qty: normalizeIntegerQty(line?.qty) };
      }
      return { ...line, qty: 1 };
    });
}
function applyDerivedLines(lines, _portonType, dimensions) {
  return syncSurfaceLines(lines, dimensions);
}
function splitCustomerName(endCustomer = {}) {
  const directFirst = String(endCustomer?.first_name || "").trim();
  const directLast = String(endCustomer?.last_name || "").trim();
  if (directFirst || directLast) return { first_name: directFirst, last_name: directLast };
  const fullName = String(endCustomer?.name || "").trim();
  if (!fullName) return { first_name: "", last_name: "" };
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "", last_name: "" };
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}
function buildCustomerName(customer = {}) {
  const first = String(customer?.first_name || "").trim();
  const last = String(customer?.last_name || "").trim();
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return String(customer?.name || "").trim();
}
function cleanText(value) {
  return String(value || "").trim();
}
function getInternalVisibleName(product = {}) {
  return cleanText(
    product?.display_name ||
    product?.alias ||
    product?.internal_alias ||
    product?.name ||
    product?.client_display_name ||
    product?.raw_name ||
    product?.original_name ||
    ""
  );
}
function getClientFacingName(product = {}) {
  return cleanText(
    product?.client_display_name ||
    product?.raw_name ||
    product?.rawName ||
    product?.original_name ||
    product?.name ||
    product?.display_name ||
    ""
  );
}
function toPositiveInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}
function resolveOdooExternalId(source = {}) {
  return toPositiveInt(
    source?.odoo_variant_id ||
    source?.odoo_product_id ||
    source?.odoo_external_id ||
    source?.product_id ||
    source?.odoo_id ||
    0
  );
}
function normalizeLoadedDimensions(dims = {}) {
  const source = dims && typeof dims === "object" ? dims : {};
  return {
    ...source,
    width: source?.width ?? "",
    height: source?.height ?? "",
    kg_m2: source?.kg_m2 ?? "",
  };
}

export const useQuoteStore = create((set, get) => ({
  quoteId: null,
  status: "draft",
  rejectionNotes: null,
  pricelistId: null,
  pricelistName: "",
  marginPercent: 0,
  marginPercentInput: "",
  partnerId: null,
  fulfillmentMode: "produccion",
  conditionMode: "cond1",
  conditionText: "",
  paymentMethod: "",
  note: "",
  portonType: "",
  endCustomer: { ...EMPTY_CUSTOMER },
  dimensions: { width: "", height: "", kg_m2: "" },
  lines: [],
  reset() {
    set({
      quoteId: null,
      status: "draft",
      rejectionNotes: null,
      pricelistId: null,
      pricelistName: "",
      marginPercent: 0,
      marginPercentInput: "",
      partnerId: null,
      fulfillmentMode: "produccion",
      conditionMode: "cond1",
      conditionText: "",
      paymentMethod: "",
      note: "",
      portonType: "",
      endCustomer: { ...EMPTY_CUSTOMER },
      dimensions: { width: "", height: "", kg_m2: "" },
      lines: [],
    });
  },
  loadFromQuote(quote) {
    const q = quote || {};
    const end = q.end_customer || {};
    const splitName = splitCustomerName(end);
    const lines = Array.isArray(q.lines) ? q.lines : [];
    const payload = q.payload || {};
    const dims = payload?.dimensions || {};
    const loadedDimensions = normalizeLoadedDimensions(dims);
    const m = Number(payload?.margin_percent_ui ?? 0) || 0;
    const cond = String(payload?.condition_mode || "cond1");
    const condText = String(payload?.condition_text || "");
    const pay = String(payload?.payment_method || "");
    const portonType = String(payload?.porton_type || "");
    const mappedLines = lines
      .map((l, idx) => {
        const rawName = cleanText(l.raw_name || l.rawName || l.raw || l.original_name || "");
        const visibleName =
          cleanText(l.name || l.display_name || l.alias || rawName) || `Producto ${l.product_id || idx}`;
        const freeQuantity = isShippingProductId(l.product_id) || !!l.free_quantity || !!l.quantity_editable || String(l.quantity_mode || "").toLowerCase() === "free";
        return {
          product_id: Number(l.product_id ?? idx + 1),
          odoo_external_id: resolveOdooExternalId(l),
          odoo_id: toPositiveInt(l.odoo_id),
          odoo_template_id: toPositiveInt(l.odoo_template_id),
          odoo_variant_id: toPositiveInt(l.odoo_variant_id),
          name: visibleName,
          raw_name: rawName,
          code: l.code || null,
          qty: normalizeEditableQty({
            productId: l.product_id,
            qty: l.qty || 1,
            surfaceQuantity: !!l.surface_quantity,
            freeQuantity,
          }),
          basePrice: Number(l.basePrice ?? l.base_price ?? l.price ?? 0) || 0,
          auto_system_item: !!l.auto_system_item,
          surface_quantity: !!l.surface_quantity,
          free_quantity: freeQuantity,
          quantity_editable: freeQuantity,
          price_editable: isDistributorOwnSupplyProductId(l.product_id) || !!l.price_editable,
          manual_price: !!l.manual_price,
          previously_billed_line: !!l.previously_billed_line,
          locked_line: !!l.locked_line,
          line_key: String(l.line_key || l.product_id || idx),
        };
      })
      .filter((line) => !line.auto_system_item);

    set({
      quoteId: q.id ?? null,
      status: q.status || "draft",
      rejectionNotes: q.rejection_notes || null,
      pricelistId: q.pricelist_id ?? null,
      pricelistName: "",
      marginPercent: m,
      marginPercentInput: m === 0 ? "" : String(payload?.margin_percent_ui ?? m),
      fulfillmentMode: q.fulfillment_mode || "produccion",
      conditionMode: cond === "cond2" ? "cond2" : cond === "special" ? "special" : "cond1",
      conditionText: condText,
      paymentMethod: pay,
      portonType,
      note: q.note || "",
      endCustomer: {
        ...EMPTY_CUSTOMER,
        ...(end || {}),
        first_name: splitName.first_name,
        last_name: splitName.last_name,
        name: buildCustomerName({ ...(end || {}), ...splitName }),
      },
      dimensions: loadedDimensions,
      lines: applyDerivedLines(mappedLines, portonType, loadedDimensions),
    });
  },
  setDimensions(patch) {
    set((s) => {
      const nextDimensions = { ...s.dimensions, ...(patch || {}) };
      return {
        dimensions: nextDimensions,
        lines: applyDerivedLines(s.lines, s.portonType, nextDimensions),
      };
    });
  },
  setQuoteMeta({ quoteId, status, rejectionNotes }) {
    set({
      quoteId: quoteId ?? null,
      status: status ?? "draft",
      rejectionNotes: rejectionNotes ?? null,
    });
  },
  setPricelist(pl) {
    set({ pricelistId: pl?.id ?? null, pricelistName: pl?.name ?? "" });
  },
  setMarginPercentInput(v) {
    const raw = String(v ?? "");
    if (raw.trim() === "") {
      set({ marginPercentInput: "", marginPercent: 0 });
      return;
    }
    const parsed = parseMargin(raw);
    if (parsed === null) {
      set({ marginPercentInput: raw });
      return;
    }
    set({ marginPercentInput: raw, marginPercent: parsed });
  },
  commitMarginPercentInput() {
    const s = get();
    const parsed = parseMargin(s.marginPercentInput);
    if (parsed === null || parsed === 0) {
      set({ marginPercent: 0, marginPercentInput: "" });
      return;
    }
    set({ marginPercent: parsed, marginPercentInput: String(parsed) });
  },
  setMarginPercent(v) {
    const n = Number(v || 0);
    const safe = Number.isFinite(n) ? n : 0;
    set({
      marginPercent: safe,
      marginPercentInput: safe === 0 ? "" : String(safe),
    });
  },
  setPartnerId(v) {
    set({ partnerId: v ? Number(v) : null });
  },
  setFulfillmentMode(v) {
    const mode = String(v || "").trim();
    if (!["produccion", "acopio"].includes(mode)) return;
    set({ fulfillmentMode: mode });
  },
  setConditionMode(v) {
    const mode = String(v || "").trim();
    if (!["cond1", "cond2", "special"].includes(mode)) return;
    set((s) => ({ conditionMode: mode, conditionText: mode === "special" ? s.conditionText : "" }));
  },
  setConditionText(v) {
    set({ conditionText: String(v || "") });
  },
  setPaymentMethod(v) {
    set({ paymentMethod: String(v || "") });
  },
  setPortonType(v) {
    const nextPortonType = String(v || "");
    set((s) => {
      const nextLines = applyDerivedLines(s.lines, nextPortonType, s.dimensions);
      dflexQuoteDebug("setPortonType", { nextPortonType, before: dflexLineSnapshot(s.lines), after: dflexLineSnapshot(nextLines), includeStack: true });
      return {
        portonType: nextPortonType,
        lines: nextLines,
      };
    });
  },
  setNote(v) {
    set({ note: String(v || "") });
  },
  setEndCustomer(patch) {
    set((s) => {
      const nextCustomer = { ...s.endCustomer, ...(patch || {}) };
      return { endCustomer: { ...nextCustomer, name: buildCustomerName(nextCustomer) } };
    });
  },
  addLine(product) {
    const p = product || {};
    const id = Number(p.id);
    if (!id) return;
    set((s) => {
      const existing = s.lines.find((l) => l.product_id === id && !l.previously_billed_line);
      const isSurfaceQuantity = !!p.uses_surface_quantity;
      const isIntegerQty = isIntegerQtyProductId(id);
      const isFreeQuantity = isShippingProductId(id) || !!p.free_quantity || !!p.quantity_editable || String(p.quantity_mode || "").toLowerCase() === "free";
      const surfaceQty = getSurfaceQuantity(s.dimensions);

      if (existing) {
        if (existing.surface_quantity) {
          return { lines: s.lines.map((l) => l.product_id === id ? { ...l, qty: surfaceQty } : l) };
        }
        if (isFreeQuantityLine(existing)) {
          return { lines: s.lines.map((l) => l.product_id === id ? { ...l, qty: normalizeFreeQty(l.qty || 1), free_quantity: true, quantity_editable: true } : l) };
        }
        if (isIntegerQty) {
          return { lines: s.lines.map((l) => l.product_id === id ? { ...l, qty: normalizeIntegerQty(l.qty) } : l) };
        }
        return { lines: s.lines.map((l) => l.product_id === id ? { ...l, qty: 1 } : l) };
      }

      return {
        lines: [
          ...s.lines,
          {
            product_id: id,
            odoo_external_id: resolveOdooExternalId({ ...p, product_id: id }),
            odoo_id: toPositiveInt(p.odoo_id),
            odoo_template_id: toPositiveInt(p.odoo_template_id),
            odoo_variant_id: toPositiveInt(p.odoo_variant_id),
            name: getInternalVisibleName(p),
            raw_name: getClientFacingName(p),
            code: p.code || null,
            qty: isSurfaceQuantity ? surfaceQty : (isFreeQuantity ? 1 : (isIntegerQty ? 0 : 1)),
            basePrice:
              Number(
                p.price ??
                  p.basePrice ??
                  p.base_price ??
                  p.list_price ??
                  p.listPrice ??
                  p.price_predeterminado ??
                  p.price_list ??
                  0,
              ) || 0,
            surface_quantity: isSurfaceQuantity,
            free_quantity: isFreeQuantity,
            quantity_editable: isFreeQuantity,
            price_editable: isDistributorOwnSupplyProductId(id),
            line_key: `${id}-${Date.now()}`,
          },
        ],
      };
    });
  },
  removeLine(product_id) {
    const id = Number(product_id);
    const current = get().lines.find((line) => Number(line?.product_id) === id);
    if (isProtectedLine(current)) {
      dflexQuoteDebug("removeLine:blockedProtected", { product_id: id, current, before: dflexLineSnapshot(get().lines), includeStack: true });
      return;
    }
    set((s) => {
      const nextLines = s.lines.filter((l) => !(Number(l.product_id) === id && !l.previously_billed_line));
      dflexQuoteDebug("removeLine", { product_id: id, before: dflexLineSnapshot(s.lines), after: dflexLineSnapshot(nextLines), includeStack: true });
      return { lines: nextLines };
    });
  },
  forceRemoveLine(product_id) {
    const id = Number(product_id);
    set((s) => {
      const nextLines = s.lines.filter((l) => !(Number(l.product_id) === id && !l.previously_billed_line));
      dflexQuoteDebug("forceRemoveLine", { product_id: id, before: dflexLineSnapshot(s.lines), after: dflexLineSnapshot(nextLines), includeStack: true });
      return { lines: nextLines };
    });
  },
  setLineBasePrice(product_id, price) {
    const id = Number(product_id);
    if (!isDistributorOwnSupplyProductId(id)) return;
    const current = get().lines.find((line) => Number(line?.product_id) === id);
    if (!current || current.previously_billed_line) return;
    const n = Number(String(price ?? "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    const nextPrice = round2(n);
    set((s) => ({
      lines: s.lines.map((l) => Number(l.product_id) === id ? { ...l, basePrice: nextPrice, manual_price: true, price_editable: true } : l),
    }));
  },
  setQty(product_id, qty) {
    const id = Number(product_id);
    const current = get().lines.find((line) => Number(line?.product_id) === id);
    if (isProtectedLine(current)) {
      dflexQuoteDebug("setQty:blockedProtected", { product_id: id, qty, current, before: dflexLineSnapshot(get().lines), includeStack: true });
      return;
    }

    const q = normalizeEditableQty({
      productId: id,
      qty,
      surfaceQuantity: !!current?.surface_quantity,
      freeQuantity: isFreeQuantityLine(current),
    });

    set((s) => {
      // Importante: cambiar la cantidad de una línea editable no debe limpiar otras
      // líneas ni recalcular la selección del catálogo. Antes se filtraban todas las
      // líneas con qty <= 0; si alguna línea de una sección previa quedaba
      // momentáneamente en 0, se eliminaba y el flujo volvía a la sección inicial.
      // La eliminación de productos debe hacerse sólo con el botón de borrar o al
      // cambiar explícitamente una selección de sección.
      const nextLines = s.lines.map((l) => (Number(l.product_id) === id ? { ...l, qty: q } : l));
      dflexQuoteDebug("setQty", {
        product_id: id,
        raw_qty: qty,
        normalized_qty: q,
        before: dflexLineSnapshot(s.lines),
        after: dflexLineSnapshot(nextLines),
        removed: [],
        includeStack: true,
      });
      return { lines: nextLines };
    });
  },
  applyBasePrices(pricesResponse) {
    const arr = Array.isArray(pricesResponse?.prices) ? pricesResponse.prices : [];
    const map = new Map(
      arr.map((x) => [
        Number(x.product_id),
        {
          price: Number(x.price ?? 0),
          name: String(x.name || "").trim(),
          code: x.code || null,
        },
      ]),
    );

    set((s) => {
      const nextLines = s.lines.map((l) => {
        const next = map.get(l.product_id);
        if (!next || l.previously_billed_line || l.manual_price) return l;

        return {
          ...l,
          basePrice: typeof next.price === "number" ? next.price : l.basePrice,
          code: next.code ?? l.code,
          raw_name: l.raw_name,
          name: l.name || next.name || l.raw_name,
        };
      });
      dflexQuoteDebug("applyBasePrices", { received: arr, before: dflexLineSnapshot(s.lines), after: dflexLineSnapshot(nextLines), includeStack: true });
      return { lines: nextLines };
    });
  },
  buildPayloadForBack() {
    const s = get();
    const area_m2 = getSurfaceQuantity(s.dimensions);
    const customerName = buildCustomerName(s.endCustomer);
    const safeDimensions = s.dimensions && typeof s.dimensions === "object" ? s.dimensions : {};
    const lines = s.lines
      .filter((l) => !l.ui_only_line && !l.auto_system_item)
      .map((l) => {
        const freeQuantity = isFreeQuantityLine(l);
        return {
          product_id: l.product_id,
          odoo_external_id: resolveOdooExternalId(l),
          odoo_id: toPositiveInt(l.odoo_id),
          odoo_template_id: toPositiveInt(l.odoo_template_id),
          odoo_variant_id: toPositiveInt(l.odoo_variant_id),
          qty: normalizeEditableQty({
            productId: l.product_id,
            qty: l.qty,
            surfaceQuantity: !!l.surface_quantity,
            freeQuantity,
          }),
          name: l.name,
          raw_name: l.raw_name || null,
          code: l.code,
          basePrice: l.basePrice,
          auto_system_item: !!l.auto_system_item,
          surface_quantity: !!l.surface_quantity,
          free_quantity: freeQuantity,
          quantity_editable: freeQuantity,
          price_editable: isDistributorOwnSupplyProductId(l.product_id) || !!l.price_editable,
          manual_price: !!l.manual_price,
          previously_billed_line: !!l.previously_billed_line,
          locked_line: !!l.locked_line,
          line_key: l.line_key || null,
        };
      });
    return {
      fulfillment_mode: s.fulfillmentMode,
      pricelist_id: s.pricelistId,
      end_customer: {
        ...s.endCustomer,
        name: customerName,
        first_name: String(s.endCustomer?.first_name || "").trim(),
        last_name: String(s.endCustomer?.last_name || "").trim(),
      },
      lines,
      payload: {
        margin_percent_ui: s.marginPercent,
        condition_mode: s.conditionMode,
        condition_text: s.conditionText || "",
        payment_method: s.paymentMethod || "",
        porton_type: s.portonType || "",
        dimensions: {
          ...safeDimensions,
          width: safeDimensions?.width ?? "",
          height: safeDimensions?.height ?? "",
          kg_m2: safeDimensions?.kg_m2 ?? "",
          area_m2,
        },
      },
      note: s.note || null,
    };
  },
}));
