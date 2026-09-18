import { dbQuery, getPool } from "./db.js";

let ensured = false;

function isTechnicalUser(user) {
  return !!(user?.is_superuser || user?.is_rev_tecnica);
}

function text(value, maxLen = 500) {
  return String(value ?? "").trim().slice(0, maxLen);
}

function toId(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
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

// Igual que withTx, pero ademas toma un advisory lock (a nivel de sesion Postgres,
// nada persistente ni de schema) que serializa cualquier chequeo-y-escritura sobre
// horarios: createMeetSlot (chequeo de margen de 10 min + insert) y
// ensureGeneratedSlotsFromRules (leer huecos existentes + insertar generados) usan
// la misma clave, asi que dos llamadas simultaneas no pueden "verse" ambas el estado
// de antes y terminar violando el margen entre si - una espera a que la otra termine
// y confirme antes de leer. Con un solo tecnico operando esto casi nunca se contiende,
// pero cierra la carrera del todo en vez de solo hacerla improbable.
async function withMeetSchedulingLock(fn) {
  return withTx(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('presupuestador_meet_scheduling'))");
    return fn(client);
  });
}

export async function ensureMeetSchedulingTables() {
  if (ensured) return;

  await dbQuery(`
    create table if not exists public.presupuestador_meet_settings (
      id smallint primary key default 1,
      meet_link text null,
      technician_name text null,
      updated_at timestamptz not null default now(),
      updated_by_user_id bigint null references public.presupuestador_users(id),
      constraint presupuestador_meet_settings_singleton_chk check (id = 1)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_meet_slots (
      id bigserial primary key,
      start_at timestamptz not null,
      duration_minutes int not null default 30,
      status text not null default 'available',
      created_by_user_id bigint null references public.presupuestador_users(id),
      created_at timestamptz not null default now(),
      constraint presupuestador_meet_slots_status_chk check (status in ('available', 'booked', 'cancelled'))
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_meet_bookings (
      id bigserial primary key,
      slot_id bigint not null references public.presupuestador_meet_slots(id),
      client_name text not null,
      client_phone text null,
      client_email text null,
      reference_number text null,
      notes text null,
      created_at timestamptz not null default now(),
      cancelled_at timestamptz null,
      cancelled_by_user_id bigint null references public.presupuestador_users(id)
    );
  `);

  await dbQuery(`
    create table if not exists public.presupuestador_meet_recurring_rules (
      id bigserial primary key,
      weekdays int[] not null,
      start_time time not null,
      end_time time not null,
      slot_duration_minutes int not null default 30,
      active boolean not null default true,
      created_by_user_id bigint null references public.presupuestador_users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await dbQuery(`alter table public.presupuestador_meet_slots add column if not exists source_rule_id bigint null references public.presupuestador_meet_recurring_rules(id) on delete set null;`);

  // Fix: la FK de bookings->slots no tenia "on delete cascade", asi que borrar un
  // horario disponible (sin reserva activa) fallaba si alguna vez tuvo una reserva
  // ya CANCELADA (la fila cancelada queda como historial, pero seguia bloqueando el
  // delete). No toca ninguna fila existente, solo cambia el comportamiento de la
  // constraint - solo puede aplicar a filas ya canceladas, porque una reserva activa
  // ya bloquea el delete del horario por otro lado (status <> 'available').
  await dbQuery(`alter table public.presupuestador_meet_bookings drop constraint if exists presupuestador_meet_bookings_slot_id_fkey;`);
  await dbQuery(`alter table public.presupuestador_meet_bookings add constraint presupuestador_meet_bookings_slot_id_fkey foreign key (slot_id) references public.presupuestador_meet_slots(id) on delete cascade;`);

  await dbQuery(`create index if not exists presupuestador_meet_slots_start_at_idx on public.presupuestador_meet_slots(start_at asc);`);
  await dbQuery(`create index if not exists presupuestador_meet_slots_status_idx on public.presupuestador_meet_slots(status);`);
  await dbQuery(`create index if not exists presupuestador_meet_bookings_slot_idx on public.presupuestador_meet_bookings(slot_id);`);
  await dbQuery(`create index if not exists presupuestador_meet_bookings_created_at_idx on public.presupuestador_meet_bookings(created_at desc);`);

  ensured = true;
}

// --- Horarios recurrentes ---

const RECURRING_HORIZON_DAYS = 30;
const ARGENTINA_UTC_OFFSET = "-03:00";
// Margen obligatorio entre el fin de una reunion y el inicio de la siguiente - se
// aplica tanto a los horarios generados por reglas recurrentes como a los puntuales
// cargados a mano, para que el tecnico siempre tenga un respiro entre reuniones.
const MEETING_GAP_MINUTES = 10;

function slotInterval(row) {
  const start = new Date(row.start_at).getTime();
  return { start, end: start + Number(row.duration_minutes || 0) * 60000 };
}

// Rechaza un horario nuevo si queda a menos de MEETING_GAP_MINUTES de otro horario
// activo (disponible o reservado - los cancelados no cuentan, ya no ocupan la agenda).
async function assertNoMeetingGapConflict(queryable, startAtIso, durationMinutes, { excludeSlotId } = {}) {
  const newStart = new Date(startAtIso).getTime();
  const newEnd = newStart + Number(durationMinutes) * 60000;
  const gapMs = MEETING_GAP_MINUTES * 60000;
  const windowStart = new Date(newStart - 12 * 3600000).toISOString();
  const windowEnd = new Date(newEnd + 12 * 3600000).toISOString();

  const q = await queryable.query(
    `select id, start_at, duration_minutes from public.presupuestador_meet_slots
      where status <> 'cancelled' and start_at >= $1 and start_at <= $2`,
    [windowStart, windowEnd]
  );
  for (const row of q.rows || []) {
    if (excludeSlotId && String(row.id) === String(excludeSlotId)) continue;
    const { start, end } = slotInterval(row);
    if (newStart < end + gapMs && newEnd + gapMs > start) {
      throw new Error(`Ese horario queda a menos de ${MEETING_GAP_MINUTES} minutos de otro horario ya cargado (${new Date(start).toLocaleString("es-AR")}).`);
    }
  }
}

// Devuelve "YYYY-MM-DD" del dia (hoy + daysFromNow) en huso horario Argentina, sin
// depender del huso horario del proceso Node (en produccion puede correr en UTC).
function argentinaDateString(daysFromNow) {
  const instant = new Date(Date.now() + daysFromNow * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
// Ancla a mediodia con el offset fijo de Argentina (sin DST) para no depender del
// huso del proceso; getUTCDay es seguro porque el instante ya quedo fijado.
function argentinaWeekday(ymd) {
  return new Date(`${ymd}T12:00:00${ARGENTINA_UTC_OFFSET}`).getUTCDay();
}
function argentinaInstant(ymd, hh, mm) {
  return new Date(`${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${ARGENTINA_UTC_OFFSET}`);
}
function parseHhMm(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm, totalMinutes: hh * 60 + mm };
}
function normalizeWeekdays(value) {
  const arr = Array.isArray(value) ? value : [];
  return [...new Set(arr.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
}

function validateRuleInput({ weekdays, start_time, end_time, slot_duration_minutes }) {
  const cleanWeekdays = normalizeWeekdays(weekdays);
  if (!cleanWeekdays.length) throw new Error("Elegí al menos un día de la semana");

  const start = parseHhMm(start_time);
  const end = parseHhMm(end_time);
  if (!start || !end) throw new Error("Hora de inicio/fin inválida");
  if (start.totalMinutes >= end.totalMinutes) throw new Error("La hora de inicio debe ser anterior a la hora de fin");

  const duration = Number(slot_duration_minutes || 30);
  const cleanDuration = Number.isFinite(duration) && duration >= 10 && duration <= 240 ? Math.round(duration) : 30;
  if (end.totalMinutes - start.totalMinutes < cleanDuration) {
    throw new Error("El rango horario es más corto que la duración del turno");
  }

  return {
    weekdays: cleanWeekdays,
    start_time: `${String(start.hh).padStart(2, "0")}:${String(start.mm).padStart(2, "0")}`,
    end_time: `${String(end.hh).padStart(2, "0")}:${String(end.mm).padStart(2, "0")}`,
    slot_duration_minutes: cleanDuration,
  };
}

export async function listMeetRecurringRules(user) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const q = await dbQuery(
    `select id, weekdays, start_time, end_time, slot_duration_minutes, active, created_at, updated_at
       from public.presupuestador_meet_recurring_rules
      order by created_at asc`
  );
  return q.rows || [];
}

export async function createMeetRecurringRule(user, input = {}) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const clean = validateRuleInput(input);

  const r = await dbQuery(
    `
      insert into public.presupuestador_meet_recurring_rules (weekdays, start_time, end_time, slot_duration_minutes, active, created_by_user_id)
      values ($1, $2, $3, $4, true, $5)
      returning id, weekdays, start_time, end_time, slot_duration_minutes, active, created_at, updated_at
    `,
    [clean.weekdays, clean.start_time, clean.end_time, clean.slot_duration_minutes, toId(user?.user_id || user?.id) || null]
  );

  await ensureGeneratedSlotsFromRules();
  return r.rows?.[0] || null;
}

export async function updateMeetRecurringRule(user, id, input = {}) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const ruleId = toId(id);
  if (!ruleId) throw new Error("Regla inválida");

  // Si solo se manda "active" (pausar/reactivar), no se re-valida el resto de los campos.
  if (input && typeof input === "object" && Object.keys(input).length === 1 && "active" in input) {
    const r = await dbQuery(
      `update public.presupuestador_meet_recurring_rules set active = $2, updated_at = now() where id = $1
       returning id, weekdays, start_time, end_time, slot_duration_minutes, active, created_at, updated_at`,
      [ruleId, !!input.active]
    );
    if (!r.rows?.length) throw new Error("Regla no encontrada");
    if (input.active) await ensureGeneratedSlotsFromRules();
    return r.rows[0];
  }

  const current = await dbQuery(`select weekdays, start_time, end_time, slot_duration_minutes, active from public.presupuestador_meet_recurring_rules where id = $1`, [ruleId]);
  if (!current.rows?.length) throw new Error("Regla no encontrada");
  const merged = { ...current.rows[0], ...input };
  const clean = validateRuleInput(merged);
  const active = "active" in input ? !!input.active : merged.active;

  const r = await dbQuery(
    `
      update public.presupuestador_meet_recurring_rules
         set weekdays = $2, start_time = $3, end_time = $4, slot_duration_minutes = $5, active = $6, updated_at = now()
       where id = $1
       returning id, weekdays, start_time, end_time, slot_duration_minutes, active, created_at, updated_at
    `,
    [ruleId, clean.weekdays, clean.start_time, clean.end_time, clean.slot_duration_minutes, active]
  );
  if (active) await ensureGeneratedSlotsFromRules();
  return r.rows?.[0] || null;
}

export async function deleteMeetRecurringRule(user, id) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const ruleId = toId(id);
  if (!ruleId) throw new Error("Regla inválida");
  await dbQuery(`delete from public.presupuestador_meet_recurring_rules where id = $1`, [ruleId]);
  return true;
}

// Genera (de forma idempotente) los horarios disponibles que corresponden a las
// reglas recurrentes activas, para los proximos RECURRING_HORIZON_DAYS dias. No toca
// horarios ya generados o cargados a mano - si una regla se edita o se pausa, los
// horarios que ya existian quedan igual. Si el tecnico borra uno puntual (ver
// deleteMeetSlot), esa fecha/hora queda marcada 'cancelled' en vez de eliminarse, y
// esta funcion la sigue contando como "ya existente" - por eso una regla activa NO
// vuelve a generar un horario que el tecnico saco a mano.
export async function ensureGeneratedSlotsFromRules() {
  await ensureMeetSchedulingTables();

  // Chequeo barato sin lock: si no hay ninguna regla activa, no vale la pena pagar el
  // costo (minimo, pero real en cada GET de slots) de tomar el advisory lock.
  const quickCheck = await dbQuery(`select 1 from public.presupuestador_meet_recurring_rules where active = true limit 1`);
  if (!quickCheck.rows?.length) return;

  await withMeetSchedulingLock(async (client) => {
    const rulesQ = await client.query(
      `select id, weekdays, start_time, end_time, slot_duration_minutes
         from public.presupuestador_meet_recurring_rules
        where active = true`
    );
    const rules = rulesQ.rows || [];
    if (!rules.length) return;

    const now = Date.now();
    const horizonEnd = now + RECURRING_HORIZON_DAYS * 86400000;
    const gapMs = MEETING_GAP_MINUTES * 60000;

    const existingQ = await client.query(
      `select start_at, duration_minutes, status from public.presupuestador_meet_slots where start_at >= now() and start_at <= $1`,
      [new Date(horizonEnd).toISOString()]
    );
    const existingRows = existingQ.rows || [];
    // Dedup exacto (incluye canceladas a proposito: una fecha/hora que el tecnico borro
    // a mano no se vuelve a generar, ver deleteMeetSlot). El chequeo de margen de 10
    // minutos, en cambio, solo mira horarios activos - uno cancelado ya no ocupa agenda.
    const existingInstants = new Set(existingRows.map((r) => new Date(r.start_at).getTime()));
    const activeIntervals = existingRows.filter((r) => r.status !== "cancelled").map(slotInterval);

    function conflictsWithGap(start, end) {
      return activeIntervals.some((iv) => start < iv.end + gapMs && end + gapMs > iv.start);
    }

    const toInsert = [];
    for (const rule of rules) {
      const weekdays = new Set((rule.weekdays || []).map(Number));
      const start = parseHhMm(rule.start_time);
      const end = parseHhMm(rule.end_time);
      if (!start || !end) continue;
      const durationMs = Number(rule.slot_duration_minutes || 30) * 60000;
      const stepMs = durationMs + gapMs;

      for (let dayOffset = 0; dayOffset <= RECURRING_HORIZON_DAYS; dayOffset += 1) {
        const ymd = argentinaDateString(dayOffset);
        if (!weekdays.has(argentinaWeekday(ymd))) continue;

        const dayStart = argentinaInstant(ymd, start.hh, start.mm).getTime();
        const dayEnd = argentinaInstant(ymd, end.hh, end.mm).getTime();
        for (let t = dayStart; t + durationMs <= dayEnd; t += stepMs) {
          if (t <= now) continue;
          if (existingInstants.has(t)) continue;
          if (conflictsWithGap(t, t + durationMs)) continue;
          existingInstants.add(t);
          activeIntervals.push({ start: t, end: t + durationMs });
          toInsert.push({ start_at: new Date(t).toISOString(), duration_minutes: rule.slot_duration_minutes, source_rule_id: rule.id });
        }
      }
    }

    if (toInsert.length) {
      // Un solo insert multi-fila en vez de uno por horario - mismo resultado, menos
      // ida y vuelta a la base cuando una regla genera muchos turnos de una vez.
      const values = [];
      const params = [];
      toInsert.forEach((slot, i) => {
        const base = i * 3;
        values.push(`($${base + 1}, $${base + 2}, 'available', $${base + 3})`);
        params.push(slot.start_at, slot.duration_minutes, slot.source_rule_id);
      });
      await client.query(
        `insert into public.presupuestador_meet_slots (start_at, duration_minutes, status, source_rule_id) values ${values.join(", ")}`,
        params
      );
    }
  });
}

export async function getMeetSchedulingSettings() {
  await ensureMeetSchedulingTables();
  const r = await dbQuery(
    `select meet_link, technician_name, updated_at from public.presupuestador_meet_settings where id = 1 limit 1`
  );
  return r.rows?.[0] || { meet_link: null, technician_name: null, updated_at: null };
}

export async function updateMeetSchedulingSettings(user, { meet_link, technician_name } = {}) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");

  const cleanLink = text(meet_link, 300);
  const cleanName = text(technician_name, 150);
  if (cleanLink && !/^https:\/\/meet\.google\.com\//i.test(cleanLink)) {
    throw new Error("El link debe ser una URL de Google Meet (https://meet.google.com/...)");
  }

  await dbQuery(
    `
      insert into public.presupuestador_meet_settings (id, meet_link, technician_name, updated_at, updated_by_user_id)
      values (1, $1, $2, now(), $3)
      on conflict (id) do update set
        meet_link = excluded.meet_link,
        technician_name = excluded.technician_name,
        updated_at = now(),
        updated_by_user_id = excluded.updated_by_user_id
    `,
    [cleanLink || null, cleanName || null, toId(user?.user_id || user?.id) || null]
  );

  return getMeetSchedulingSettings();
}

function bookingSelect() {
  return `
    select id, slot_id, client_name, client_phone, client_email, reference_number, notes, created_at, cancelled_at
    from public.presupuestador_meet_bookings
    where cancelled_at is null
  `;
}

export async function listMeetSlotsForStaff(user, { includePast = false } = {}) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  await ensureGeneratedSlotsFromRules();

  const whereClauses = ["s.status <> 'cancelled'"];
  if (!includePast) whereClauses.push("s.start_at >= now() - interval '1 hour'");

  const q = await dbQuery(
    `
      select
        s.id,
        s.start_at,
        s.duration_minutes,
        s.status,
        s.source_rule_id,
        s.created_at,
        b.id as booking_id,
        b.client_name,
        b.client_phone,
        b.client_email,
        b.reference_number,
        b.notes as booking_notes,
        b.created_at as booked_at
      from public.presupuestador_meet_slots s
      left join (${bookingSelect()}) b on b.slot_id = s.id
      where ${whereClauses.join(" and ")}
      order by s.start_at asc
    `
  );
  return q.rows || [];
}

export async function createMeetSlot(user, { start_at, duration_minutes } = {}) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");

  const startDate = new Date(start_at);
  if (!start_at || Number.isNaN(startDate.getTime())) throw new Error("Fecha/hora inválida");
  if (startDate.getTime() < Date.now() - 60_000) throw new Error("No se puede crear un horario en el pasado");

  const duration = Number(duration_minutes || 30);
  const cleanDuration = Number.isFinite(duration) && duration >= 10 && duration <= 240 ? Math.round(duration) : 30;

  return withMeetSchedulingLock(async (client) => {
    await assertNoMeetingGapConflict(client, startDate.toISOString(), cleanDuration);

    const r = await client.query(
      `
        insert into public.presupuestador_meet_slots (start_at, duration_minutes, status, created_by_user_id)
        values ($1, $2, 'available', $3)
        returning id, start_at, duration_minutes, status, created_at
      `,
      [startDate.toISOString(), cleanDuration, toId(user?.user_id || user?.id) || null]
    );
    return r.rows?.[0] || null;
  });
}

export async function deleteMeetSlot(user, id) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const slotId = toId(id);
  if (!slotId) throw new Error("Horario inválido");

  // "Eliminar" marca el horario como cancelado en vez de borrar la fila (update, no
  // delete): ensureGeneratedSlotsFromRules cuenta esta fecha/hora como "ya existente"
  // (su chequeo de duplicados no filtra por status), asi que si este horario venia de
  // una regla recurrente activa, la regla YA NO lo vuelve a generar. Antes de este
  // cambio se borraba la fila entera y la regla lo recreaba en la siguiente carga.
  const r = await dbQuery(
    `update public.presupuestador_meet_slots set status = 'cancelled' where id = $1 and status = 'available' returning id`,
    [slotId]
  );
  if (!r.rows?.length) throw new Error("El horario no existe o ya está reservado (cancelá la reserva primero)");
  return true;
}

// Cuenta reservas nuevas (no canceladas) creadas despues de "since", para el aviso
// en el header - sin tabla de "leido", el propio front guarda la marca de tiempo
// en localStorage (mismo criterio que el badge de Tickets).
export async function countMeetBookingsSince(user, sinceIso) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const since = sinceIso ? new Date(sinceIso) : null;
  if (!since || Number.isNaN(since.getTime())) return { count: 0 };

  const q = await dbQuery(
    `select count(*)::int as count from public.presupuestador_meet_bookings where cancelled_at is null and created_at > $1`,
    [since.toISOString()]
  );
  return { count: Number(q.rows?.[0]?.count || 0) };
}

export async function cancelMeetBooking(user, bookingId) {
  await ensureMeetSchedulingTables();
  if (!isTechnicalUser(user)) throw new Error("No autorizado");
  const id = toId(bookingId);
  if (!id) throw new Error("Reserva inválida");

  await withTx(async (client) => {
    const b = await client.query(
      `select id, slot_id from public.presupuestador_meet_bookings where id = $1 and cancelled_at is null limit 1`,
      [id]
    );
    const booking = b.rows?.[0];
    if (!booking) throw new Error("Reserva no encontrada o ya cancelada");

    await client.query(
      `update public.presupuestador_meet_bookings set cancelled_at = now(), cancelled_by_user_id = $2 where id = $1`,
      [id, toId(user?.user_id || user?.id) || null]
    );
    await client.query(
      `update public.presupuestador_meet_slots set status = 'available' where id = $1`,
      [booking.slot_id]
    );
  });

  return true;
}

// --- Público (sin auth) ---

export async function listPublicAvailableSlots() {
  await ensureMeetSchedulingTables();
  await ensureGeneratedSlotsFromRules();
  const q = await dbQuery(
    `
      select id, start_at, duration_minutes
      from public.presupuestador_meet_slots
      where status = 'available' and start_at >= now() + interval '15 minutes'
      order by start_at asc
      limit 200
    `
  );
  const settings = await getMeetSchedulingSettings();
  return { slots: q.rows || [], technician_name: settings.technician_name || null };
}

export async function createPublicMeetBooking({ slot_id, client_name, client_phone, client_email, reference_number, notes } = {}) {
  await ensureMeetSchedulingTables();

  const slotId = toId(slot_id);
  const cleanName = text(client_name, 150);
  if (!slotId) throw new Error("Falta seleccionar un horario");
  if (!cleanName) throw new Error("Falta el nombre");

  const cleanPhone = text(client_phone, 60);
  const cleanEmail = text(client_email, 200);
  const cleanReference = text(reference_number, 60);
  const cleanNotes = text(notes, 1000);

  const result = await withTx(async (client) => {
    const s = await client.query(
      `select id, start_at, duration_minutes, status from public.presupuestador_meet_slots where id = $1 for update`,
      [slotId]
    );
    const slot = s.rows?.[0];
    if (!slot) throw new Error("El horario elegido ya no existe");
    if (slot.status !== "available") throw new Error("Ese horario ya fue reservado, elegí otro");
    if (new Date(slot.start_at).getTime() < Date.now()) throw new Error("Ese horario ya pasó, elegí otro");

    await client.query(`update public.presupuestador_meet_slots set status = 'booked' where id = $1`, [slotId]);

    const b = await client.query(
      `
        insert into public.presupuestador_meet_bookings (slot_id, client_name, client_phone, client_email, reference_number, notes)
        values ($1, $2, $3, $4, $5, $6)
        returning id, created_at
      `,
      [slotId, cleanName, cleanPhone || null, cleanEmail || null, cleanReference || null, cleanNotes || null]
    );

    return { booking_id: b.rows?.[0]?.id, slot };
  });

  const settings = await getMeetSchedulingSettings();
  return {
    booking_id: result.booking_id,
    start_at: result.slot.start_at,
    duration_minutes: result.slot.duration_minutes,
    meet_link: settings.meet_link || null,
    technician_name: settings.technician_name || null,
  };
}
