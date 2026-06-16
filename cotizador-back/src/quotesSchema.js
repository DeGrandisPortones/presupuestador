import { dbQuery } from "./db.js";
import { ensureSettingsTable } from "./settingsDb.js";

let ensured = false;

function parseMeasurementProductIds(raw) {
  return String(raw || "2865,2961")
    .split(",")
    .map((item) => Number(String(item || "").trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

const MEASUREMENT_PRODUCT_IDS = parseMeasurementProductIds(
  process.env.ODOO_MEASUREMENT_PRODUCT_IDS ||
    process.env.ODOO_MEASUREMENT_PRODUCT_ID ||
    "2865,2961",
);

async function ensureQuoteCatalogKindConstraint() {
  await dbQuery(`
    do $$
    declare item record;
    begin
      for item in
        select c.conname, c.conrelid::regclass as table_name
          from pg_constraint c
          join pg_class rel on rel.oid = c.conrelid
          join pg_namespace nsp on nsp.oid = rel.relnamespace
         where nsp.nspname = 'public'
           and rel.relname = 'presupuestador_quotes'
           and c.contype = 'c'
           and pg_get_constraintdef(c.oid) ilike '%catalog_kind%'
      loop
        execute format('alter table %s drop constraint if exists %I', item.table_name, item.conname);
      end loop;

      if to_regclass('public.presupuestador_quotes') is not null then
        alter table public.presupuestador_quotes
          add constraint presupuestador_quotes_catalog_kind_check
          check (catalog_kind in ('porton', 'ipanel', 'plegados', 'otros', 'puerta'));
      end if;
    end $$;
  `);
}

export async function ensureQuotesMeasurementColumns() {
  if (ensured) return;

  await ensureQuoteCatalogKindConstraint();

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
  await dbQuery(`create sequence if not exists public.presupuestador_odoo_reference_seq start with 4239 increment by 1;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quote_number bigint null;`);
  await dbQuery(`alter table public.presupuestador_quotes alter column quote_number set default nextval('public.presupuestador_quote_number_seq');`);
  await dbQuery(`update public.presupuestador_quotes set quote_number = nextval('public.presupuestador_quote_number_seq') where quote_number is null;`);
  await dbQuery(`create unique index if not exists presupuestador_quotes_quote_number_uidx on public.presupuestador_quotes (quote_number);`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists requires_measurement boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_status text not null default 'none';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_mode text not null default 'medidor';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_subtype text not null default 'normal';`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_form jsonb null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_original_form jsonb null;`);
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
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_required boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_status text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_diff_json jsonb null;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_status text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_decision text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_decision_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_decision_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_decision text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_decision_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_decision_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_technical_notes text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_logistics_notes text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_sale_order_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_sale_order_name text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_synced_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_tolerance_percent numeric(8,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_tolerance_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_difference_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists final_absorbed_by_company boolean not null default false;`);

  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_year int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_week int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_week_start date null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_week_end date null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_weeks_out int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_capacity int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_committed_count int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_delivery_committed_at timestamptz null;`);

  const measurementProductIds = MEASUREMENT_PRODUCT_IDS.map(String);
  await dbQuery(
    `
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
          where (elem->>'product_id') = any($1::text[])
        )
    `,
    [measurementProductIds],
  );

  await dbQuery(`
    update public.presupuestador_quotes
       set requires_measurement = false,
           measurement_mode = 'medidor',
           measurement_subtype = 'normal',
           measurement_status = 'none'
     where catalog_kind = 'ipanel'
       and fulfillment_mode = 'acopio'
       and coalesce(measurement_status, 'none') <> 'approved'
  `);

  await dbQuery(`
    update public.presupuestador_quotes
       set requires_measurement = true,
           measurement_mode = 'tecnica_only',
           measurement_subtype = 'sin_medicion',
           measurement_status = 'approved',
           measurement_review_at = coalesce(measurement_review_at, final_synced_at, confirmed_at, updated_at, created_at, now()),
           final_status = 'synced_odoo',
           final_technical_decision = 'approved',
           final_logistics_decision = 'approved',
           final_sale_order_id = coalesce(final_sale_order_id, odoo_sale_order_id),
           final_sale_order_name = coalesce(final_sale_order_name, odoo_sale_order_name),
           final_synced_at = coalesce(final_synced_at, confirmed_at, updated_at, created_at, now())
     where catalog_kind = 'ipanel'
       and fulfillment_mode = 'produccion'
       and quote_kind = 'original'
       and status = 'synced_odoo'
       and coalesce(final_status, '') not in ('synced_odoo', 'syncing_odoo')
       and (
         coalesce(odoo_sale_order_id, 0) <> 0
         or odoo_sale_order_name is not null
       )
  `);

  await dbQuery(`
    update public.presupuestador_quotes
       set requires_measurement = true,
           measurement_mode = 'tecnica_only',
           measurement_subtype = 'sin_medicion',
           measurement_status = case
             when measurement_status = 'approved' then measurement_status
             else 'pending'
           end
     where catalog_kind = 'ipanel'
       and fulfillment_mode = 'produccion'
       and quote_kind = 'original'
       and coalesce(final_sale_order_id, 0) = 0
       and coalesce(final_status, '') not in ('synced_odoo', 'syncing_odoo')
       and status in ('pending_approvals', 'synced_odoo', 'syncing_odoo')
  `);

  await ensureSettingsTable();
  ensured = true;
}
