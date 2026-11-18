const ROTATION_ADVANCE_DAYS = 10;

export interface RotationPeriodLike {
  id: string;
  name: string;
  year: number;
  trimester: number;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface TeamSchedulePeriodLike {
  rotation_period: string | null;
  schedule_date: string;
}

export function compareRotationPeriods(
  a: Pick<RotationPeriodLike, "year" | "trimester">,
  b: Pick<RotationPeriodLike, "year" | "trimester">,
) {
  if (a.year !== b.year) {
    return a.year - b.year;
  }

  return a.trimester - b.trimester;
}

export function buildFirstScheduledDateByRotationName(
  scheduleRows: TeamSchedulePeriodLike[],
) {
  const firstScheduledDateByRotationName = new Map<string, string>();

  for (const row of scheduleRows) {
    if (!row.rotation_period) continue;

    const existing = firstScheduledDateByRotationName.get(row.rotation_period);
    if (!existing || row.schedule_date < existing) {
      firstScheduledDateByRotationName.set(row.rotation_period, row.schedule_date);
    }
  }

  return firstScheduledDateByRotationName;
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysToDateString(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function periodCoversDate(period: RotationPeriodLike, dateStr: string) {
  if (!period.start_date || !period.end_date) return false;
  return period.start_date <= dateStr && dateStr <= period.end_date;
}

function getPeriodAdvanceDate(
  period: RotationPeriodLike,
  firstScheduledDateByRotationName: Map<string, string>,
) {
  const firstSchedule = firstScheduledDateByRotationName.get(period.name) ?? null;
  const startDate = period.start_date ?? null;

  if (firstSchedule && startDate) {
    return firstSchedule < startDate ? firstSchedule : startDate;
  }

  return firstSchedule ?? startDate;
}

export function getEffectiveActiveRotationPeriodId<T extends RotationPeriodLike>(
  periods: T[],
  firstScheduledDateByRotationName: Map<string, string>,
  referenceDate = new Date(),
) {
  if (periods.length === 0) return null;

  const sortedPeriods = [...periods].sort(compareRotationPeriods);
  const referenceDateStr = formatLocalDate(referenceDate);
  const coveringPeriods = sortedPeriods.filter((period) => periodCoversDate(period, referenceDateStr));
  const configuredActivePeriod =
    coveringPeriods[coveringPeriods.length - 1] ??
    sortedPeriods.find((period) => period.is_active) ??
    sortedPeriods[sortedPeriods.length - 1] ??
    null;

  if (!configuredActivePeriod) return null;

  const configuredActiveIndex = sortedPeriods.findIndex((period) => period.id === configuredActivePeriod.id);
  const nextPeriod = sortedPeriods[configuredActiveIndex + 1] ?? null;

  if (!nextPeriod) {
    return configuredActivePeriod.id;
  }

  const nextPeriodStart = getPeriodAdvanceDate(nextPeriod, firstScheduledDateByRotationName);
  if (!nextPeriodStart) {
    return configuredActivePeriod.id;
  }

  const thresholdDate = addDaysToDateString(nextPeriodStart, -ROTATION_ADVANCE_DAYS);

  return referenceDateStr >= thresholdDate ? nextPeriod.id : configuredActivePeriod.id;
}

export function applyEffectiveActiveRotationPeriods<T extends RotationPeriodLike>(
  periods: T[],
  firstScheduledDateByRotationName: Map<string, string>,
  referenceDate = new Date(),
) {
  const effectiveActiveId = getEffectiveActiveRotationPeriodId(
    periods,
    firstScheduledDateByRotationName,
    referenceDate,
  );

  if (!effectiveActiveId) return periods;

  return periods.map((period) => ({
    ...period,
    is_active: period.id === effectiveActiveId,
  }));
}

/**
 * The trimester that contains the service date, for any campus.
 * A stale is_active flag is only used when the date sits outside every period.
 */
export function rotationPeriodNameForDate(
  periods: RotationPeriodLike[],
  dateStr: string,
): string | null {
  const covering = periods.filter((period) => periodCoversDate(period, dateStr));
  if (covering.length > 0) {
    const sorted = [...covering].sort(compareRotationPeriods);
    const latest = sorted[sorted.length - 1];
    return latest?.name ?? null;
  }

  return periods.find((period) => period.is_active)?.name ?? null;
}

export interface ScheduleRotationEntry {
  schedule_date?: string | null;
  rotation_period?: string | null;
  ministry_type?: string | null;
  time_of_day?: string | null;
}

function scheduleRotationSlotKey(entry: ScheduleRotationEntry) {
  return `${entry.ministry_type ?? "default"}:${entry.time_of_day ?? "all"}`;
}

/**
 * Keep the row from the trimester that contains each date. Another trimester's
 * copy of the same ministry is dropped. A ministry the covering trimester never
 * scheduled is left alone.
 */
export function filterScheduleEntriesToDateRotation<T extends ScheduleRotationEntry>(
  entries: T[],
  periods: RotationPeriodLike[],
): T[] {
  if (periods.length === 0 || entries.length === 0) return entries;

  const byDate = new Map<string, T[]>();
  for (const entry of entries) {
    const date = entry.schedule_date ?? "";
    const group = byDate.get(date);
    if (group) group.push(entry);
    else byDate.set(date, [entry]);
  }

  return entries.filter((entry) => {
    const siblings = byDate.get(entry.schedule_date ?? "") ?? [];
    const periodName = rotationPeriodNameForDate(periods, entry.schedule_date ?? "");
    if (!periodName) return true;

    const slotKey = scheduleRotationSlotKey(entry);
    const coveringHasSlot = siblings.some(
      (sibling) =>
        sibling.rotation_period === periodName && scheduleRotationSlotKey(sibling) === slotKey,
    );
    if (!coveringHasSlot) return true;
    return entry.rotation_period === periodName;
  });
}
