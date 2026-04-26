const ROTATION_ADVANCE_DAYS = 10;

export interface RotationPeriodLike {
  id: string;
  name: string;
  year: number;
  trimester: number;
  is_active: boolean;
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

export function getEffectiveActiveRotationPeriodId<T extends RotationPeriodLike>(
  periods: T[],
  firstScheduledDateByRotationName: Map<string, string>,
  referenceDate = new Date(),
) {
  if (periods.length === 0) return null;

  const sortedPeriods = [...periods].sort(compareRotationPeriods);
  const configuredActivePeriod =
    sortedPeriods.find((period) => period.is_active) ?? sortedPeriods[sortedPeriods.length - 1] ?? null;

  if (!configuredActivePeriod) return null;

  const configuredActiveIndex = sortedPeriods.findIndex((period) => period.id === configuredActivePeriod.id);
  const nextPeriod = sortedPeriods[configuredActiveIndex + 1] ?? null;

  if (!nextPeriod) {
    return configuredActivePeriod.id;
  }

  const nextPeriodFirstSchedule = firstScheduledDateByRotationName.get(nextPeriod.name);
  if (!nextPeriodFirstSchedule) {
    return configuredActivePeriod.id;
  }

  const thresholdDate = new Date(`${nextPeriodFirstSchedule}T00:00:00`);
  thresholdDate.setDate(thresholdDate.getDate() - ROTATION_ADVANCE_DAYS);

  return referenceDate >= thresholdDate ? nextPeriod.id : configuredActivePeriod.id;
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
