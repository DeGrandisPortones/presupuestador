import { dbQuery } from "./db.js";
import { ensureSettingsTable } from "./settingsDb.js";

let ensured = false;

// Columnas de presupuestador_quotes para listados (aprobados/historial, circuito
// técnico, etc.) — todo MENOS los blobs JSONB pesados (payload puede pesar ~200KB
// por fila; con 200-300 filas eso son ~40MB y ~15s solo en destoastear en Postgres,
// medido en vivo). Ninguna de estas listas usa payload/lines/measurement_form/
// measurement_original_form/measurement_commercial_diff_json en pantalla — esos
// campos siguen disponibles enteros en GET /:id (detalle de un presupuesto puntual).
// Si agregás una columna nueva a presupuestador_quotes, sumala acá también.
export const QUOTE_LIST_COLUMNS_SQL = `
  q.id, q.created_by_user_id, q.created_by_role, q.status, q.commercial_decision, q.technical_decision,
  q.commercial_by_user_id, q.commercial_at, q.commercial_notes, q.technical_by_user_id, q.technical_at,
  q.technical_notes, q.rejection_notes, q.fulfillment_mode, q.pricelist_id, q.bill_to_odoo_partner_id,
  q.end_customer, q.note, q.odoo_sale_order_id, q.odoo_sale_order_name, q.created_at, q.updated_at,
  q.acopio_to_produccion_status, q.acopio_to_produccion_requested_by_user_id, q.acopio_to_produccion_requested_at,
  q.acopio_to_produccion_notes, q.acopio_to_produccion_commercial_decision, q.acopio_to_produccion_commercial_by_user_id,
  q.acopio_to_produccion_commercial_at, q.acopio_to_produccion_commercial_notes, q.acopio_to_produccion_technical_decision,
  q.acopio_to_produccion_technical_by_user_id, q.acopio_to_produccion_technical_at, q.acopio_to_produccion_technical_notes,
  q.catalog_kind, q.requires_measurement, q.measurement_status, q.measurement_assigned_to_user_id,
  q.measurement_by_user_id, q.measurement_at, q.measurement_review_by_user_id, q.measurement_review_at,
  q.measurement_review_notes, q.original_quote_id, q.measurement_source_quote_id, q.quote_kind, q.parent_quote_id,
  q.confirmed_at, q.deposit_amount, q.measurement_share_token, q.measurement_share_enabled_at, q.final_status,
  q.final_technical_decision, q.final_logistics_decision, q.final_technical_notes, q.final_logistics_notes,
  q.final_sale_order_id, q.final_sale_order_name, q.final_synced_at, q.final_tolerance_percent, q.final_tolerance_amount,
  q.final_difference_amount, q.final_absorbed_by_company, q.measurement_scheduled_for, q.measurement_scheduled_by_user_id,
  q.measurement_scheduled_at, q.quote_number, q.measurement_mode, q.measurement_subtype,
  q.measurement_commercial_review_required, q.measurement_commercial_review_status, q.measurement_commercial_review_by_user_id,
  q.measurement_commercial_review_at, q.production_delivery_year, q.production_delivery_week,
  q.production_delivery_week_start, q.production_delivery_week_end, q.production_delivery_weeks_out,
  q.production_delivery_capacity, q.production_delivery_committed_count, q.production_delivery_committed_at,
  q.final_technical_decision_at, q.final_technical_decision_by_user_id, q.final_logistics_decision_at,
  q.final_logistics_decision_by_user_id, q.measurement_client_accepted_at, q.envio_odoo_price_snapshot,
  q.measurement_link_sent_confirmed_at, q.measurement_link_sent_confirmed_by_user_id, q.cancelled_at,
  q.cancelled_by_user_id, q.cancellation_reason, q.quoted_delivery_year, q.quoted_delivery_week,
  q.quoted_delivery_week_start, q.quoted_delivery_week_end, q.quoted_delivery_weeks_out, q.quoted_delivery_captured_at,
  q.production_set_at
`;

function parseMeasurementProductIds(raw) {
  return String(raw || "2865,2961,4229")
    .split(",")
    .map((item) => Number(String(item || "").trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

// 4229 = "Servicio de Medicion y Relevamiento" de Puertas (duplicado dedicado, antes
// compartia el 2961 con Portones).
const MEASUREMENT_PRODUCT_IDS = parseMeasurementProductIds(
  process.env.ODOO_MEASUREMENT_PRODUCT_IDS ||
    process.env.ODOO_MEASUREMENT_PRODUCT_ID ||
    "2865,2961,4229",
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
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_client_accepted_at timestamptz null;`);
  // Control manual: el vendedor/tecnica confirma a mano que el link de aceptacion
  // realmente se le mando al cliente (no se infiere automaticamente de nada).
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_link_sent_confirmed_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_link_sent_confirmed_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_required boolean not null default false;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_status text null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_at timestamptz null;`);
  // Comentario interno de Comercial al aprobar la revision post-medicion (distinto de
  // measurement_review_notes, que es del vendedor al devolver): viaja a la nota de Odoo
  // de la NV final (ver syncFinalQuoteToOdoo en measurementFinalization.js).
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists measurement_commercial_review_notes text null;`);
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

  // Snapshot inmutable de la producción estimada que se le mostró al cliente en el
  // presupuesto/proforma al confirmar (ver captureQuotedProductionEstimate en
  // productionPlanning.js, llamado desde POST /:id/submit). Se escribe una sola vez y
  // nunca se pisa, para no perder "lo que le dijimos al principio" aunque la semana
  // finalmente reservada (production_delivery_*, recién al firmar el cliente el link)
  // termine siendo otra por cambios de capacidad mientras tanto.
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_year int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_week int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_week_start date null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_week_end date null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_weeks_out int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists quoted_delivery_captured_at timestamptz null;`);

  // Cancelacion de NV (rol Administracion, ver POST /:id/cancel-nv en quotes.routes.js):
  // terminal, sin vuelta atras. Vive en la fila "original" aunque la NV real este en la
  // copia final (quote_kind='copy') porque measurement_share_token tambien vive siempre
  // ahi - asi el link de aceptacion del cliente puede avisar la cancelacion consultando
  // la misma fila que ya usa hoy (ver clientAcceptance.routes.js).
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists cancelled_at timestamptz null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists cancelled_by_user_id int null;`);
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists cancellation_reason text null;`);

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

  // Se sacaron de acá (2026-08-20) dos UPDATE "one-time" que quedaron corriendo en
  // CADA arranque del backend (ensureQuotesMeasurementColumns no tiene fecha de
  // corte, solo el flag `ensured` en memoria de este proceso — se resetea en cada
  // deploy). La primera marcaba TODO Ipanel en producción ya sincronizado a Odoo
  // como "medición aprobada + aprobación técnica y logística final aprobadas + NV
  // generada", sin que nadie lo revisara y sin avisarle a Odoo (nunca llama a
  // renameOrderToReference) — por eso INP4433/4434/4435/4444 quedaron con nombre
  // "INP..." en vez de "INV..." aunque figuran como 100% terminados. La segunda
  // forzaba measurement_mode/subtype a 'tecnica_only'/'sin_medicion' en cualquier
  // Ipanel en producción sin finalizar, pisando los casos reales que sí necesitan
  // medición física (measurement_mode='medidor': hay 8 en la base), y reseteaba su
  // measurement_status a 'pending' si no estaba ya 'approved' — con riesgo real de
  // pisar el trabajo de un medidor/técnica en curso si el backend reiniciaba en
  // medio del circuito. Verificado antes de sacarlas: 0 presupuestos afectados hoy
  // por ninguna de las dos. Los 4 Ipanel ya mal marcados (INP4433/4434/4435/4444)
  // quedan con ese estado - corregirles el nombre requiere renombrar la orden real
  // en Odoo, no solo la base.

  // One-time: la puerta vinculada al portón NP3994 recibió PNP5981 por error de secuencia.
  // Se corrige a PNP3994 para que la NV futura quede como PNV3994.
  await dbQuery(`
    update public.presupuestador_quotes
       set odoo_sale_order_name = 'PNP3994'
     where odoo_sale_order_name = 'PNP5981'
       and catalog_kind = 'puerta'
  `);

  // Precio de Envío tomado de Odoo y congelado al crear el presupuesto (o al
  // apretar "Actualizar presupuesto" en uno viejo). No se recalcula solo en
  // ningun otro guardado; lo usan la proforma y el envio real a Odoo por igual.
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists envio_odoo_price_snapshot numeric(14,2) null;`);

  // Fecha en la que fulfillment_mode paso a 'produccion' (directo al crearse, o via
  // "pase a produccion" desde acopio). Columna nueva sin backfill a proposito: todo
  // presupuesto que YA estaba en produccion antes de este deploy queda en null para
  // siempre (no inventamos una fecha que no sabemos), y solo se completa hacia
  // adelante, la primera vez que un presupuesto entra a produccion despues de este
  // cambio. Ver los `case when ... then now() ...` sobre production_set_at en
  // quotes.routes.js (create, PUT draft, submit, pase a produccion desde acopio).
  await dbQuery(`alter table public.presupuestador_quotes add column if not exists production_set_at timestamptz null;`);

  await ensureSettingsTable();
  ensured = true;
}
