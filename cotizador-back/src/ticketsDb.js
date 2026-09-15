// src/ticketsDb.js — capa de datos del sistema de Tickets, COMPARTIDO entre
// todas las apps del ecosistema (planificación, integrador, presupuestador,
// ...). Todas escriben en las mismas tablas public.tickets /
// public.ticket_mensajes de esta misma base — no hay tablas propias de
// presupuestador para esto. Se gestionan todos desde /admin/tickets en
// planificación; acá solo se puede crear y ver/responder los propios.
import { dbQuery } from "./db.js";

let ensured = false;

// Idempotente (CREATE TABLE IF NOT EXISTS), mismo esquema final que crea la
// migración de planificación (Backend/server/index.js, MIGRATIONS: tickets,
// ticket_mensajes, tickets_multi_app, tickets_creado_por_id_text).
export async function ensureTicketsSchema() {
  if (ensured) return;
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS public.tickets (
      id SERIAL PRIMARY KEY,
      categoria TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pending',
      creado_por_id TEXT,
      creado_por_username TEXT,
      ruta_origen TEXT,
      app_origen TEXT NOT NULL DEFAULT 'planificacion',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_estado ON public.tickets(estado);
    CREATE INDEX IF NOT EXISTS idx_tickets_creado_por ON public.tickets(creado_por_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_app_origen ON public.tickets(app_origen);

    CREATE TABLE IF NOT EXISTS public.ticket_mensajes (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
      autor_id TEXT,
      autor_username TEXT,
      es_admin BOOLEAN NOT NULL DEFAULT FALSE,
      mensaje TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_mensajes_ticket ON public.ticket_mensajes(ticket_id);

    ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  ensured = true;
}

export async function createTicket({ categoria, mensaje, rutaOrigen, creadoPorId, creadoPorUsername, adjuntos }) {
  await ensureTicketsSchema();
  const { rows } = await dbQuery(
    `
    insert into public.tickets (categoria, mensaje, ruta_origen, creado_por_id, creado_por_username, app_origen, adjuntos)
    values ($1, $2, $3, $4, $5, 'presupuestador', $6::jsonb)
    returning *;
    `,
    [
      categoria,
      mensaje,
      rutaOrigen || null,
      creadoPorId || null,
      creadoPorUsername || null,
      JSON.stringify(Array.isArray(adjuntos) ? adjuntos : []),
    ]
  );
  return rows[0];
}

export async function listMyTickets(userId) {
  await ensureTicketsSchema();
  const { rows } = await dbQuery(
    `select * from public.tickets where creado_por_id = $1 order by created_at desc;`,
    [userId]
  );
  return rows;
}

export async function getTicketForOwner(id, userId) {
  await ensureTicketsSchema();
  const { rows } = await dbQuery(
    `select * from public.tickets where id = $1 and creado_por_id = $2;`,
    [id, userId]
  );
  const ticket = rows[0];
  if (!ticket) return null;
  const mensajes = await dbQuery(
    `select * from public.ticket_mensajes where ticket_id = $1 order by created_at asc;`,
    [id]
  );
  return { ...ticket, mensajes: mensajes.rows };
}

export async function addOwnMessage(ticketId, { autorId, autorUsername, mensaje }) {
  await ensureTicketsSchema();
  const { rows } = await dbQuery(
    `
    insert into public.ticket_mensajes (ticket_id, autor_id, autor_username, es_admin, mensaje)
    values ($1, $2, $3, false, $4)
    returning *;
    `,
    [ticketId, autorId || null, autorUsername || null, mensaje]
  );
  await dbQuery(`update public.tickets set updated_at = now() where id = $1;`, [ticketId]);
  return rows[0];
}
