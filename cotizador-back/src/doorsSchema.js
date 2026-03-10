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
      record jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await dbQuery(`
    create unique index if not exists presupuestador_doors_linked_quote_uidx
    on public.presupuestador_doors(linked_quote_id)
    where linked_quote_id is not null;
  `);

  await dbQuery(`
    create index if not exists presupuestador_doors_created_by_idx
    on public.presupuestador_doors(created_by_user_id);
  `);

  ensured = true;
}
