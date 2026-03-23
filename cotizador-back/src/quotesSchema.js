import { dbQuery } from "./db.js";
import { ensureSettingsTable } from "./settingsDb.js";

let ensured = false;

export async function ensureQuotesMeasurementColumns() {
  if (ensured) return;

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quote_kind text not null default 'original';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists parent_quote_id uuid null;`);
  await dbQuery(`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'presupuestador_quotes'
          and column_name = 'parent_quote_id'
          and udt_name <> 'uuid'
      ) then
        execute '
          alter table public.presupuestador_quotes
          alter column parent_quote_id type uuid
          using (
            case
              when parent_quote_id is null then null
              when parent_quote_id::text ~* ''^[0-9a-fA-F-]{36}$'' then parent_quote_id::text::uuid
              else null
            end
          )
        ';
      end if;
    end $$;
  `);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists confirmed_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists deposit_amount numeric(16,2) null;`);

  await dbQuery(`create sequence if not exists public.presupuestador_quote_number_seq start with 1000 increment by 1;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quote_number bigint null;`);
  await dbQuery(`alter table public.presupuestador_quotes alter column quote_number set default nextval('public.presupuestador_quote_number_seq');`);
  await dbQuery(`update public.presupuestador_quotes set quote_number = nextval('public.presupuestador_quote_number_seq') where quote_number is null;`);
  await dbQuery(`create unique index if not exists presupuestador_quotes_quote_number_uidx on public.presupuestador_quotes (quote_number);`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists requires_measurement boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_status text not null default 'none';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_mode text not null default 'medidor';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_subtype text not null default 'normal';`);
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

  const measurementProductId = String(process.env.ODOO_MEASUREMENT_PRODUCT_ID || 2865);
  await dbQuery(`
    update public.presupuestador_quotes
    set requires_measurement = true,
        measurement_mode = 'medidor',
        measurement_subtype = 'normal',
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
