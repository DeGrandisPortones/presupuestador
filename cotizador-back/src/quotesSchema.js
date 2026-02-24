import { dbQuery } from "./db.js";

let ensured = false;

export async function ensureQuotesMeasurementColumns() {
  if (ensured) return;

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists requires_measurement boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_status text not null default 'none';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_form jsonb null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_assigned_to_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_at timestamptz null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_review_notes text null;`);

  // Backfill seguro: portones ya en Odoo y en producción => requieren medición
  await dbQuery(`
    update public.presupuestador_quotes
    set requires_measurement = true,
        measurement_status = case when measurement_status = 'none' then 'pending' else measurement_status end
    where catalog_kind = 'porton'
      and status = 'synced_odoo'
      and fulfillment_mode = 'produccion'
  `);

  ensured = true;
}
