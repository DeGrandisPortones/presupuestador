
import { dbQuery } from "./db.js";
import { getCommercialFinalTolerancePercent, getMeasurementProductMappings } from "./settingsDb.js";

const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880);
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
function normalizeSellerDisplayName(value) {
  return String(value || "").trim();
}
function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
function referenceNumberFromQuote(originalQuote, revisionQuote) {
  const direct = toText(originalQuote?.odoo_sale_order_name)
    || toText(originalQuote?.final_sale_order_name)
    || toText(originalQuote?.quote_number)
    || toText(revisionQuote?.final_sale_order_name)
    || toText(revisionQuote?.quote_number);
  const digits = onlyDigits(direct);
  if (digits) return digits;
  return direct || "";
}
function normalizePhoneForLookup(v) {
  return String(v || "").replace(/\D+/g, "").trim();
}
function normalizeNameForLookup(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
function partnerLooksLikeSameCustomer(partner, customer) {
  const partnerName = normalizeNameForLookup(partner?.name);
  const customerName = normalizeNameForLookup(customer?.name);
  if (!partnerName || !customerName || partnerName !== customerName) return false;

  const customerEmail = toText(customer?.email).toLowerCase();
  const partnerEmail = toText(partner?.email).toLowerCase();
  if (customerEmail && partnerEmail && customerEmail === partnerEmail) return true;

  const customerPhone = normalizePhoneForLookup(customer?.phone);
  const partnerPhone = normalizePhoneForLookup(partner?.phone || partner?.mobile);
  if (customerPhone && partnerPhone && customerPhone === partnerPhone) return true;

  const customerStreet = normalizeNameForLookup(customer?.street || customer?.address);
  const partnerStreet = normalizeNameForLookup(partner?.street);
  if (customerStreet && partnerStreet && customerStreet === partnerStreet) return true;

  const customerCity = normalizeNameForLookup(customer?.city);
  const partnerCity = normalizeNameForLookup(partner?.city);
  if (customerCity && partnerCity && customerCity === partnerCity) return true;

  return !customerEmail && !customerPhone && !customerStreet && !customerCity;
}
async function readPartnerLite(odoo, partnerId) {
  const id = toIntId(partnerId);
  if (!id) return null;
  try {
    const rows = await odoo.executeKw("res.partner", "read", [[id]], {
      fields: ["id", "name", "email", "phone", "mobile", "street", "city"],
    });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}
async function findOrCreateCustomerPartner(odoo, customer) {
  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name");

  const email = toText(customer?.email).toLowerCase();
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 5 });
    for (const candidateId of ids || []) {
      const partner = await readPartnerLite(odoo, candidateId);
      if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
    }
  }

  const phone = toText(customer?.phone);
  if (phone) {
    try {
      const idsPhone = await odoo.executeKw("res.partner", "search", [[["phone", "=", phone]]], { limit: 5 });
      for (const candidateId of idsPhone || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
      }
    } catch {}
    try {
      const idsMobile = await odoo.executeKw("res.partner", "search", [[["mobile", "=", phone]]], { limit: 5 });
      for (const candidateId of idsMobile || []) {
        const partner = await readPartnerLite(odoo, candidateId);
        if (partnerLooksLikeSameCustomer(partner, customer)) return toIntId(candidateId);
      }
    } catch {}
  }

  const created = await odoo.executeKw("res.partner", "create", [{
    name,
    email: email || false,
    phone: phone || false,
    street: toText(customer?.street) || toText(customer?.address) || false,
    city: toText(customer?.city) || false,
    customer_rank: 1,
  }]);
  const id = toIntId(created);
  if (!id) throw new Error("No se pudo crear partner en Odoo");
  return id;
}
async function getCreatorOdooPartnerId(createdByUserId) {
  try {
    const r = await dbQuery(`select odoo_partner_id from public.presupuestador_users where id=$1`, [Number(createdByUserId)]);
    const v = r.rows?.[0]?.odoo_partner_id;
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
async function getCreatorDisplayData(createdByUserId) {
  try {
    const r = await dbQuery(`select full_name, username from public.presupuestador_users where id=$1 limit 1`, [Number(createdByUserId)]);
    const row = r.rows?.[0] || {};
    return {
      full_name: normalizeSellerDisplayName(row.full_name),
      username: normalizeSellerDisplayName(row.username),
    };
  } catch {
    return { full_name: "", username: "" };
  }
}
async function resolveSellerDisplayNameForQuote(quote, fallbackUser = null) {
  const directFullName = normalizeSellerDisplayName(quote?.created_by_full_name || quote?.seller_name || quote?.sellerName);
  if (directFullName) return directFullName;
  const directUsername = normalizeSellerDisplayName(quote?.created_by_username);
  if (directUsername) return directUsername;
  const created = await getCreatorDisplayData(quote?.created_by_user_id);
  if (created.full_name) return created.full_name;
  if (created.username) return created.username;
  return normalizeSellerDisplayName(fallbackUser?.full_name || fallbackUser?.username || "");
}
function appendPaymentMethodToNote(note, paymentMethod) {
  const pm = toText(paymentMethod);
  if (!pm) return note;
  return `${note}\nForma de pago: ${pm}`;
}
async function renameOrderToReference(odoo, orderId, reference) {
  const ref = toText(reference);
  if (!orderId || !ref) return null;
  try {
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], { name: ref, origin: ref, client_order_ref: ref }]);
  } catch {
    // noop
  }
  const [order] = await odoo.executeKw("sale.order", "read", [[Number(orderId)]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"],
  });
  return order || null;
}
function calcDetailedUnitWithIva(line, payload) {
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + IVA_RATE));
}
function buildMeasurementLineSeedsFromRules(form, rules) {
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
  } catch {
    products = [];
  }
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));
  const templateIds = [...new Set((products || []).map((p) => toIntId(p?.product_tmpl_id)).filter(Boolean))];
  let templates = [];
  if (templateIds.length) {
    try {
      templates = await odoo.executeKw("product.template", "read", [templateIds], { fields: ["id", "list_price"] });
    } catch {
      templates = [];
    }
  }
  const tmplById = new Map((templates || []).map((t) => [Number(t.id), t]));

  return list.map((seed) => {
    const p = byId.get(Number(seed.product_id));
    const tmplId = toIntId(p?.product_tmpl_id);
    const tmpl = tmplById.get(Number(tmplId));
    const basePrice = Number(
      p?.lst_price ??
      p?.list_price ??
      tmpl?.list_price ??
      seed?.basePrice ??
      0
    ) || 0;

    return {
      ...seed,
      name: toText(seed?.name) || toText(p?.name) || `Producto ${seed.product_id}`,
      raw_name: toText(seed?.raw_name) || toText(p?.name) || `Producto ${seed.product_id}`,
      code: toText(p?.default_code) || seed?.code || null,
      basePrice,
    };
  });
}
function buildDiscountPreviewLine({ originalQuote, pricedLines, tolerancePercent }) {
  const originalBudgeted = round2(Number(originalQuote?.deposit_amount || 0) || 0);
  if (originalBudgeted <= 0) return null;

  const positiveTotal = round2(pricedLines.reduce((acc, line) => {
    const price = calcDetailedUnitWithIva(line, originalQuote?.payload || {});
    const qty = Number(line?.qty || 1) || 1;
    if (price <= 0) return acc;
    return acc + (qty * price);
  }, 0));

  if (positiveTotal <= 0) return null;

  const toleranceAmount = round2((originalBudgeted * Number(tolerancePercent || 0)) / 100);
  const rawDifference = round2(Math.max(0, positiveTotal - originalBudgeted));

  let discountAmount = originalBudgeted;
  if (rawDifference <= toleranceAmount) {
    discountAmount = positiveTotal;
  }

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
async function getOrCreateRevisionQuote(originalQuote, finalLines) {
  const existing = await dbQuery(
    `select * from public.presupuestador_quotes where quote_kind='copy' and parent_quote_id=$1 order by created_at desc nulls last, id desc limit 1`,
    [originalQuote.id]
  );
  const copy = existing.rows?.[0];
  if (copy) {
    const upd = await dbQuery(
      `
      update public.presupuestador_quotes
      set lines=$2::jsonb,
          end_customer=$3::jsonb,
          payload=$4::jsonb,
          note=$5,
          final_status='draft'
      where id=$1
      returning *
      `,
      [
        copy.id,
        JSON.stringify(finalLines),
        JSON.stringify(originalQuote.end_customer || {}),
        JSON.stringify(originalQuote.payload || {}),
        originalQuote.note || null,
      ]
    );
    return upd.rows?.[0] || copy;
  }

  const ins = await dbQuery(
    `
    insert into public.presupuestador_quotes
      (quote_kind, parent_quote_id,
       created_by_user_id, created_by_role,
       fulfillment_mode, pricelist_id, bill_to_odoo_partner_id,
       end_customer, lines, payload, note,
       catalog_kind,
       status, commercial_decision, technical_decision,
       final_status)
    values
      ('copy', $1,
       $2, $3,
       $4, $5, $6,
       $7::jsonb, $8::jsonb, $9::jsonb, $10,
       $11,
       'draft', 'pending', 'pending',
       'draft')
    returning *
    `,
    [
      originalQuote.id,
      originalQuote.created_by_user_id,
      originalQuote.created_by_role,
      originalQuote.fulfillment_mode,
      originalQuote.pricelist_id,
      originalQuote.bill_to_odoo_partner_id,
      JSON.stringify(originalQuote.end_customer || {}),
      JSON.stringify(finalLines),
      JSON.stringify(originalQuote.payload || {}),
      originalQuote.note || null,
      originalQuote.catalog_kind || "porton",
    ]
  );
  return ins.rows?.[0] || null;
}
async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = toIntId(revisionQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id) || 1;
  const sellerName = await resolveSellerDisplayNameForQuote(originalQuote, approverUser);

  let partnerId = null;
  if (originalQuote.created_by_role === "distribuidor") {
    partnerId = toIntId(originalQuote?.bill_to_odoo_partner_id) || await getCreatorOdooPartnerId(originalQuote.created_by_user_id) || toIntId(approverUser?.odoo_partner_id);
    if (!partnerId) throw new Error("Distribuidor sin partner en Odoo");
  } else {
    partnerId = await findOrCreateCustomerPartner(odoo, originalQuote.end_customer || {});
  }
  partnerId = toIntId(partnerId);
  if (!partnerId) throw new Error("partner_id invalido para Odoo");

  const lines = Array.isArray(revisionQuote.lines) ? revisionQuote.lines : [];
  if (!lines.length) throw new Error("La cotización final no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat([Number(PLACEHOLDER_PRODUCT_ID)]))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
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
    const priceUnit = calcDetailedUnitWithIva(l, revisionQuote.payload || originalQuote.payload || {});
    totalToCharge = round2(totalToCharge + (qty * priceUnit));
    if (priceUnit > 0) grossPositiveTotal = round2(grossPositiveTotal + (qty * priceUnit));

    orderLines.push([0, 0, {
      product_id: productId,
      product_uom_qty: qty,
      product_uom: uomId,
      name: toText(l?.raw_name || l?.name || p?.name),
      price_unit: priceUnit,
    }]);
  }

  const originalBudgeted = round2(Number(originalQuote.deposit_amount || 0) || 0);
  const tolerancePercent = round2(await getCommercialFinalTolerancePercent());
  const toleranceAmount = round2((originalBudgeted * tolerancePercent) / 100);
  const rawDifference = round2(Math.max(0, grossPositiveTotal - originalBudgeted));
  const absorbedByCompany = originalBudgeted > 0 && rawDifference <= toleranceAmount;

  const refNo = referenceNumberFromQuote(originalQuote, revisionQuote);
  const referenceNv = refNo ? `NV${refNo}` : `NV${toText(revisionQuote?.quote_number || originalQuote?.quote_number)}`;
  let note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `\nReferencia: ${referenceNv}`
    + `\nReferencia seña: ${originalQuote.odoo_sale_order_name || originalQuote.odoo_sale_order_id || "-"}`
    + `\nTotal detallado: ${grossPositiveTotal}`
    + `\nTolerancia comercial %: ${tolerancePercent}`
    + `\nTolerancia comercial monto: ${toleranceAmount}`
    + `\nDiferencia original: ${rawDifference}`
    + `\nAbsorbido por la empresa: ${absorbedByCompany ? "SI" : "NO"}`
    + `\nImporte final a facturar: ${round2(Math.max(0, totalToCharge))}`
    + (sellerName ? `\nVendedor: ${sellerName}` : "");
  note = appendPaymentMethodToNote(note, revisionQuote?.payload?.payment_method || originalQuote?.payload?.payment_method);

  const createdOrderId = await odoo.executeKw("sale.order", "create", [{
    partner_id: partnerId,
    pricelist_id: pricelistId,
    order_line: orderLines,
    origin: referenceNv,
    client_order_ref: referenceNv,
    note,
  }]);
  const orderId = toIntId(createdOrderId);
  if (!orderId) throw new Error("No se pudo crear sale.order final en Odoo");
  const order = await renameOrderToReference(odoo, orderId, referenceNv);
  if (!order?.id) throw new Error("No se pudo leer sale.order final en Odoo");

  return {
    order,
    metrics: {
      detailed_total: grossPositiveTotal,
      advance_discounted_amount: round2(Math.max(0, grossPositiveTotal - Math.max(0, totalToCharge))),
      tolerance_percent: tolerancePercent,
      tolerance_amount: toleranceAmount,
      difference_amount: rawDifference,
      absorbed_by_company: absorbedByCompany,
      final_amount_to_charge: round2(Math.max(0, totalToCharge)),
      reference_nv: referenceNv,
    },
  };
}

export async function finalizeMeasurementToRevisionQuote({ odoo, originalQuote, measurementForm, approverUser }) {
  const mappings = await getMeasurementProductMappings();
  const lineSeeds = buildMeasurementLineSeedsFromRules(measurementForm || {}, mappings.rules || []);
  const pricedPositiveLines = await hydrateMeasurementLinePrices(odoo, originalQuote?.payload || {}, lineSeeds);
  const tolerancePercent = await getCommercialFinalTolerancePercent();
  const discountLine = buildDiscountPreviewLine({
    originalQuote,
    pricedLines: pricedPositiveLines,
    tolerancePercent,
  });
  const finalLines = discountLine ? [...pricedPositiveLines, discountLine] : pricedPositiveLines;

  if (!finalLines.length) {
    return { revisionQuote: null, generated_lines: [], synced: false, reason: "Sin reglas aplicables" };
  }

  const revisionQuote = await getOrCreateRevisionQuote(originalQuote, finalLines);
  if (!revisionQuote || !odoo) {
    return { revisionQuote, generated_lines: finalLines, synced: false, reason: !odoo ? "Odoo no disponible" : "No se pudo crear la copia" };
  }

  const updSync = await dbQuery(
    `
    update public.presupuestador_quotes
    set status='syncing_odoo',
        final_status='syncing_odoo',
        final_technical_decision='approved',
        final_logistics_decision='approved',
        final_technical_notes=null,
        final_logistics_notes=null
    where id=$1
    returning *
    `,
    [revisionQuote.id]
  );
  const qSync = updSync.rows?.[0] || revisionQuote;

  const { order, metrics } = await syncFinalQuoteToOdoo({
    odoo,
    revisionQuote: qSync,
    originalQuote,
    approverUser,
  });

  const updFinal = await dbQuery(
    `
    update public.presupuestador_quotes
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
    returning *
    `,
    [
      qSync.id,
      Number(order.id),
      order.name,
      metrics.tolerance_percent,
      metrics.tolerance_amount,
      metrics.difference_amount,
      metrics.absorbed_by_company,
    ]
  );

  return {
    revisionQuote: updFinal.rows?.[0] || qSync,
    generated_lines: finalLines,
    synced: true,
    order,
    metrics,
  };
}
