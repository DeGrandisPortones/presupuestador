import { dbQuery } from "./db.js";
import { ensureSettingsTable } from "./settingsDb.js";

let ensured = false;

/**
 * Ensures DB columns used by:
 * - mediciones
 * - acopio -> producción
 * - workflow v2 (confirmación + copias)
 * - cotización final detallada a Odoo
 */
export async function ensureQuotesMeasurementColumns() {
  if (ensured) return;

  // =========================
  // Workflow v2: copias
  // =========================
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quote_kind text not null default 'original';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists parent_quote_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists confirmed_at timestamptz null;`);

  // Monto del presupuesto confirmado (seña / a cuenta)
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists deposit_amount numeric(16,2) null;`);

  // =========================
  // Mediciones
  // =========================
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists requires_measurement boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_status text not null default 'none';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_form jsonb null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_assigned_to_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_scheduled_for date null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_scheduled_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_scheduled_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_at timestamptz null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_notes text null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_share_token text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_share_enabled_at timestamptz null;`);

  // =========================
  // Flujo final detallado a Odoo
  // =========================
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_status text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_decision text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_decision text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_notes text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_notes text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_sale_order_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_sale_order_name text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_synced_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_tolerance_percent numeric(8,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_tolerance_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_difference_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_absorbed_by_company boolean not null default false;`);

  // Backfill selectivo: solo portones en Odoo+producción que tengan el producto de medición en líneas
  const measurementProductId = String(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);
  await dbQuery(`
    update public.presupuestador_quotes
    set requires_measurement = true,
        measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end
    where catalog_kind = 'porton'
      and status = 'synced_odoo'
      and fulfillment_mode = 'produccion'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) elem
        where (elem->>'product_id') = '${measurementProductId}'
      )
  `);

  await ensureSettingsTable();
  ensured = true;
}
