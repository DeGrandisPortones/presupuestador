import { dbQuery, getPool } from "./db.js";
import { getActiveRequesterById, listActiveRequestersByAudience } from "./usersDb.js";

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

const MAX_TICKET_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TICKET_VIDEO_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const VIDEO_TICKET_ATTACHMENT_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const ALLOWED_TICKET_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  ...VIDEO_TICKET_ATTACHMENT_TYPES,
]);

function formatMb(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

// Revalida en el server lo que ya valido el navegador (tipo/tamaño) - no confiar
// solo en el front, alguien podria pegarle directo a la API.
function normalizeAttachment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dataUrl = String(raw.data_url || "").trim();
  if (!dataUrl) return null;
  if (!dataUrl.startsWith("data:")) throw new Error("Adjunto inválido");
  const type = String(raw.type || "").trim().toLowerCase();
  if (!ALLOWED_TICKET_ATTACHMENT_TYPES.has(type)) throw new Error("El adjunto debe ser una imagen, un PDF o un video");
  const size = Number(raw.size || 0) || 0;
  const maxBytes = VIDEO_TICKET_ATTACHMENT_TYPES.has(type) ? MAX_TICKET_VIDEO_ATTACHMENT_BYTES : MAX_TICKET_ATTACHMENT_BYTES;
  if (size > maxBytes) throw new Error(`El archivo excede el tamaño permitido (máximo ${formatMb(maxBytes)})`);
  return {
    name: String(raw.name || "").trim().slice(0, 200) || "archivo",
    type,
    size,
    data_url: dataUrl,
    uploaded_at: raw.uploaded_at || new Date().toISOString(),
  };
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

function normalizeAudience(value) {
  const v = String(value || "target").trim().toLowerCase();
  if (["vendedores", "distribuidores", "todos"].includes(v)) return v;
  return "target";
}

function canAccessTicket(user, ticket) {
  if (!ticket) return false;
  if (isTechnicalUser(user)) return true;
  const uid = Number(user?.user_id || user?.id || 0);
  return Number(ticket.created_by_user_id || 0) === uid || Number(ticket.on_behalf_of_user_id || 0) === uid;
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
      on_behalf_of_user_id bigint null references public.presupuestador_users(id),
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

  await dbQuery(`alter table public.presupuestador_technical_tickets add column if not exists on_behalf_of_user_id bigint null references public.presupuestador_users(id);`);
  await dbQuery(`alter table public.presupuestador_technical_ticket_messages add column if not exists attachment jsonb null;`);

  await dbQuery(`create index if not exists presupuestador_technical_tickets_created_by_idx on public.presupuestador_technical_tickets(created_by_user_id);`);
  await dbQuery(`create index if not exists presupuestador_technical_tickets_on_behalf_of_idx on public.presupuestador_technical_tickets(on_behalf_of_user_id);`);
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
    const uidParam = nextParam(userId);
    where.push(`(t.created_by_user_id = $${uidParam} or t.on_behalf_of_user_id = $${uidParam})`);
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
      t.on_behalf_of_user_id,
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
        when coalesce(creator.is_rev_tecnica, false) or coalesce(creator.is_superuser, false) then 'rev_tecnica'
        else 'usuario'
      end as created_by_role,
      coalesce(nullif(onbehalf.full_name, ''), onbehalf.username, '') as on_behalf_of_name,
      case
        when coalesce(onbehalf.is_distribuidor, false) then 'distribuidor'
        when coalesce(onbehalf.is_vendedor, false) then 'vendedor'
        else null
      end as on_behalf_of_role,
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
    left join public.presupuestador_users onbehalf on onbehalf.id = t.on_behalf_of_user_id
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
               when coalesce(creator.is_rev_tecnica, false) or coalesce(creator.is_superuser, false) then 'rev_tecnica'
               else 'usuario'
             end as created_by_role,
             coalesce(nullif(onbehalf.full_name, ''), onbehalf.username, '') as on_behalf_of_name,
             case
               when coalesce(onbehalf.is_distribuidor, false) then 'distribuidor'
               when coalesce(onbehalf.is_vendedor, false) then 'vendedor'
               else null
             end as on_behalf_of_role,
             coalesce(nullif(assignee.full_name, ''), assignee.username, '') as assigned_to_name,
             coalesce(nullif(closer.full_name, ''), closer.username, '') as closed_by_name
        from public.presupuestador_technical_tickets t
        join public.presupuestador_users creator on creator.id = t.created_by_user_id
        left join public.presupuestador_users onbehalf on onbehalf.id = t.on_behalf_of_user_id
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
        m.attachment,
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

async function insertTechnicalTicket(client, {
  creatorUserId,
  targetUserId,
  assignedToUserId,
  status,
  subject,
  message,
  attachment,
  authorRole,
  requesterLastReadAt,
  technicalLastReadAt,
  now,
}) {
  const createdTicket = await client.query(
    `
      insert into public.presupuestador_technical_tickets (
        created_by_user_id,
        on_behalf_of_user_id,
        assigned_to_user_id,
        status,
        subject,
        requester_last_read_at,
        technical_last_read_at,
        last_message_at,
        last_message_by_user_id,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $1, $8, $8)
      returning id
    `,
    [creatorUserId, targetUserId, assignedToUserId, status, subject, requesterLastReadAt, technicalLastReadAt, now]
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
        attachment,
        created_at
      )
      values ($1, $2, $3, $4, 'message', $5::jsonb, $6)
    `,
    [ticketIdValue, creatorUserId, authorRole, message, attachment ? JSON.stringify(attachment) : null, now]
  );

  return ticketIdValue;
}

export async function createTechnicalConsult(user, { subject, message, target_user_id, target_user_ids, audience, attachment } = {}) {
  await ensureTechnicalConsultTables();
  const staffCreating = isTechnicalUser(user);
  if (!staffCreating && !isRequesterUser(user)) {
    throw new Error("Solo vendedor, distribuidor o Rev. Técnica puede crear consultas técnicas");
  }

  const cleanSubject = normalizeSubject(subject);
  const cleanMessage = normalizeMessage(message);
  if (!cleanSubject) throw new Error("Falta asunto");
  if (!cleanMessage) throw new Error("Falta mensaje");
  const cleanAttachment = normalizeAttachment(attachment);

  const userId = toId(user?.user_id || user?.id);
  const normalizedAudience = staffCreating ? normalizeAudience(audience) : "target";
  // Envio a una seleccion puntual de vendedores/distribuidores (popup con checkboxes),
  // distinto de "audience" (toda la audiencia) y de "target" (uno solo).
  const cleanTargetIds = staffCreating
    ? [...new Set((Array.isArray(target_user_ids) ? target_user_ids : []).map((v) => toId(v)).filter(Boolean))]
    : [];
  const useSelectedTargets = cleanTargetIds.length > 0;
  const useAudienceTargets = !useSelectedTargets && staffCreating && normalizedAudience !== "target";

  if (useSelectedTargets || useAudienceTargets) {
    let targets;
    let resultAudienceLabel;
    if (useSelectedTargets) {
      targets = [];
      for (const id of cleanTargetIds) {
        const target = await getActiveRequesterById(id);
        if (target) targets.push(target);
      }
      if (!targets.length) throw new Error("Los destinatarios seleccionados no están activos");
      resultAudienceLabel = "selected";
    } else {
      targets = await listActiveRequestersByAudience(normalizedAudience);
      if (!targets.length) throw new Error("No hay destinatarios activos para el envío masivo");
      resultAudienceLabel = normalizedAudience;
    }

    const now = new Date().toISOString();
    const ticketIds = await withTx(async (client) => {
      const ids = [];
      for (const target of targets) {
        const id = await insertTechnicalTicket(client, {
          creatorUserId: userId,
          targetUserId: target.id,
          assignedToUserId: userId,
          status: "in_progress",
          subject: cleanSubject,
          message: cleanMessage,
          attachment: cleanAttachment,
          authorRole: "rev_tecnica",
          requesterLastReadAt: null,
          technicalLastReadAt: now,
          now,
        });
        ids.push(id);
      }
      return ids;
    });

    const tickets = [];
    for (const id of ticketIds) {
      tickets.push(await getTechnicalConsultDetail(user, id));
    }
    return { bulk: true, audience: resultAudienceLabel, count: tickets.length, tickets };
  }

  let targetUserId = null;
  if (staffCreating) {
    targetUserId = toId(target_user_id);
    if (!targetUserId) throw new Error("Falta seleccionar vendedor o distribuidor");
    const target = await getActiveRequesterById(targetUserId);
    if (!target) throw new Error("Vendedor o distribuidor no encontrado o inactivo");
  }

  const now = new Date().toISOString();
  const authorRole = staffCreating ? "rev_tecnica" : requesterRoleForUser(user);
  const initialStatus = staffCreating ? "in_progress" : "pending";
  const requesterLastReadAt = staffCreating ? null : now;
  const technicalLastReadAt = staffCreating ? now : null;
  const assignedToUserId = staffCreating ? userId : null;

  const ticketId = await withTx((client) =>
    insertTechnicalTicket(client, {
      creatorUserId: userId,
      targetUserId,
      assignedToUserId,
      status: initialStatus,
      subject: cleanSubject,
      message: cleanMessage,
      attachment: cleanAttachment,
      authorRole,
      requesterLastReadAt,
      technicalLastReadAt,
      now,
    })
  );

  return getTechnicalConsultDetail(user, ticketId);
}

export async function addTechnicalConsultMessage(user, id, { message, attachment } = {}) {
  await ensureTechnicalConsultTables();
  const cleanMessage = normalizeMessage(message);
  if (!cleanMessage) throw new Error("Falta mensaje");
  const cleanAttachment = normalizeAttachment(attachment);

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
          attachment,
          created_at
        )
        values ($1, $2, $3, $4, 'message', $5::jsonb, $6)
      `,
      [ticketId, userId, authorRole, cleanMessage, cleanAttachment ? JSON.stringify(cleanAttachment) : null, now]
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

export async function closeTechnicalConsult(user, id, { resolution, attachment } = {}) {
  await ensureTechnicalConsultTables();
  if (!isTechnicalUser(user)) throw new Error("Solo Rev. Técnica puede cerrar consultas");
  const cleanResolution = normalizeMessage(resolution);
  if (!cleanResolution) throw new Error("Falta la resolución final");
  const cleanAttachment = normalizeAttachment(attachment);

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
          attachment,
          created_at
        )
        values ($1, $2, 'rev_tecnica', $3, 'resolution', $4::jsonb, $5)
      `,
      [ticketId, userId, cleanResolution, cleanAttachment ? JSON.stringify(cleanAttachment) : null, now]
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
      where t.created_by_user_id = $1 or t.on_behalf_of_user_id = $1
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
