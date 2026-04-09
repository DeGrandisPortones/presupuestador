import { getPool } from "./db.js";
import { getProductionPlanningSettings } from "./settingsDb.js";
import {
  addDaysUtc,
  buildPlanningLabel,
  buildWeeksText,
  diffWeeksFromDate,
  formatDateAr,
  formatDateIso,
  getPlanningYear,
  startOfWeekMonday,
  toUtcDate,
} from "./productionPlanningUtils.js";

const ADVISORY_LOCK_KEY = 3202601;

function text(value) {
  return String(value || "").trim();
}

function canUserReadQuote(user, quote) {
  if (!user || !quote) return false;
  const isOwner = String(quote.created_by_user_id || "") === String(user.user_id || "");
  const canCommercial = !!user.is_enc_comercial && quote.created_by_role === "vendedor";
  const canTechnical = !!user.is_rev_tecnica;
  const canMedidor = !!user.is_medidor;
  const canSuperuser = !!user.is_superuser;
  return isOwner || canCommercial || canTechnical || canMedidor || canSuperuser;
}

function pickAnchorDateForQuote(quote) {
  if (!quote) return toUtcDate();
  if (text(quote.fulfillment_mode) === "acopio" && quote.acopio_to_produccion_requested_at) {
    return toUtcDate(quote.acopio_to_produccion_requested_at);
  }
  if (quote.confirmed_at) return toUtcDate(quote.confirmed_at);
  if (quote.created_at) return toUtcDate(quote.created_at);
  return toUtcDate();
}

function isOriginalProductionQuote(quote) {
  return quote && text(quote.quote_kind || "original") === "original" && text(quote.fulfillment_mode) === "produccion";
}

function isAlreadyCommitted(quote) {
  return Number(quote?.production_delivery_year || 0) > 0 && Number(quote?.production_delivery_week || 0) > 0 && !!quote?.production_delivery_week_start;
}

function buildDisplay({ year, weekNumber, startDate, endDate, weeksOut, committed, capacity, committedCount }) {
  const safeWeeksOut = Number.isFinite(Number(weeksOut)) ? Number(weeksOut) : null;
  return {
    year: Number(year),
    week_number: Number(weekNumber),
    start_date: formatDateIso(startDate),
    end_date: formatDateIso(endDate),
    start_date_label: formatDateAr(startDate),
    end_date_label: formatDateAr(endDate),
    weeks_out: safeWeeksOut,
    weeks_text: safeWeeksOut === null ? "" : buildWeeksText(safeWeeksOut),
    label: buildPlanningLabel(weekNumber, startDate, endDate),
    summary: safeWeeksOut === null
      ? buildPlanningLabel(weekNumber, startDate, endDate)
      : `Entrega estimada: en ${buildWeeksText(safeWeeksOut)} · ${buildPlanningLabel(weekNumber, startDate, endDate)}`,
    committed: committed === true,
    capacity: Number(capacity || 0),
    committed_count: Number(committedCount || 0),
  };
}

async function fetchQuote(client, quoteId) {
  const r = await client.query(`select * from public.presupuestador_quotes where id=$1 limit 1`, [quoteId]);
  return r.rows?.[0] || null;
}

async function fetchCommittedCounts(client, years) {
  const normalizedYears = Array.from(new Set((Array.isArray(years) ? years : []).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)));
  if (!normalizedYears.length) return new Map();
  const r = await client.query(
    `select production_delivery_year, production_delivery_week, count(*)::int as qty
       from public.presupuestador_quotes
      where quote_kind='original'
        and production_delivery_year = any($1::int[])
        and production_delivery_week is not null
      group by production_delivery_year, production_delivery_week`,
    [normalizedYears],
  );
  const out = new Map();
  for (const row of r.rows || []) {
    out.set(`${row.production_delivery_year}-${row.production_delivery_week}`, Number(row.qty || 0));
  }
  return out;
}

async function computeEstimateWithClient(client, { quote = null, fromDate = null } = {}) {
  const anchorDate = fromDate ? toUtcDate(fromDate) : pickAnchorDateForQuote(quote);
  if (quote && isAlreadyCommitted(quote)) {
    const startDate = toUtcDate(quote.production_delivery_week_start);
    const endDate = toUtcDate(quote.production_delivery_week_end || addDaysUtc(startDate, 6));
    return buildDisplay({
      year: quote.production_delivery_year,
      weekNumber: quote.production_delivery_week,
      startDate,
      endDate,
      weeksOut: Number(quote.production_delivery_weeks_out || diffWeeksFromDate(anchorDate, startDate)),
      committed: true,
      capacity: Number(quote.production_delivery_capacity || 0),
      committedCount: Number(quote.production_delivery_committed_count || 0),
    });
  }

  const firstCandidateStart = addDaysUtc(startOfWeekMonday(anchorDate), 7);
  const candidateYears = [
    firstCandidateStart.getUTCFullYear(),
    firstCandidateStart.getUTCFullYear() + 1,
    firstCandidateStart.getUTCFullYear() + 2,
  ];
  const settings = await getProductionPlanningSettings();
  const counts = await fetchCommittedCounts(client, candidateYears);

  for (const year of candidateYears) {
    const planningYear = getPlanningYear(settings, year);
    for (const week of planningYear.weeks || []) {
      const startDate = toUtcDate(week.start_date);
      if (startDate.getTime() < firstCandidateStart.getTime()) continue;
      const capacity = Number(week.capacity || 0);
      if (capacity <= 0) continue;
      const committedCount = Number(counts.get(`${year}-${week.week_number}`) || 0);
      if (committedCount >= capacity) continue;
      return buildDisplay({
        year,
        weekNumber: week.week_number,
        startDate,
        endDate: toUtcDate(week.end_date),
        weeksOut: diffWeeksFromDate(anchorDate, startDate),
        committed: false,
        capacity,
        committedCount,
      });
    }
  }

  return null;
}

export async function getQuoteProductionPlanning(quote) {
  if (!quote || !isOriginalProductionQuote(quote)) return null;
  const client = await getPool().connect();
  try {
    return await computeEstimateWithClient(client, { quote });
  } finally {
    client.release();
  }
}

export async function getProductionPlanningEstimate({ quoteId = null, fromDate = null } = {}) {
  const client = await getPool().connect();
  try {
    let quote = null;
    if (quoteId) quote = await fetchQuote(client, quoteId);
    if (quote && !isOriginalProductionQuote(quote) && !isAlreadyCommitted(quote)) return null;
    return await computeEstimateWithClient(client, { quote, fromDate });
  } finally {
    client.release();
  }
}

export async function getProductionPlanningWithUsage(yearInput) {
  const year = Number(yearInput || 0) || new Date().getUTCFullYear();
  const client = await getPool().connect();
  try {
    const planningYear = getPlanningYear(await getProductionPlanningSettings(), year);
    const counts = await fetchCommittedCounts(client, [year]);
    return {
      ...planningYear,
      weeks: (planningYear.weeks || []).map((week) => {
        const capacity = Number(week.capacity || 0);
        const committedCount = Number(counts.get(`${year}-${week.week_number}`) || 0);
        return {
          ...week,
          committed_count: committedCount,
          available: Math.max(0, capacity - committedCount),
        };
      }),
    };
  } finally {
    client.release();
  }
}

export async function attachQuoteProductionPlanning(quote) {
  if (!quote) return quote;
  const planning = await getQuoteProductionPlanning(quote);
  return { ...quote, production_planning: planning };
}

export async function commitQuoteProductionWeek(quoteId) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    const quote = await fetchQuote(client, quoteId);
    if (!quote || !isOriginalProductionQuote(quote)) {
      await client.query("commit");
      return null;
    }
    if (isAlreadyCommitted(quote)) {
      await client.query("commit");
      return await computeEstimateWithClient(client, { quote });
    }
    const estimate = await computeEstimateWithClient(client, { quote });
    if (!estimate) {
      await client.query("rollback");
      throw new Error("No hay semanas de producción configuradas con capacidad disponible.");
    }
    const upd = await client.query(
      `update public.presupuestador_quotes
          set production_delivery_year=$2,
              production_delivery_week=$3,
              production_delivery_week_start=$4,
              production_delivery_week_end=$5,
              production_delivery_weeks_out=$6,
              production_delivery_capacity=$7,
              production_delivery_committed_count=$8,
              production_delivery_committed_at=now()
        where id=$1
          and production_delivery_week is null
        returning *`,
      [
        quoteId,
        Number(estimate.year),
        Number(estimate.week_number),
        estimate.start_date,
        estimate.end_date,
        Number(estimate.weeks_out || 0),
        Number(estimate.capacity || 0),
        Number(estimate.committed_count || 0) + 1,
      ],
    );
    const committedQuote = upd.rows?.[0] || (await fetchQuote(client, quoteId));
    await client.query("commit");
    return await computeEstimateWithClient(client, { quote: committedQuote });
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getQuoteForProductionPlanning(quoteId, user) {
  const client = await getPool().connect();
  try {
    const quote = await fetchQuote(client, quoteId);
    if (!quote) return null;
    if (!canUserReadQuote(user, quote)) throw new Error("No autorizado");
    return quote;
  } finally {
    client.release();
  }
}
