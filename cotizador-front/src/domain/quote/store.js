import { create } from "zustand";

const EMPTY_CUSTOMER = {
  name: "",
  phone: "",
  email: "",
  address: "",
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

export const useQuoteStore = create((set, get) => ({
  // meta
  quoteId: null,
  status: "draft",
  rejectionNotes: null,

  // config
  pricelistId: null,
  pricelistName: "",
  marginPercent: 0,          // número (para cálculos)
  marginPercentInput: "",    // string (para permitir escribir '-' etc)
  partnerId: null,

  fulfillmentMode: "produccion", // "produccion" | "acopio"
  conditionMode: "cond1",        // "cond1" | "cond2"
  note: "",

  endCustomer: { ...EMPTY_CUSTOMER },

  // configuración del portón (por ahora sólo medidas)
  dimensions: {
    width: "", // metros
    height: "", // metros
  },

  // { product_id, name, raw_name, code, qty, basePrice }
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
      note: "",
      endCustomer: { ...EMPTY_CUSTOMER },
      dimensions: { width: "", height: "" },
      lines: [],
    });
  },

  loadFromQuote(quote) {
    const q = quote || {};
    const end = q.end_customer || {};
    const lines = Array.isArray(q.lines) ? q.lines : [];
    const payload = q.payload || {};
    const dims = payload?.dimensions || {};

    const m = Number(payload?.margin_percent_ui ?? 0) || 0;
    const cond = String(payload?.condition_mode || "cond1");

    set({
      quoteId: q.id ?? null,
      status: q.status || "draft",
      rejectionNotes: q.rejection_notes || null,

      pricelistId: q.pricelist_id ?? null,
      pricelistName: "",

      marginPercent: m,
      // Si es 0 (o viene vacío), mostramos vacío para que el usuario no tenga que borrar "0"
      marginPercentInput: m === 0 ? "" : String(payload?.margin_percent_ui ?? m),

      fulfillmentMode: q.fulfillment_mode || "produccion",
      conditionMode: cond === "cond2" ? "cond2" : "cond1",
      note: q.note || "",

      endCustomer: {
        ...EMPTY_CUSTOMER,
        ...(end || {}),
      },

      dimensions: {
        width: dims?.width ?? "",
        height: dims?.height ?? "",
      },

      lines: lines.map((l) => ({
        product_id: Number(l.product_id),
        name: l.name || "",
        raw_name: l.raw_name || l.rawName || l.raw || "",
        code: l.code || null,
        qty: Number(l.qty || 1),
        basePrice: Number(l.basePrice ?? l.base_price ?? l.price ?? 0) || 0,
      })),
    });
  },

  setDimensions(patch) {
    set((s) => ({ dimensions: { ...s.dimensions, ...(patch || {}) } }));
  },

  setQuoteMeta({ quoteId, status, rejectionNotes }) {
    set({
      quoteId: quoteId ?? null,
      status: status ?? "draft",
      rejectionNotes: rejectionNotes ?? null,
    });
  },

  setPricelist(pl) {
    set({
      pricelistId: pl?.id ?? null,
      pricelistName: pl?.name ?? "",
    });
  },

  // Permite negativos y estados intermedios ('-')
  setMarginPercentInput(v) {
    const raw = String(v ?? "");
    // Si el usuario lo vacía, interpretamos 0 pero dejamos el input vacío
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

  // Para usar en onBlur: si quedó inválido, lo normaliza a 0
  commitMarginPercentInput() {
    const s = get();
    const parsed = parseMargin(s.marginPercentInput);
    if (parsed === null) {
      set({ marginPercent: 0, marginPercentInput: "" });
      return;
    }
    // 0 => vacío (mejor UX). Si no, normalizamos formato: punto y sin espacios.
    if (parsed === 0) {
      set({ marginPercent: 0, marginPercentInput: "" });
      return;
    }
    set({ marginPercent: parsed, marginPercentInput: String(parsed) });
  },

  // setter numérico (por compat)
  setMarginPercent(v) {
    const n = Number(v || 0);
    const safe = Number.isFinite(n) ? n : 0;
    set({ marginPercent: safe, marginPercentInput: safe === 0 ? "" : String(safe) });
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
    if (!["cond1", "cond2"].includes(mode)) return;
    set({ conditionMode: mode });
  },

  setNote(v) {
    set({ note: String(v || "") });
  },

  setEndCustomer(patch) {
    set((s) => ({ endCustomer: { ...s.endCustomer, ...(patch || {}) } }));
  },

  addLine(product) {
    const p = product || {};
    const id = Number(p.id);
    if (!id) return;

    set((s) => {
      const existing = s.lines.find((l) => l.product_id === id);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.product_id === id ? { ...l, qty: Number(l.qty || 0) + 1 } : l
          ),
        };
      }

      return {
        lines: [
          ...s.lines,
          {
            product_id: id,
            name: p.name || "",
            raw_name: p.raw_name || p.rawName || p.original_name || p.name || "",
            code: p.code || null,
            qty: 1,
            basePrice: Number(
              p.price ??
              p.basePrice ??
              p.base_price ??
              p.list_price ??
              p.listPrice ??
              p.price_predeterminado ??
              p.price_list ??
              0
            ) || 0,
          },
        ],
      };
    });
  },

  removeLine(product_id) {
    const id = Number(product_id);
    set((s) => ({ lines: s.lines.filter((l) => l.product_id !== id) }));
  },

  setQty(product_id, qty) {
    const id = Number(product_id);
    const q = Math.max(0, Number(qty || 0));
    set((s) => ({
      lines: s.lines
        .map((l) => (l.product_id === id ? { ...l, qty: q } : l))
        .filter((l) => l.qty > 0),
    }));
  },

  applyBasePrices(pricesResponse) {
    const arr = pricesResponse?.prices || [];
    const map = new Map(arr.map((x) => [Number(x.product_id), Number(x.price ?? 0)]));

    set((s) => ({
      lines: s.lines.map((l) => {
        const next = map.get(l.product_id);
        if (typeof next === "number") return { ...l, basePrice: next };
        return l;
      }),
    }));
  },

  buildPayloadForBack() {
    const s = get();

    const width = Number(String(s.dimensions?.width || "").replace(",", ".")) || 0;
    const height = Number(String(s.dimensions?.height || "").replace(",", ".")) || 0;
    const area_m2 = Number.isFinite(width * height) ? width * height : 0;

    const lines = s.lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      name: l.name,
      raw_name: l.raw_name || null,
      code: l.code,
      basePrice: l.basePrice,
    }));

    return {
      fulfillment_mode: s.fulfillmentMode,
      pricelist_id: s.pricelistId,
      end_customer: s.endCustomer,
      lines,
      payload: {
        margin_percent_ui: s.marginPercent,
        condition_mode: s.conditionMode,
        dimensions: {
          width: s.dimensions?.width ?? "",
          height: s.dimensions?.height ?? "",
          area_m2,
        },
      },
      note: s.note || null,
    };
  },
}));
