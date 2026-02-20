import { create } from "zustand";

const EMPTY_CUSTOMER = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

export const useQuoteStore = create((set, get) => ({
  // meta
  quoteId: null,
  status: "draft",
  rejectionNotes: null,

  // config
  pricelistId: null,
  pricelistName: "",
  marginPercent: 0,
  partnerId: null,

  fulfillmentMode: "produccion", // "produccion" | "acopio"
  note: "",

  endCustomer: { ...EMPTY_CUSTOMER },

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
      partnerId: null,
      fulfillmentMode: "produccion",
      note: "",
      endCustomer: { ...EMPTY_CUSTOMER },
      lines: [],
    });
  },

  loadFromQuote(quote) {
    const q = quote || {};
    const end = q.end_customer || {};
    const lines = Array.isArray(q.lines) ? q.lines : [];

    set({
      quoteId: q.id ?? null,
      status: q.status || "draft",
      rejectionNotes: q.rejection_notes || null,

      pricelistId: q.pricelist_id ?? null,
      pricelistName: "",

      fulfillmentMode: q.fulfillment_mode || "produccion",
      note: q.note || "",

      endCustomer: {
        ...EMPTY_CUSTOMER,
        ...(end || {}),
      },

      lines: lines.map((l) => ({
        product_id: Number(l.product_id),
        name: l.name || "",
        raw_name: l.raw_name || l.rawName || "",
        code: l.code || null,
        qty: Number(l.qty || 1),
        basePrice: Number(l.basePrice ?? l.base_price ?? l.price ?? 0) || 0,
      })),
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
    set({
      pricelistId: pl?.id ?? null,
      pricelistName: pl?.name ?? "",
    });
  },

  setMarginPercent(v) {
    set({ marginPercent: Number(v || 0) });
  },

  setPartnerId(v) {
    set({ partnerId: v ? Number(v) : null });
  },

  setFulfillmentMode(v) {
    const mode = String(v || "").trim();
    if (!["produccion", "acopio"].includes(mode)) return;
    set({ fulfillmentMode: mode });
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
          lines: s.lines.map((l) => (l.product_id === id ? { ...l, qty: Number(l.qty || 0) + 1 } : l)),
        };
      }

      return {
        lines: [
          ...s.lines,
          {
            product_id: id,
            // name = alias visible en el cotizador
            name: p.name || "",
            // raw_name = nombre real de Odoo (para PDF)
            raw_name: p.raw_name || p.rawName || p.original_name || "",
            code: p.code || null,
            qty: 1,
            // ✅ Para evitar el "0" al agregar:
            // - bootstrap trae list_price
            // - algunos endpoints traen price / basePrice
            // (luego /api/odoo/prices puede recalcular si aplica)
            basePrice:
              Number(
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
      lines: s.lines.map((l) => (l.product_id === id ? { ...l, qty: q } : l)).filter((l) => l.qty > 0),
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

    // guardamos “líneas enriquecidas” para que los reviewers vean nombres/precios sin ir a Odoo
    const lines = s.lines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty,
      name: l.name,
      raw_name: l.raw_name || "",
      code: l.code,
      basePrice: l.basePrice,
    }));

    return {
      // útil para PDFs (si existe)
      quote_id: s.quoteId || null,

      fulfillment_mode: s.fulfillmentMode,
      pricelist_id: s.pricelistId,
      end_customer: s.endCustomer,
      lines,
      payload: {
        // dejamos lugar para futuro (alto/ancho/notas/lo que venga)
        margin_percent_ui: s.marginPercent,
      },
      note: s.note || null,
    };
  },
}));
