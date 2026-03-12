import { dbQuery } from "./db.js";

let ensured = false;

export async function ensureDoorsSchema() {
  if (ensured) return;

  await dbQuery(`
    create table if not exists public.presupuestador_doors (
      id bigserial primary key,
      created_by_user_id int not null,
      linked_quote_id uuid null,
      door_code text not null,
      status text not null default 'draft',
      commercial_decision text not null default 'pending',
      technical_decision text not null default 'pending',
      commercial_notes text null,
      technical_notes text null,
      supplier_odoo_partner_id int null,
      sale_amount numeric(16,2) null,
      purchase_amount numeric(16,2) null,
      odoo_sale_order_id int null,
      odoo_sale_order_name text null,
      odoo_purchase_order_id int null,
      odoo_purchase_order_name text null,
      synced_at timestamptz null,
      record jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await dbQuery(`alter table public.presupuestador_doors add column if not exists commercial_decision text not null default 'pending';`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists technical_decision text not null default 'pending';`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists commercial_notes text null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists technical_notes text null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists supplier_odoo_partner_id int null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists sale_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists purchase_amount numeric(16,2) null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists odoo_sale_order_id int null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists odoo_sale_order_name text null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists odoo_purchase_order_id int null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists odoo_purchase_order_name text null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists synced_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists record jsonb not null default '{}'::jsonb;`);
  await dbQuery(`alter table public.presupuestador_doors add column if not exists updated_at timestamptz not null default now();`);

  await dbQuery(`
    create unique index if not exists presupuestador_doors_linked_quote_uidx
    on public.presupuestador_doors(linked_quote_id)
    where linked_quote_id is not null;
  `);

  await dbQuery(`
    create index if not exists presupuestador_doors_created_by_idx
    on public.presupuestador_doors(created_by_user_id);
  `);

  await dbQuery(`
    create index if not exists presupuestador_doors_status_idx
    on public.presupuestador_doors(status);
  `);

  ensured = true;
}
