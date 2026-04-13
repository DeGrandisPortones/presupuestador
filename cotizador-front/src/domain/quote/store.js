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
function isProtectedLine(line) {
  return !!line?.surface_quantity || !!line?.previously_billed_line;
}
function getSurfaceQuantity(dimensions) {
  return round2(
    parseDimensionNumber(dimensions?.width) * parseDimensionNumber(dimensions?.height),
  );
}
function stripLegacyAutoSystemLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !line?.auto_system_item);
}
function syncSurfaceLines(lines, dimensions) {
  const currentLines = stripLegacyAutoSystemLines(lines);
  const area = getSurfaceQuantity(dimensions);
  return currentLines.map((line) =>
    !line?.surface_quantity ? line : { ...line, qty: area },
  );
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
    const m = Number(payload?.margin_percent_ui ?? 0) || 0;
    const cond = String(payload?.condition_mode || "cond1");
    const condText = String(payload?.condition_text || "");
    const pay = String(payload?.payment_method || "");
    const portonType = String(payload?.porton_type || "");
    const mappedLines = lines.map((l, idx) => {
      const rawName = l.raw_name || l.rawName || l.raw || l.name || "";
      const visibleName =
        l.name || l.display_name || l.alias || rawName || `Producto ${l.product_id || idx}`;
      return {
        product_id: Number(l.product_id ?? idx + 1),
        name: visibleName,
        raw_name: rawName,
        code: l.code || null,
        qty: Number(l.qty || 1),
        basePrice: Number(l.basePrice ?? l.base_price ?? l.price ?? 0) || 0,
        auto_system_item: !!l.auto_system_item,
        surface_quantity: !!l.surface_quantity,
        previously_billed_line: !!l.previously_billed_line,
        locked_line: !!l.locked_line,
        line_key: String(l.line_key || l.product_id || idx),
      };
    });
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
      dimensions: {
        width: dims?.width ?? "",
        height: dims?.height ?? "",
        kg_m2: dims?.kg_m2 ?? "",
      },
      lines: applyDerivedLines(mappedLines, portonType, {
        width: dims?.width ?? "",
        height: dims?.height ?? "",
        kg_m2: dims?.kg_m2 ?? "",
      }),
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
    set((s) => ({
      portonType: nextPortonType,
      lines: applyDerivedLines(s.lines, nextPortonType, s.dimensions),
    }));
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
      const surfaceQty = getSurfaceQuantity(s.dimensions);
      if (existing) {
        if (existing.surface_quantity) {
          return {
            lines: s.lines.map((l) =>
              l.product_id === id ? { ...l, qty: surfaceQty } : l,
            ),
          };
        }
        return {
          lines: s.lines.map((l) =>
            l.product_id === id ? { ...l, qty: Number(l.qty || 0) + 1 } : l,
          ),
        };
      }
      return {
        lines: [
          ...s.lines,
          {
            product_id: id,
            name: p.display_name || p.alias || p.name || "",
            raw_name: p.raw_name || p.rawName || p.original_name || p.name || "",
            code: p.code || null,
            qty: isSurfaceQuantity ? surfaceQty : 1,
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
            line_key: `${id}-${Date.now()}`,
          },
        ],
      };
    });
  },
  removeLine(product_id) {
    const id = Number(product_id);
    const current = get().lines.find((line) => Number(line?.product_id) === id);
    if (isProtectedLine(current)) return;
    set((s) => ({
      lines: s.lines.filter((l) => !(Number(l.product_id) === id && !l.previously_billed_line)),
    }));
  },
  forceRemoveLine(product_id) {
    const id = Number(product_id);
    set((s) => ({
      lines: s.lines.filter((l) => !(Number(l.product_id) === id && !l.previously_billed_line)),
    }));
  },
  setQty(product_id, qty) {
    const id = Number(product_id);
    const current = get().lines.find((line) => Number(line?.product_id) === id);
    if (isProtectedLine(current)) return;
    const q = Math.max(0, Number(qty || 0));
    set((s) => ({
      lines: s.lines
        .map((l) => (l.product_id === id ? { ...l, qty: q } : l))
        .filter((l) => l.qty > 0 || l.previously_billed_line),
    }));
  },
  applyBasePrices(pricesResponse) {
    const arr = pricesResponse?.prices || [];
    const map = new Map(arr.map((x) => [Number(x.product_id), Number(x.price ?? 0)]));
    set((s) => ({
      lines: s.lines.map((l) => {
        const next = map.get(l.product_id);
        return typeof next === "number" && !l.previously_billed_line
          ? { ...l, basePrice: next }
          : l;
      }),
    }));
  },
  buildPayloadForBack() {
    const s = get();
    const area_m2 = getSurfaceQuantity(s.dimensions);
    const customerName = buildCustomerName(s.endCustomer);
    const lines = s.lines
      .filter((l) => !l.ui_only_line && !l.auto_system_item)
      .map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        name: l.name,
        raw_name: l.raw_name || null,
        code: l.code,
        basePrice: l.basePrice,
        auto_system_item: !!l.auto_system_item,
        surface_quantity: !!l.surface_quantity,
        previously_billed_line: !!l.previously_billed_line,
        locked_line: !!l.locked_line,
        line_key: l.line_key || null,
      }));
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
          width: s.dimensions?.width ?? "",
          height: s.dimensions?.height ?? "",
          kg_m2: s.dimensions?.kg_m2 ?? "",
          area_m2,
        },
      },
      note: s.note || null,
    };
  },
}));
