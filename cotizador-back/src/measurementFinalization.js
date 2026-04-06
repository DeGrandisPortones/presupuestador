import { dbQuery } from "./db.js";
import {
  getCommercialFinalTolerancePercent,
  getMeasurementProductMappings,
  getTechnicalMeasurementRules,
  getTechnicalMeasurementFieldDefinitions,
} from "./settingsDb.js";

const PLACEHOLDER_PRODUCT_ID = Number(
  process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880,
);
const MEASUREMENT_PRODUCT_ID = Number(
  process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865,
);
const IVA_RATE = 0.21;

function toScalar(v) {
  return Array.isArray(v) ? v[0] : v;
}
function toIntId(v) {
  const x = toScalar(v);
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toText(v) {
  const x = toScalar(v);
  return x === null || x === undefined ? "" : String(x).trim();
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
function normalizeBoolish(v) {
  const s = String(v ?? "").toLowerCase().trim();
  if (["true", "1", "si", "sí", "yes"].includes(s)) return "si";
  if (["false", "0", "no"].includes(s)) return "no";
  return s;
}
function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}
function normalizeValue(v) {
  if (typeof v === "boolean") return v ? "si" : "no";
  if (v === null || v === undefined) return "";
  return normalizeBoolish(String(v).trim().toLowerCase());
}
function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
function referenceNumberFromQuote(originalQuote, revisionQuote) {
  const direct =
    toText(originalQuote?.odoo_sale_order_name) ||
    toText(originalQuote?.final_sale_order_name) ||
    toText(originalQuote?.quote_number) ||
    toText(revisionQuote?.final_sale_order_name) ||
    toText(revisionQuote?.quote_number);
  const digits = onlyDigits(direct);
  if (digits) return digits;
  return direct || "";
}
function calcDetailedUnitWithIva(line, payload) {
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + IVA_RATE));
}
function compareValues(currentRaw, operator, compareRaw) {
  const currentText = normalizeValue(currentRaw);
  const expectedText = normalizeValue(compareRaw);
  const currentNum = Number(String(currentRaw ?? "").replace(",", "."));
  const expectedNum = Number(String(compareRaw ?? "").replace(",", "."));
  switch (String(operator || "=").trim()) {
    case "=":
      return currentText === expectedText;
    case "!=":
      return currentText !== expectedText;
    case ">":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum > expectedNum;
    case ">=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum >= expectedNum;
    case "<":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum < expectedNum;
    case "<=":
      return Number.isFinite(currentNum) && Number.isFinite(expectedNum) && currentNum <= expectedNum;
    case "contains":
      return currentText.includes(expectedText);
    default:
      return currentText === expectedText;
  }
}
function buildRuleContext(originalQuote, form) {
  const dims = originalQuote?.payload?.dimensions || {};
  const widthM = Number(String(dims?.width ?? "").replace(",", "."));
  const heightM = Number(String(dims?.height ?? "").replace(",", "."));
  const end = originalQuote?.end_customer || {};
  return {
    ...form,
    surface_m2:
      Number.isFinite(widthM) && Number.isFinite(heightM)
        ? round2(widthM * heightM)
        : 0,
    budget_width_m: Number.isFinite(widthM) ? widthM : 0,
    budget_height_m: Number.isFinite(heightM) ? heightM : 0,
    customer_city: toText(end.city),
    customer_name: toText(end.name),
    porton_type: toText(originalQuote?.payload?.porton_type),
    payment_method: toText(originalQuote?.payload?.payment_method),
  };
}
function buildMeasurementLineSeedsFromLegacyMappings(form, rules) {
  const out = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.field_key) continue;
    const values = Array.isArray(rule.values) ? rule.values : [];
    const current = getByPath(form, rule.field_key);
    const currentNorm = normalizeValue(current);
    for (const entry of values) {
      if (!entry?.product_id) continue;
      const expectedNorm = normalizeValue(entry.expected_value || "");
      const matches = expectedNorm ? currentNorm === expectedNorm : !!currentNorm;
      if (!matches) continue;
      out.push({
        product_id: Number(entry.product_id),
        qty: 1,
        name: String(entry.product_label || entry.label || rule.field_label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        raw_name: String(entry.product_label || entry.label || rule.field_label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        code: null,
        basePrice: 0,
      });
    }
  }
  return out;
}
function buildMeasurementLineSeedsFromTechnicalRules(originalQuote, form, rules) {
  const context = buildRuleContext(originalQuote, form);
  const out = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule?.active || !rule?.apply_to_odoo || !rule?.product_id) continue;
    const current = getByPath(context, rule.source_key);
    if (!compareValues(current, rule.operator, rule.compare_value)) continue;
    out.push({
      product_id: Number(rule.product_id),
      qty: 1,
      name: String(rule.product_label || rule.name || `Producto ${rule.product_id}`).trim(),
      raw_name: String(rule.product_label || rule.name || `Producto ${rule.product_id}`).trim(),
      code: null,
      basePrice: 0,
    });
  }
  return out;
}
function hasMeaningfulFieldValue(value) {
  const normalized = normalizeValue(value);
  return !!normalized && normalized !== "no" && normalized !== "false" && normalized !== "0";
}
function normalizeStoredBindingProducts(value) {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          product_id: Number(item?.product_id || 0) || null,
          display_name: String(item?.display_name || "").trim(),
          alias: String(item?.alias || "").trim(),
          raw_name: String(item?.raw_name || "").trim(),
          code: String(item?.code || "").trim(),
          qty: Number(item?.qty || 1) || 1,
        }))
        .filter((item) => item.product_id)
    : [];
}
function normalizeStoredSelectedBindingProduct(value) {
  if (!value || typeof value !== "object") return null;
  const product_id = Number(value?.product_id || 0) || null;
  if (!product_id) return null;
  return {
    product_id,
    display_name: String(value?.display_name || "").trim(),
    alias: String(value?.alias || "").trim(),
    raw_name: String(value?.raw_name || "").trim(),
    code: String(value?.code || "").trim(),
    qty: Number(value?.qty || 1) || 1,
  };
}
function buildMeasurementLineSeedsFromFieldBindings(form, fields) {
  const out = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    if (field?.active === false) continue;
    let bindingType = String(field?.odoo_binding_type || "none");
    if (String(field?.type || "") === "odoo_product" && bindingType === "none") {
      bindingType = "selected_measurement_product";
    }
    const current = getByPath(form, field.key);
    if (!hasMeaningfulFieldValue(current)) continue;

    if (bindingType === "custom_product") {
      const productId = Number(field?.odoo_product_id || 0);
      if (!productId) continue;
      out.push({
        product_id: productId,
        qty: 1,
        name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
        raw_name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
        code: null,
        basePrice: 0,
      });
      continue;
    }

    if (bindingType === "repeat_budget_product") {
      const boundProducts = normalizeStoredBindingProducts(
        getByPath(form, `__budget_binding_products.${field.key}`),
      );
      for (const product of boundProducts) {
        out.push({
          product_id: Number(product.product_id),
          qty: Number(product.qty || 1) || 1,
          name: String(product.display_name || product.alias || product.raw_name || `Producto ${product.product_id}`).trim(),
          raw_name: String(product.raw_name || product.display_name || `Producto ${product.product_id}`).trim(),
          code: product.code || null,
          basePrice: 0,
        });
      }
      continue;
    }

    if (bindingType === "selected_measurement_product") {
      const selectedProduct = normalizeStoredSelectedBindingProduct(
        getByPath(form, `__selected_binding_product.${field.key}`),
      );
      if (!selectedProduct?.product_id) continue;
      out.push({
        product_id: Number(selectedProduct.product_id),
        qty: Number(selectedProduct.qty || 1) || 1,
        name: String(selectedProduct.display_name || selectedProduct.alias || selectedProduct.raw_name || `Producto ${selectedProduct.product_id}`).trim(),
        raw_name: String(selectedProduct.raw_name || selectedProduct.display_name || `Producto ${selectedProduct.product_id}`).trim(),
        code: selectedProduct.code || null,
        basePrice: 0,
      });
    }
  }
  return out;
}
function dedupeLines(lines) {
  const map = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const id = Number(line?.product_id || 0);
    if (!id) continue;
    if (!map.has(id)) map.set(id, { ...line, qty: Number(line?.qty || 1) || 1 });
    else {
      const prev = map.get(id);
      map.set(id, {
        ...prev,
        qty: (Number(prev.qty || 1) || 1) + (Number(line?.qty || 1) || 1),
      });
    }
  }
  return [...map.values()];
}
async function hydrateMeasurementLinePrices(odoo, payload, seeds) {
  const list = Array.isArray(seeds) ? seeds : [];
  if (!list.length || !odoo) return list;
  const ids = [...new Set(list.map((l) => Number(l.product_id)).filter(Boolean))];
  if (!ids.length) return list;
  let products = [];
  try {
    products = await odoo.executeKw("product.product", "read", [ids], {
      fields: ["id", "name", "default_code", "uom_id", "lst_price", "list_price", "product_tmpl_id"],
    });
  } catch {}
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  return list.map((seed) => {
    const p = byId.get(Number(seed.product_id));
    return {
      ...seed,
      name: toText(seed?.name) || toText(p?.name) || `Producto ${seed.product_id}`,
      raw_name: toText(seed?.raw_name) || toText(p?.name) || `Producto ${seed.product_id}`,
      code: toText(p?.default_code) || seed?.code || null,
      basePrice: Number(p?.lst_price ?? p?.list_price ?? seed?.basePrice ?? 0) || 0,
    };
  });
}
function cloneBudgetLine(line = {}) {
  const productId = Number(line?.product_id || 0) || null;
  if (!productId) return null;
  return {
    product_id: productId,
    qty: Number(line?.qty || 1) || 1,
    name: String(line?.name || line?.raw_name || `Producto ${productId}`).trim(),
    raw_name: String(line?.raw_name || line?.name || `Producto ${productId}`).trim(),
    code: String(line?.code || "").trim() || null,
    basePrice: Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0,
    ...(typeof line?.price_unit === "number" ? { price_unit: Number(line.price_unit) } : {}),
    ...(typeof line?.unit_price === "number" ? { unit_price: Number(line.unit_price) } : {}),
  };
}
function buildBasePositiveLinesFromQuote(sourceQuote) {
  const rawLines = Array.isArray(sourceQuote?.lines) ? sourceQuote.lines : [];
  return rawLines
    .map(cloneBudgetLine)
    .filter(Boolean)
    .filter((line) => {
      const productId = Number(line?.product_id || 0);
      if (!productId) return false;
      if (productId === MEASUREMENT_PRODUCT_ID) return false;
      if (productId === PLACEHOLDER_PRODUCT_ID) return false;
      return true;
    });
}
function mergeByProductId(lines) {
  const map = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const productId = Number(line?.product_id || 0);
    if (!productId) continue;
    if (!map.has(productId)) {
      map.set(productId, { ...line, qty: Number(line?.qty || 1) || 1 });
      continue;
    }
    const prev = map.get(productId);
    map.set(productId, {
      ...prev,
      qty: (Number(prev.qty || 1) || 1) + (Number(line?.qty || 1) || 1),
      name: prev.name || line.name,
      raw_name: prev.raw_name || line.raw_name,
      code: prev.code || line.code || null,
      basePrice: Number(prev.basePrice || 0) || Number(line.basePrice || 0) || 0,
      ...(typeof prev.price_unit === "number" ? { price_unit: prev.price_unit } : (typeof line.price_unit === "number" ? { price_unit: line.price_unit } : {})),
    });
  }
  return [...map.values()];
}
async function resolveBaseSourceQuote(originalQuote) {
  if (!originalQuote?.id) return originalQuote;
  if (String(originalQuote?.quote_kind || "original") === "copy") return originalQuote;
  const finalCopyId = String(originalQuote?.final_copy_id || "").trim();
  if (!finalCopyId) return originalQuote;
  try {
    const r = await dbQuery(
      `select * from public.presupuestador_quotes where id=$1 limit 1`,
      [finalCopyId],
    );
    const copy = r.rows?.[0] || null;
    return copy || originalQuote;
  } catch {
    return originalQuote;
  }
}
function replaceBoundProductsInBaseLines({ baseLines, field, measurementForm }) {
  const bindingType = String(field?.odoo_binding_type || (String(field?.type || "") === "odoo_product" ? "selected_measurement_product" : "none")).trim().toLowerCase();
  if (bindingType !== "selected_measurement_product") return baseLines;
  const selectedProduct = normalizeStoredSelectedBindingProduct(
    getByPath(measurementForm, `__selected_binding_product.${field.key}`),
  );
  if (!selectedProduct?.product_id) return baseLines;
  const boundProducts = normalizeStoredBindingProducts(
    getByPath(measurementForm, `__budget_binding_products.${field.key}`),
  );
  const removeIds = new Set(boundProducts.map((item) => Number(item.product_id)).filter(Boolean));
  const nextBase = Array.isArray(baseLines) ? baseLines.filter((line) => !removeIds.has(Number(line?.product_id || 0))) : [];
  nextBase.push({
    product_id: Number(selectedProduct.product_id),
    qty: Number(selectedProduct.qty || 1) || 1,
    name: String(selectedProduct.display_name || selectedProduct.alias || selectedProduct.raw_name || `Producto ${selectedProduct.product_id}`).trim(),
    raw_name: String(selectedProduct.raw_name || selectedProduct.display_name || `Producto ${selectedProduct.product_id}`).trim(),
    code: selectedProduct.code || null,
    basePrice: 0,
  });
  return nextBase;
}
function buildAdditionalLineSeedsFromFieldBindings(form, fields) {
  const out = [];
  for (const field of Array.isArray(fields) ? fields : []) {
    if (field?.active === false) continue;
    let bindingType = String(field?.odoo_binding_type || "none").trim().toLowerCase();
    if (String(field?.type || "") === "odoo_product" && bindingType === "none") {
      bindingType = "selected_measurement_product";
    }
    if (!["custom_product"].includes(bindingType)) continue;
    const current = getByPath(form, field.key);
    if (!hasMeaningfulFieldValue(current)) continue;
    const productId = Number(field?.odoo_product_id || 0) || null;
    if (!productId) continue;
    out.push({
      product_id: productId,
      qty: 1,
      name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
      raw_name: String(field?.odoo_product_label || field?.label || `Producto ${productId}`).trim(),
      code: null,
      basePrice: 0,
    });
  }
  return out;
}
function buildDiscountPreviewLine({ originalQuote, pricingPayload, pricedLines, tolerancePercent }) {
  const originalBudgeted = round2(Number(originalQuote?.deposit_amount || 0) || 0);
  if (originalBudgeted <= 0) return null;
  const positiveTotal = round2(
    pricedLines.reduce((acc, line) => {
      const price = calcDetailedUnitWithIva(line, pricingPayload || {});
      const qty = Number(line?.qty || 1) || 1;
      if (price <= 0) return acc;
      return acc + qty * price;
    }, 0),
  );
  if (positiveTotal <= 0) return null;
  const toleranceAmount = round2((originalBudgeted * Number(tolerancePercent || 0)) / 100);
  const rawDifference = round2(Math.max(0, positiveTotal - originalBudgeted));
  let discountAmount = originalBudgeted;
  if (rawDifference <= toleranceAmount) discountAmount = positiveTotal;
  if (discountAmount <= 0) return null;
  const reference = referenceNumberFromQuote(originalQuote, null) || toText(originalQuote?.quote_number) || "ANTICIPO";
  return {
    product_id: PLACEHOLDER_PRODUCT_ID,
    qty: 1,
    name: `Descuento anticipo presupuesto ${reference}`,
    raw_name: `Descuento anticipo presupuesto ${reference}`,
    code: null,
    price_unit: round2(-discountAmount),
    basePrice: 0,
  };
}
async function getOrCreateRevisionQuote({ originalQuote, sourceQuote, finalLines }) {
  const explicitCopyId = String(originalQuote?.final_copy_id || "").trim();
  if (explicitCopyId) {
    const upd = await dbQuery(
      `update public.presupuestador_quotes
          set lines=$2::jsonb,
              end_customer=$3::jsonb,
              payload=$4::jsonb,
              note=$5,
              final_status='draft'
        where id=$1
        returning *`,
      [
        explicitCopyId,
        JSON.stringify(finalLines),
        JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
        JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
        sourceQuote?.note || originalQuote?.note || null,
      ],
    );
    if (upd.rows?.[0]) return upd.rows[0];
  }

  const existing = await dbQuery(
    `select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`,
    [originalQuote.id],
  );
  const copy = existing.rows?.[0];
  if (copy) {
    const upd = await dbQuery(
      `update public.presupuestador_quotes
          set lines=$2::jsonb,
              end_customer=$3::jsonb,
              payload=$4::jsonb,
              note=$5,
              final_status='draft'
        where id=$1
        returning *`,
      [
        copy.id,
        JSON.stringify(finalLines),
        JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
        JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
        sourceQuote?.note || originalQuote?.note || null,
      ],
    );
    return upd.rows?.[0] || copy;
  }

  const ins = await dbQuery(
    `insert into public.presupuestador_quotes (
        quote_kind,
        parent_quote_id,
        created_by_user_id,
        created_by_role,
        fulfillment_mode,
        pricelist_id,
        bill_to_odoo_partner_id,
        end_customer,
        lines,
        payload,
        note,
        catalog_kind,
        status,
        commercial_decision,
        technical_decision,
        final_status
      ) values (
        'copy', $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, 'draft', 'pending', 'pending', 'draft'
      ) returning *`,
    [
      originalQuote.id,
      originalQuote.created_by_user_id,
      originalQuote.created_by_role,
      originalQuote.fulfillment_mode,
      toIntId(sourceQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id),
      toIntId(sourceQuote?.bill_to_odoo_partner_id) || toIntId(originalQuote?.bill_to_odoo_partner_id),
      JSON.stringify(sourceQuote?.end_customer || originalQuote?.end_customer || {}),
      JSON.stringify(finalLines),
      JSON.stringify(sourceQuote?.payload || originalQuote?.payload || {}),
      sourceQuote?.note || originalQuote?.note || null,
      sourceQuote?.catalog_kind || originalQuote?.catalog_kind || "porton",
    ],
  );
  return ins.rows?.[0] || null;
}
async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, sourceQuote }) {
  const partnerId =
    toIntId(revisionQuote?.bill_to_odoo_partner_id) ||
    toIntId(sourceQuote?.bill_to_odoo_partner_id) ||
    toIntId(originalQuote?.bill_to_odoo_partner_id) ||
    1;
  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La cotización final no tiene items");
  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean))];
  const products = await odoo.executeKw("product.product", "read", [productIds], {
    fields: ["id", "name", "uom_id"],
  });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  const orderLines = [];
  let grossPositiveTotal = 0;
  let totalToCharge = 0;
  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);
    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);
    const priceUnit = typeof l?.price_unit === "number"
      ? round2(l.price_unit)
      : calcDetailedUnitWithIva(l, revisionQuote.payload || sourceQuote?.payload || originalQuote.payload || {});
    totalToCharge = round2(totalToCharge + qty * priceUnit);
    if (priceUnit > 0) grossPositiveTotal = round2(grossPositiveTotal + qty * priceUnit);
    orderLines.push([
      0,
      0,
      {
        product_id: productId,
        product_uom_qty: qty,
        product_uom: uomId,
        name: toText(l?.raw_name || l?.name || p?.name),
        price_unit: priceUnit,
      },
    ]);
  }

  const originalBudgeted = round2(Number(originalQuote.deposit_amount || 0) || 0);
  const tolerancePercent = round2(await getCommercialFinalTolerancePercent());
  const toleranceAmount = round2((originalBudgeted * tolerancePercent) / 100);
  const rawDifference = round2(Math.max(0, grossPositiveTotal - originalBudgeted));
  const absorbedByCompany = originalBudgeted > 0 && rawDifference <= toleranceAmount;
  const refNo = referenceNumberFromQuote(originalQuote, revisionQuote);
  const referenceNv = refNo
    ? `NV${refNo}`
    : `NV${toText(revisionQuote?.quote_number || originalQuote?.quote_number)}`;

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id:
      toIntId(revisionQuote?.pricelist_id) ||
      toIntId(sourceQuote?.pricelist_id) ||
      toIntId(originalQuote?.pricelist_id) ||
      1,
    order_line: orderLines,
    origin: referenceNv,
    client_order_ref: referenceNv,
  }]);
  const order = { id: Number(createdOrderId), name: referenceNv };
  return {
    order,
    metrics: {
      detailed_total: grossPositiveTotal,
      tolerance_percent: tolerancePercent,
      tolerance_amount: toleranceAmount,
      difference_amount: rawDifference,
      absorbed_by_company: absorbedByCompany,
      final_amount_to_charge: round2(Math.max(0, totalToCharge)),
      reference_nv: referenceNv,
    },
  };
}
function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}
function resolveMeasurementPublicBaseUrl() {
  return (
    normalizeUrl(process.env.PUBLIC_BASE_URL) ||
    normalizeUrl(process.env.APP_PUBLIC_URL) ||
    normalizeUrl(process.env.FRONTEND_PUBLIC_URL) ||
    normalizeUrl(process.env.BACKEND_PUBLIC_URL) ||
    ""
  );
}
function buildMeasurementPublicUrl(quote) {
  const base = resolveMeasurementPublicBaseUrl();
  const token = String(quote?.measurement_share_token || "").trim();
  if (!base || !token) return "";
  return `${base}/api/pdf/medicion/public/${token}`;
}
function normalizePhoneForWhatsApp(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits}`;
}
function buildMeasurementApprovedMessage({ quote }) {
  const customerName = String(quote?.end_customer?.name || "cliente").trim();
  const reference = String(quote?.odoo_sale_order_name || quote?.quote_number || "").trim();
  const link = buildMeasurementPublicUrl(quote);
  const lines = [
    `Hola ${customerName}.`,
    reference ? `Ya quedó aprobada la planilla de medición / detalle técnico de la nota ${reference}.` : "Ya quedó aprobada la planilla de medición / detalle técnico.",
    link ? `Podés verla acá: ${link}` : "",
    "Muchas gracias.",
  ].filter(Boolean);
  return lines.join("\n");
}
async function maybeSendMeasurementApprovedWhatsApp({ quote }) {
  const to = normalizePhoneForWhatsApp(quote?.end_customer?.phone);
  const link = buildMeasurementPublicUrl(quote);
  const message = buildMeasurementApprovedMessage({ quote });
  if (!to) {
    return { sent: false, reason: "missing_phone", public_url: link, message };
  }
  const token = String(process.env.WHATSAPP_CLOUD_API_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || "v20.0").trim();
  if (!token || !phoneNumberId) {
    return { sent: false, reason: "whatsapp_not_configured", public_url: link, message, to };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: !!link,
          body: message,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        sent: false,
        reason: "whatsapp_api_error",
        status: response.status,
        error: data,
        public_url: link,
        message,
        to,
      };
    }
    return {
      sent: true,
      provider: "meta_cloud_api",
      response: data,
      public_url: link,
      message,
      to,
    };
  } catch (error) {
    return {
      sent: false,
      reason: "whatsapp_request_failed",
      error: error?.message || String(error || "Error enviando WhatsApp"),
      public_url: link,
      message,
      to,
    };
  }
}

async function buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm }) {
  const sourceQuote = await resolveBaseSourceQuote(originalQuote);
  const legacyMappings = await getMeasurementProductMappings();
  const technicalRules = await getTechnicalMeasurementRules();
  const technicalFieldsPayload = await getTechnicalMeasurementFieldDefinitions();
  const technicalFields = Array.isArray(technicalFieldsPayload?.fields) ? technicalFieldsPayload.fields : [];

  let baseLines = buildBasePositiveLinesFromQuote(sourceQuote);
  for (const field of technicalFields) {
    baseLines = replaceBoundProductsInBaseLines({
      baseLines,
      field,
      measurementForm: measurementForm || {},
    });
  }

  const legacySeeds = buildMeasurementLineSeedsFromLegacyMappings(
    measurementForm || {},
    legacyMappings.rules || [],
  );
  const technicalSeeds = buildMeasurementLineSeedsFromTechnicalRules(
    sourceQuote,
    measurementForm || {},
    technicalRules.rules || [],
  );
  const extraFieldSeeds = buildAdditionalLineSeedsFromFieldBindings(
    measurementForm || {},
    technicalFields,
  );

  const mergedExtraSeeds = dedupeLines([
    ...legacySeeds,
    ...technicalSeeds,
    ...extraFieldSeeds,
  ]);
  const pricedExtraLines = await hydrateMeasurementLinePrices(
    odoo,
    sourceQuote?.payload || originalQuote?.payload || {},
    mergedExtraSeeds,
  );

  const positiveLines = mergeByProductId([...baseLines, ...pricedExtraLines]);
  const tolerancePercent = await getCommercialFinalTolerancePercent();
  const discountLine = buildDiscountPreviewLine({
    originalQuote,
    pricingPayload: sourceQuote?.payload || originalQuote?.payload || {},
    pricedLines: positiveLines,
    tolerancePercent,
  });
  const finalLines = discountLine ? [...positiveLines, discountLine] : positiveLines;
  const positiveTotal = round2(
    positiveLines.reduce((acc, line) => {
      const qty = Number(line?.qty || 1) || 1;
      const price = typeof line?.price_unit === "number"
        ? round2(line.price_unit)
        : calcDetailedUnitWithIva(line, sourceQuote?.payload || originalQuote?.payload || {});
      return acc + qty * price;
    }, 0),
  );
  const originalBudgeted = round2(Number(originalQuote?.deposit_amount || 0) || 0);
  const toleranceAmount = round2((originalBudgeted * tolerancePercent) / 100);
  const differenceAmount = round2(Math.max(0, positiveTotal - originalBudgeted));
  const absorbedByCompany = originalBudgeted > 0 && differenceAmount <= toleranceAmount;
  const finalAmountToCharge = round2(
    Math.max(
      0,
      finalLines.reduce((acc, line) => {
        const qty = Number(line?.qty || 1) || 1;
        const price = typeof line?.price_unit === "number"
          ? round2(line.price_unit)
          : calcDetailedUnitWithIva(line, sourceQuote?.payload || originalQuote?.payload || {});
        return acc + qty * price;
      }, 0),
    ),
  );

  return {
    source_quote_id: sourceQuote?.id || originalQuote?.id || null,
    source_quote: sourceQuote,
    generated_lines: finalLines,
    priced_positive_lines: positiveLines,
    metrics: {
      detailed_total: positiveTotal,
      tolerance_percent: round2(tolerancePercent),
      tolerance_amount: toleranceAmount,
      difference_amount: differenceAmount,
      absorbed_by_company: absorbedByCompany,
      final_amount_to_charge: finalAmountToCharge,
      reference_nv: referenceNumberFromQuote(originalQuote, null),
    },
  };
}

export async function previewMeasurementRevisionQuote({ odoo, originalQuote, measurementForm }) {
  const base = await buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm });
  return {
    ...base,
    synced: false,
    revisionQuote: null,
    reason: base.generated_lines.length ? null : "Sin reglas aplicables",
  };
}

export async function finalizeMeasurementToRevisionQuote({ odoo, originalQuote, measurementForm }) {
  const base = await buildMeasurementFinalizationBase({ odoo, originalQuote, measurementForm });
  const finalLines = base.generated_lines || [];
  const whatsappNotification = await maybeSendMeasurementApprovedWhatsApp({ quote: originalQuote });

  if (!finalLines.length) {
    return {
      revisionQuote: null,
      generated_lines: [],
      synced: false,
      reason: "Sin reglas aplicables",
      metrics: base.metrics,
      whatsappNotification,
      source_quote_id: base.source_quote_id,
    };
  }

  const revisionQuote = await getOrCreateRevisionQuote({
    originalQuote,
    sourceQuote: base.source_quote,
    finalLines,
  });

  if (!revisionQuote || !odoo) {
    return {
      revisionQuote,
      generated_lines: finalLines,
      synced: false,
      reason: !odoo ? "Odoo no disponible" : "No se pudo crear la copia",
      metrics: base.metrics,
      whatsappNotification,
      source_quote_id: base.source_quote_id,
    };
  }

  const updSync = await dbQuery(
    `update public.presupuestador_quotes
        set status='syncing_odoo',
            final_status='syncing_odoo',
            final_technical_decision='approved',
            final_logistics_decision='approved',
            final_technical_notes=null,
            final_logistics_notes=null
      where id=$1
      returning *`,
    [revisionQuote.id],
  );
  const qSync = updSync.rows?.[0] || revisionQuote;
  const { order, metrics } = await syncFinalQuoteToOdoo({
    odoo,
    revisionQuote: qSync,
    originalQuote,
    sourceQuote: base.source_quote,
  });
  const updFinal = await dbQuery(
    `update public.presupuestador_quotes
        set status='synced_odoo',
            final_status='synced_odoo',
            final_sale_order_id=$2,
            final_sale_order_name=$3,
            final_synced_at=now(),
            final_tolerance_percent=$4,
            final_tolerance_amount=$5,
            final_difference_amount=$6,
            final_absorbed_by_company=$7
      where id=$1
      returning *`,
    [
      qSync.id,
      Number(order.id),
      order.name,
      metrics.tolerance_percent,
      metrics.tolerance_amount,
      metrics.difference_amount,
      metrics.absorbed_by_company,
    ],
  );
  return {
    revisionQuote: updFinal.rows?.[0] || qSync,
    generated_lines: finalLines,
    synced: true,
    order,
    metrics,
    whatsappNotification,
    source_quote_id: base.source_quote_id,
  };
}
