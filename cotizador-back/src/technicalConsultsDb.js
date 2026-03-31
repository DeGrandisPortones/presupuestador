import { dbQuery, getPool } from "./db.js";

let ensured = false;

function isTechnicalUser(user) {
  return !!(user?.is_superuser || user?.is_rev_tecnica);
}

function isRequesterUser(user) {
  return !!(user?.is_vendedor || user?.is_distribuidor);
}

function normalizeStatus(value, fallback = "all") {
  const v = String(value || fallback).trim().toLowerCase();
  if (["all", "open", "pending", "in_progress", "closed"].includes(v)) return v;
  return fallback;
}

function normalizeSubject(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 180);
}

function normalizeMessage(value) {
  return String(value || "").trim();
}

function requesterRoleForUser(user) {
  if (user?.is_distribuidor) return "distribuidor";
  return "vendedor";
}

function ticketStatusLabel(status) {
  const s = String(status || "pending").trim().toLowerCase();
  if (["pending", "in_progress", "closed"].includes(s)) return s;
  return "pending";
}

function toId(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function canAccessTicket(user, ticket) {
  if (!ticket) return false;
  if (isTechnicalUser(user)) return true;
  return Number(ticket.created_by_user_id || 0) === Number(user?.user_id || user?.id || 0);
}

async function withTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function ensureTechnicalConsultTables() {
  if (ensured) return;

  await dbQuery(`
    create table if not exists public.presupuestador_technical_tickets (
      id bigserial primary key,
      created_by_user_id bigint not null references public.presupuestador_users(id),
      assigned_to_user_id bigint null references public.presupuestador_users(id),
      status text not null default 'pending',
      subject text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      closed_at timestamptz null,
      closed_by_user_id bigint null references public.presupuestador_users(id),
      requester_last_read_at timestamptz null,
      technical_last_read_at timestamptz null,
      last_message_at timestamptz null,
      last_message_by_user_id bigint null references public.presupuestador_users(id),
      constraint presupuestador_technical_tickets_status_chk check (status in ('pending', 'in_progress', 'closed'))
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_technical_ticket_messages (
      id bigserial primary key,
      ticket_id bigint not null references public.presupuestador_technical_tickets(id) on delete cascade,
      author_user_id bigint not null references public.presupuestador_users(id),
      author_role text not null,
      message_text text not null,
      message_type text not null default 'message',
      created_at timestamptz not null default now(),
      constraint presupuestador_technical_ticket_messages_type_chk check (message_type in ('message', 'resolution'))
    );
  `);

  await dbQuery(`create index if not exists presupuestador_technical_tickets_created_by_idx on public.presupuestador_technical_tickets(created_by_user_id);`);
  await dbQuery(`create index if not exists presupuestador_technical_tickets_status_idx on public.presupuestador_technical_tickets(status, last_message_at desc nulls last);`);
  await dbQuery(`create index if not exists presupuestador_technical_ticket_messages_ticket_idx on public.presupuestador_technical_ticket_messages(ticket_id, created_at asc, id asc);`);

  ensured = true;
}

function buildListWhere({ user, scope, status, paramOffset = 0 }) {
  const params = [];
  const where = [];
  const nextParam = (value) => {
    params.push(value);
    return params.length + paramOffset;
  };

  if (scope === "technical") {
    if (!isTechnicalUser(user)) throw new Error("No autorizado");
  } else {
    const userId = toId(user?.user_id || user?.id);
    if (!userId) throw new Error("Usuario inválido");
    where.push(`t.created_by_user_id = $${nextParam(userId)}`);
  }

  if (status === "open") {
    where.push(`t.status in ('pending', 'in_progress')`);
  } else if (["pending", "in_progress", "closed"].includes(status)) {
    where.push(`t.status = $${nextParam(status)}`);
  }

  return { whereSql: where.length ? `where ${where.join(" and ")}` : "", params };
}

function listSql({ scope, viewerIdParamPos }) {
  const viewerReadField = scope === "technical" ? "t.technical_last_read_at" : "t.requester_last_read_at";
  return `
    select
      t.id,
      t.created_by_user_id,
      t.assigned_to_user_id,
      t.status,
      t.subject,
      t.created_at,
      t.updated_at,
      t.closed_at,
      t.closed_by_user_id,
      t.requester_last_read_at,
      t.technical_last_read_at,
      t.last_message_at,
      t.last_message_by_user_id,
      coalesce(nullif(creator.full_name, ''), creator.username, concat('#', t.created_by_user_id::text)) as created_by_name,
      creator.username as created_by_username,
      case
        when coalesce(creator.is_distribuidor, false) then 'distribuidor'
        when coalesce(creator.is_vendedor, false) then 'vendedor'
        else 'usuario'
      end as created_by_role,
      coalesce(nullif(assignee.full_name, ''), assignee.username, '') as assigned_to_name,
      coalesce(nullif(closer.full_name, ''), closer.username, '') as closed_by_name,
      (
        select m.message_text
        from public.presupuestador_technical_ticket_messages m
        where m.ticket_id = t.id
        order by m.created_at desc, m.id desc
        limit 1
      ) as last_message_text,
      (
        select m.message_type
        from public.presupuestador_technical_ticket_messages m
        where m.ticket_id = t.id
        order by m.created_at desc, m.id desc
        limit 1
      ) as last_message_type,
      (
        select count(*)::int
        from public.presupuestador_technical_ticket_messages m
        where m.ticket_id = t.id
          and m.author_user_id <> $${viewerIdParamPos}
          and m.created_at > coalesce(${viewerReadField}, to_timestamp(0))
      ) as unread_count,
      exists(
        select 1
        from public.presupuestador_technical_ticket_messages m
        where m.ticket_id = t.id
          and m.author_user_id <> $${viewerIdParamPos}
          and m.created_at > coalesce(${viewerReadField}, to_timestamp(0))
      ) as has_unread
    from public.presupuestador_technical_tickets t
    join public.presupuestador_users creator on creator.id = t.created_by_user_id
    left join public.presupuestador_users assignee on assignee.id = t.assigned_to_user_id
    left join public.presupuestador_users closer on closer.id = t.closed_by_user_id
  `;
}

export async function listTechnicalConsults(user, { scope = "mine", status = "all" } = {}) {
  await ensureTechnicalConsultTables();
  const normalizedScope = scope === "technical" ? "technical" : "mine";
  const normalizedStatus = normalizeStatus(status, normalizedScope === "technical" ? "pending" : "open");
  const viewerId = toId(user?.user_id || user?.id);
  const { whereSql, params } = buildListWhere({ user, scope: normalizedScope, status: normalizedStatus, paramOffset: 1 });
  const allParams = [viewerId, ...params];
  const orderBySql = normalizedScope === "technical" && normalizedStatus === "pending"
    ? "order by t.created_at desc, t.id desc"
    : "order by coalesce(t.last_message_at, t.created_at) desc, t.id desc";

  const q = await dbQuery(
    `${listSql({ scope: normalizedScope, viewerIdParamPos: 1 })}
     ${whereSql}
     ${orderBySql}`,
    allParams
  );

  return q.rows || [];
}

async function getTicketRow(clientOrDb, id) {
  const q = await clientOrDb.query(
    `
      select t.*,
             coalesce(nullif(creator.full_name, ''), creator.username, concat('#', t.created_by_user_id::text)) as created_by_name,
             creator.username as created_by_username,
             case
               when coalesce(creator.is_distribuidor, false) then 'distribuidor'
               when coalesce(creator.is_vendedor, false) then 'vendedor'
               else 'usuario'
             end as created_by_role,
             coalesce(nullif(assignee.full_name, ''), assignee.username, '') as assigned_to_name,
             coalesce(nullif(closer.full_name, ''), closer.username, '') as closed_by_name
        from public.presupuestador_technical_tickets t
        join public.presupuestador_users creator on creator.id = t.created_by_user_id
        left join public.presupuestador_users assignee on assignee.id = t.assigned_to_user_id
        left join public.presupuestador_users closer on closer.id = t.closed_by_user_id
       where t.id = $1
       limit 1
    `,
    [Number(id)]
  );
  return q.rows?.[0] || null;
}

async function getTicketMessages(clientOrDb, ticketId) {
  const q = await clientOrDb.query(
    `
      select
        m.id,
        m.ticket_id,
        m.author_user_id,
        m.author_role,
        m.message_text,
        m.message_type,
        m.created_at,
        coalesce(nullif(u.full_name, ''), u.username, concat('#', m.author_user_id::text)) as author_name,
        u.username as author_username
      from public.presupuestador_technical_ticket_messages m
      join public.presupuestador_users u on u.id = m.author_user_id
      where m.ticket_id = $1
      order by m.created_at asc, m.id asc
    `,
    [Number(ticketId)]
  );
  return q.rows || [];
}


async function getUnreadInfo(clientOrDb, user, ticket) {
  const viewerId = toId(user?.user_id || user?.id);
  const readField = isTechnicalUser(user) ? "technical_last_read_at" : "requester_last_read_at";
  const q = await clientOrDb.query(
    `
      select
        count(*)::int as unread_count,
        exists(
          select 1
          from public.presupuestador_technical_ticket_messages m
          where m.ticket_id = $1
            and m.author_user_id <> $2
            and m.created_at > coalesce($3::timestamptz, to_timestamp(0))
        ) as has_unread
      from public.presupuestador_technical_ticket_messages m
      where m.ticket_id = $1
        and m.author_user_id <> $2
        and m.created_at > coalesce($3::timestamptz, to_timestamp(0))
    `,
    [Number(ticket.id), viewerId, ticket?.[readField] || null]
  );
  return {
    unread_count: Number(q.rows?.[0]?.unread_count || 0),
    has_unread: !!q.rows?.[0]?.has_unread,
  };
}

export async function getTechnicalConsultDetail(user, id) {
  await ensureTechnicalConsultTables();
  const ticket = await getTicketRow({ query: dbQuery }, id);
  if (!ticket) throw new Error("Consulta técnica no encontrada");
  if (!canAccessTicket(user, ticket)) throw new Error("No autorizado");
  const messages = await getTicketMessages({ query: dbQuery }, ticket.id);
  const unreadInfo = await getUnreadInfo({ query: dbQuery }, user, ticket);
  const viewerIsTechnical = isTechnicalUser(user);
  return {
    ...ticket,
    ...unreadInfo,
    status: ticketStatusLabel(ticket.status),
    messages,
    can_reply: ticket.status !== "closed",
    viewer_role: viewerIsTechnical ? "technical" : "requester",
  };
}

export async function createTechnicalConsult(user, { subject, message } = {}) {
  await ensureTechnicalConsultTables();
  if (!isRequesterUser(user)) throw new Error("Solo vendedor o distribuidor puede crear consultas técnicas");

  const cleanSubject = normalizeSubject(subject);
  const cleanMessage = normalizeMessage(message);
  if (!cleanSubject) throw new Error("Falta asunto");
  if (!cleanMessage) throw new Error("Falta mensaje");

  const userId = toId(user?.user_id || user?.id);
  const now = new Date().toISOString();
  const authorRole = requesterRoleForUser(user);

  const ticketId = await withTx(async (client) => {
    const createdTicket = await client.query(
      `
        insert into public.presupuestador_technical_tickets (
          created_by_user_id,
          status,
          subject,
          requester_last_read_at,
          technical_last_read_at,
          last_message_at,
          last_message_by_user_id,
          created_at,
          updated_at
        )
        values ($1, 'pending', $2, $3, null, $3, $1, $3, $3)
        returning id
      `,
      [userId, cleanSubject, now]
    );
    const ticketIdValue = Number(createdTicket.rows?.[0]?.id || 0);
    if (!ticketIdValue) throw new Error("No se pudo crear la consulta técnica");

    await client.query(
      `
        insert into public.presupuestador_technical_ticket_messages (
          ticket_id,
          author_user_id,
          author_role,
          message_text,
          message_type,
          created_at
        )
        values ($1, $2, $3, $4, 'message', $5)
      `,
      [ticketIdValue, userId, authorRole, cleanMessage, now]
    );

    return ticketIdValue;
  });

  return getTechnicalConsultDetail(user, ticketId);
}

export async function addTechnicalConsultMessage(user, id, { message } = {}) {
  await ensureTechnicalConsultTables();
  const cleanMessage = normalizeMessage(message);
  if (!cleanMessage) throw new Error("Falta mensaje");

  const ticketId = Number(id || 0);
  const userId = toId(user?.user_id || user?.id);
  const viewerIsTechnical = isTechnicalUser(user);
  const viewerIsRequester = isRequesterUser(user);
  if (!ticketId) throw new Error("Consulta técnica inválida");

  await withTx(async (client) => {
    const ticket = await getTicketRow(client, ticketId);
    if (!ticket) throw new Error("Consulta técnica no encontrada");
    if (!canAccessTicket(user, ticket)) throw new Error("No autorizado");
    if (!viewerIsTechnical && !viewerIsRequester) throw new Error("No autorizado");
    if (ticket.status === "closed") throw new Error("La consulta está cerrada");

    const now = new Date().toISOString();
    const authorRole = viewerIsTechnical ? "rev_tecnica" : requesterRoleForUser(user);

    await client.query(
      `
        insert into public.presupuestador_technical_ticket_messages (
          ticket_id,
          author_user_id,
          author_role,
          message_text,
          message_type,
          created_at
        )
        values ($1, $2, $3, $4, 'message', $5)
      `,
      [ticketId, userId, authorRole, cleanMessage, now]
    );

    const nextStatus = viewerIsTechnical && ticket.status === "pending" ? "in_progress" : ticket.status;
    const assignedToUserId = viewerIsTechnical ? userId : (ticket.assigned_to_user_id ? Number(ticket.assigned_to_user_id) : null);

    await client.query(
      `
        update public.presupuestador_technical_tickets
           set status = $2,
               assigned_to_user_id = $3,
               updated_at = $4,
               last_message_at = $4,
               last_message_by_user_id = $5,
               requester_last_read_at = case when $6 then requester_last_read_at else $4 end,
               technical_last_read_at = case when $6 then $4 else technical_last_read_at end
         where id = $1
      `,
      [ticketId, nextStatus, assignedToUserId, now, userId, viewerIsTechnical]
    );
  });

  return getTechnicalConsultDetail(user, ticketId);
}

export async function markTechnicalConsultRead(user, id) {
  await ensureTechnicalConsultTables();
  const ticketId = Number(id || 0);
  if (!ticketId) throw new Error("Consulta técnica inválida");

  const ticket = await getTicketRow({ query: dbQuery }, ticketId);
  if (!ticket) throw new Error("Consulta técnica no encontrada");
  if (!canAccessTicket(user, ticket)) throw new Error("No autorizado");

  const field = isTechnicalUser(user) ? "technical_last_read_at" : "requester_last_read_at";
  await dbQuery(
    `update public.presupuestador_technical_tickets set ${field} = now() where id = $1`,
    [ticketId]
  );
  return true;
}

export async function closeTechnicalConsult(user, id, { resolution } = {}) {
  await ensureTechnicalConsultTables();
  if (!isTechnicalUser(user)) throw new Error("Solo Rev. Técnica puede cerrar consultas");
  const cleanResolution = normalizeMessage(resolution);
  if (!cleanResolution) throw new Error("Falta la resolución final");

  const ticketId = Number(id || 0);
  const userId = toId(user?.user_id || user?.id);
  if (!ticketId) throw new Error("Consulta técnica inválida");

  await withTx(async (client) => {
    const ticket = await getTicketRow(client, ticketId);
    if (!ticket) throw new Error("Consulta técnica no encontrada");
    if (!canAccessTicket(user, ticket)) throw new Error("No autorizado");
    if (ticket.status === "closed") throw new Error("La consulta ya está cerrada");

    const now = new Date().toISOString();

    await client.query(
      `
        insert into public.presupuestador_technical_ticket_messages (
          ticket_id,
          author_user_id,
          author_role,
          message_text,
          message_type,
          created_at
        )
        values ($1, $2, 'rev_tecnica', $3, 'resolution', $4)
      `,
      [ticketId, userId, cleanResolution, now]
    );

    await client.query(
      `
        update public.presupuestador_technical_tickets
           set status = 'closed',
               assigned_to_user_id = coalesce(assigned_to_user_id, $2),
               closed_at = $3,
               closed_by_user_id = $2,
               updated_at = $3,
               last_message_at = $3,
               last_message_by_user_id = $2,
               technical_last_read_at = $3
         where id = $1
      `,
      [ticketId, userId, now]
    );
  });

  return getTechnicalConsultDetail(user, ticketId);
}

export async function getTechnicalConsultUnreadSummary(user) {
  await ensureTechnicalConsultTables();
  const userId = toId(user?.user_id || user?.id);
  const isTech = isTechnicalUser(user);

  if (isTech) {
    const q = await dbQuery(
      `
        select
          count(*) filter (where t.status = 'pending')::int as technical_pending_count,
          count(*) filter (
            where exists (
              select 1
              from public.presupuestador_technical_ticket_messages m
              where m.ticket_id = t.id
                and m.author_user_id <> $1
                and m.created_at > coalesce(t.technical_last_read_at, to_timestamp(0))
            )
          )::int as technical_unread_count,
          count(*) filter (where t.status in ('pending', 'in_progress'))::int as technical_open_count
        from public.presupuestador_technical_tickets t
      `,
      [userId]
    );
    return {
      mine_unread_count: 0,
      mine_open_count: 0,
      technical_pending_count: Number(q.rows?.[0]?.technical_pending_count || 0),
      technical_unread_count: Number(q.rows?.[0]?.technical_unread_count || 0),
      technical_open_count: Number(q.rows?.[0]?.technical_open_count || 0),
    };
  }

  const q = await dbQuery(
    `
      select
        count(*) filter (
          where exists (
            select 1
            from public.presupuestador_technical_ticket_messages m
            where m.ticket_id = t.id
              and m.author_user_id <> $1
              and m.created_at > coalesce(t.requester_last_read_at, to_timestamp(0))
          )
        )::int as mine_unread_count,
        count(*) filter (where t.status in ('pending', 'in_progress'))::int as mine_open_count
      from public.presupuestador_technical_tickets t
      where t.created_by_user_id = $1
    `,
    [userId]
  );

  return {
    mine_unread_count: Number(q.rows?.[0]?.mine_unread_count || 0),
    mine_open_count: Number(q.rows?.[0]?.mine_open_count || 0),
    technical_pending_count: 0,
    technical_unread_count: 0,
    technical_open_count: 0,
  };
}
