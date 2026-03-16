import { dbQuery } from "./db.js";
import { getCommercialFinalTolerancePercent, getMeasurementProductMappings } from "./settingsDb.js";

const PLACEHOLDER_PRODUCT_ID = Number(process.env.ODOO_PLACEHOLDER_PRODUCT_ID || 2880);
const IVA_RATE = 0.21;

function toScalar(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}
function toIntId(v) {
  const x = toScalar(v);
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toText(v) {
  const x = toScalar(v);
  const s = x === null || x === undefined ? "" : String(x);
  return s.trim();
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
function buildMeasurementLinesFromRules(form, rules) {
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
        name: String(entry.label || rule.label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        raw_name: String(entry.label || rule.label || rule.field_key || `Producto ${entry.product_id}`).trim(),
        code: null,
        basePrice: 0,
      });
    }
  }
  return out;
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

async function findOrCreateCustomerPartner(odoo, customer) {
  const email = toText(customer?.email);
  if (email) {
    const ids = await odoo.executeKw("res.partner", "search", [[["email", "=", email]]], { limit: 1 });
    if (ids?.[0]) return toIntId(ids[0]);
  }

  const name = toText(customer?.name);
  if (!name) throw new Error("Falta end_customer.name");

  const ids2 = await odoo.executeKw("res.partner", "search", [[["name", "=", name]]], { limit: 1 });
  if (ids2?.[0]) return toIntId(ids2[0]);

  const created = await odoo.executeKw("res.partner", "create", [{
    name,
    email: email || false,
    phone: toText(customer?.phone) || false,
    street: toText(customer?.street) || toText(customer?.address) || false,
    city: toText(customer?.city) || false,
    customer_rank: 1,
  }]);

  const id = toIntId(created);
  if (!id) throw new Error("No se pudo crear partner en Odoo");
  return id;
}

async function renameOrderToReference(odoo, orderId, reference) {
  const ref = toText(reference);
  if (!orderId || !ref) return null;
  try {
    await odoo.executeKw("sale.order", "write", [[Number(orderId)], {
      name: ref,
      origin: ref,
      client_order_ref: ref,
    }]);
  } catch {
    // Si Odoo no deja escribir name, al menos quedan origin/client_order_ref del create.
  }
  const [order] = await odoo.executeKw("sale.order", "read", [[Number(orderId)]], {
    fields: ["id", "name", "amount_total", "partner_id", "state", "pricelist_id", "origin", "client_order_ref"],
  });
  return order || null;
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

function calcDetailedUnitWithIva(line, payload) {
  if (typeof line?.price_unit === "number") return round2(line.price_unit);
  if (typeof line?.unit_price === "number") return round2(line.unit_price);
  const base = Number(line?.basePrice ?? line?.base_price ?? line?.price ?? 0) || 0;
  const margin = Number(payload?.margin_percent_ui || 0) || 0;
  return round2(base * (1 + margin / 100) * (1 + IVA_RATE));
}

async function syncFinalQuoteToOdoo({ odoo, revisionQuote, originalQuote, approverUser }) {
  const pricelistId = toIntId(revisionQuote?.pricelist_id) || toIntId(originalQuote?.pricelist_id) || 1;

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
  if (!lines.length) throw new Error("La copia no tiene items");

  const productIds = [...new Set(lines.map((l) => Number(l.product_id)).filter(Boolean).concat([Number(PLACEHOLDER_PRODUCT_ID)]))];
  const products = await odoo.executeKw("product.product", "read", [productIds], { fields: ["id", "name", "uom_id"] });
  const byId = new Map((products || []).map((p) => [Number(p.id), p]));

  const orderLines = [];
  let detailedTotal = 0;

  for (const l of lines) {
    const productId = Number(l.product_id);
    const qty = Number(l.qty || 1) || 1;
    const p = byId.get(productId);
    if (!p) throw new Error(`Producto no encontrado: ${productId}`);

    const uomId = toIntId(p?.uom_id);
    if (!uomId) throw new Error(`Producto sin uom_id: ${productId}`);

    const priceUnit = calcDetailedUnitWithIva(l, revisionQuote.payload || originalQuote.payload || {});
    detailedTotal = round2(detailedTotal + (qty * priceUnit));

    orderLines.push([0, 0, {
      product_id: productId,
      product_uom_qty: qty,
      product_uom: uomId,
      name: p.name,
      price_unit: priceUnit,
    }]);
  }

  const depositAmount = round2(Number(originalQuote.deposit_amount || 0) || 0);
  const tolerancePercent = round2(await getCommercialFinalTolerancePercent());
  const toleranceAmount = round2((depositAmount * tolerancePercent) / 100);
  const rawDifference = round2(detailedTotal - depositAmount);

  let absorbedByCompany = false;
  let advanceToDiscount = 0;

  if (depositAmount > 0) {
    if (detailedTotal <= depositAmount) {
      absorbedByCompany = true;
      advanceToDiscount = detailedTotal;
    } else if (rawDifference <= toleranceAmount) {
      absorbedByCompany = true;
      advanceToDiscount = detailedTotal;
    } else {
      advanceToDiscount = depositAmount;
    }
  }

  if (advanceToDiscount > 0) {
    const ph = byId.get(Number(PLACEHOLDER_PRODUCT_ID));
    const uomId = toIntId(ph?.uom_id);
    if (!uomId) throw new Error(`Producto anticipo sin uom_id: ${PLACEHOLDER_PRODUCT_ID}`);

    orderLines.push([0, 0, {
      product_id: Number(PLACEHOLDER_PRODUCT_ID),
      product_uom_qty: 1,
      product_uom: uomId,
      name: `Pago anticipado según presupuesto ${originalQuote.odoo_sale_order_name || originalQuote.id}`,
      price_unit: round2(-advanceToDiscount),
    }]);
  }

  const finalAmountToCharge = round2(Math.max(0, detailedTotal - advanceToDiscount));
  const referenceNv = originalQuote.odoo_sale_order_name ? `NV${originalQuote.odoo_sale_order_name}` : `NV${String(originalQuote.id).slice(0, 8)}`;
  const note = `PRESUPUESTADOR FINAL: COPY ${revisionQuote.id} (ORIG ${originalQuote.id})`
    + `\nReferencia: ${referenceNv}`
    + `\nReferencia seña: ${originalQuote.odoo_sale_order_name || originalQuote.odoo_sale_order_id || "-"}`
    + `\nTotal detallado: ${detailedTotal}`
    + `\nAnticipo descontado: ${advanceToDiscount}`
    + `\nDiferencia original: ${rawDifference}`
    + `\nTolerancia comercial %: ${tolerancePercent}`
    + `\nTolerancia comercial monto: ${toleranceAmount}`
    + (absorbedByCompany ? `\nAbsorbido por la empresa: SI` : `\nAbsorbido por la empresa: NO`)
    + `\nImporte final a facturar: ${finalAmountToCharge}`;

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
      detailed_total: detailedTotal,
      advance_discounted_amount: round2(advanceToDiscount),
      tolerance_percent: tolerancePercent,
      tolerance_amount: toleranceAmount,
      difference_amount: rawDifference,
      absorbed_by_company: absorbedByCompany,
      final_amount_to_charge: finalAmountToCharge,
      reference_nv: referenceNv,
    },
  };
}

export async function finalizeMeasurementToRevisionQuote({ odoo, originalQuote, measurementForm, approverUser }) {
  const mappings = await getMeasurementProductMappings();
  const finalLines = buildMeasurementLinesFromRules(measurementForm || {}, mappings.rules || []);
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
