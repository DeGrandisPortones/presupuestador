function toInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  const n = toInt(value, fallback);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function toUtcDate(value = null) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value || "").trim();
  if (!raw) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function addDaysUtc(date, days) {
  const d = toUtcDate(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

export function formatDateIso(date) {
  return toUtcDate(date).toISOString().slice(0, 10);
}

export function formatDateAr(value) {
  const date = toUtcDate(value);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export function startOfWeekMonday(date) {
  const d = toUtcDate(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysUtc(d, diff);
}

export function endOfWeekMonday(date) {
  return addDaysUtc(startOfWeekMonday(date), 6);
}

export function diffWeeksFromDate(anchorDate, targetWeekStart) {
  const anchorWeek = startOfWeekMonday(anchorDate);
  const target = startOfWeekMonday(targetWeekStart);
  return Math.round((target.getTime() - anchorWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function buildWeeksForYear(yearInput) {
  const year = toInt(yearInput, new Date().getUTCFullYear());
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));
  let cursor = startOfWeekMonday(jan1);
  const out = [];
  let weekNumber = 1;
  while (cursor.getTime() <= dec31.getTime()) {
    const start = cursor;
    const end = addDaysUtc(start, 6);
    out.push({
      week_number: weekNumber,
      start_date: formatDateIso(start),
      end_date: formatDateIso(end),
      label: `Semana ${weekNumber} (${formatDateAr(start)} al ${formatDateAr(end)})`,
    });
    cursor = addDaysUtc(cursor, 7);
    weekNumber += 1;
  }
  return out;
}

export function normalizePlanningWeeks(yearInput, rawWeeks) {
  const year = toInt(yearInput, new Date().getUTCFullYear());
  const baseWeeks = buildWeeksForYear(year);
  const capacities = new Map();
  const comments = new Map();
  if (Array.isArray(rawWeeks)) {
    for (const item of rawWeeks) {
      const weekNumber = toInt(item?.week_number, null);
      if (!weekNumber) continue;
      capacities.set(weekNumber, toNonNegativeInt(item?.capacity, 0));
      comments.set(weekNumber, String(item?.comment ?? item?.comment_text ?? item?.notes ?? "").trim());
    }
  } else if (rawWeeks && typeof rawWeeks === "object") {
    for (const [key, value] of Object.entries(rawWeeks)) {
      const weekNumber = toInt(key, null);
      if (!weekNumber) continue;
      capacities.set(weekNumber, toNonNegativeInt(value?.capacity ?? value, 0));
      comments.set(weekNumber, String(value?.comment ?? value?.comment_text ?? value?.notes ?? "").trim());
    }
  }
  return baseWeeks.map((week) => ({
    ...week,
    capacity: capacities.has(week.week_number) ? capacities.get(week.week_number) : 0,
    comment: comments.has(week.week_number) ? comments.get(week.week_number) : "",
  }));
}

export function normalizeProductionPlanningSettings(raw = {}) {
  const sourceYears = raw && typeof raw === "object" && raw.years && typeof raw.years === "object" ? raw.years : {};
  const years = {};
  for (const [key, value] of Object.entries(sourceYears)) {
    const year = toInt(key, null);
    if (!year || year < 2000 || year > 2100) continue;
    years[String(year)] = {
      year,
      weeks: normalizePlanningWeeks(year, value?.weeks || {}),
      updated_at: value?.updated_at || null,
    };
  }
  return { years };
}

export function getPlanningYear(settings, yearInput) {
  const year = toInt(yearInput, new Date().getUTCFullYear());
  const normalized = normalizeProductionPlanningSettings(settings || {});
  const existing = normalized.years?.[String(year)];
  if (existing) return existing;
  return {
    year,
    weeks: normalizePlanningWeeks(year, []),
    updated_at: null,
  };
}

export function buildPlanningLabel(weekNumber, startDate, endDate) {
  return `Semana ${weekNumber} (${formatDateAr(startDate)} al ${formatDateAr(endDate)})`;
}

export function buildWeeksText(weeksOut) {
  const value = toInt(weeksOut, 0);
  if (value <= 0) return "esta semana";
  if (value === 1) return "1 semana";
  return `${value} semanas`;
}
