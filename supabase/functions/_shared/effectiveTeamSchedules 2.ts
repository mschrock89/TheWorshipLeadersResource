export interface TeamScheduleForPrecedence {
  campus_id: string | null;
  ministry_type: string | null;
  time_of_day?: string | null;
  resource_app_key?: string | null;
  created_at?: string | null;
}

export type CampusEffectiveSchedule<T extends TeamScheduleForPrecedence> =
  Omit<T, "campus_id"> & { campus_id: string };

function schedulePrecedenceKey(schedule: TeamScheduleForPrecedence): string {
  return [
    schedule.ministry_type || "default",
    schedule.time_of_day || "all",
    schedule.resource_app_key || "worship",
  ].join("|");
}

function createdAtTimestamp(schedule: TeamScheduleForPrecedence): number {
  const timestamp = new Date(schedule.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Expands shared (campus-null) schedule rows per campus, then applies the same
 * precedence used by Team Builder: a campus-specific row wins over a shared row
 * for the same ministry/time/app, and the newest row wins at equal scope.
 */
export function resolveEffectiveTeamSchedulesForCampuses<T extends TeamScheduleForPrecedence>(
  schedules: T[],
  campusIds: string[],
): Array<CampusEffectiveSchedule<T>> {
  const resolvedCampusIds = Array.from(
    new Set([
      ...campusIds.filter(Boolean),
      ...schedules.map((schedule) => schedule.campus_id).filter((id): id is string => Boolean(id)),
    ]),
  );

  const effectiveSchedules: Array<CampusEffectiveSchedule<T>> = [];

  for (const campusId of resolvedCampusIds) {
    const effectiveByKey = new Map<string, T>();
    const candidates = schedules
      .filter((schedule) => schedule.campus_id === null || schedule.campus_id === campusId)
      .sort((a, b) => createdAtTimestamp(a) - createdAtTimestamp(b));

    for (const candidate of candidates) {
      const key = schedulePrecedenceKey(candidate);
      const existing = effectiveByKey.get(key);
      if (!existing) {
        effectiveByKey.set(key, candidate);
        continue;
      }

      const candidateIsCampusSpecific = candidate.campus_id === campusId;
      const existingIsCampusSpecific = existing.campus_id === campusId;
      if (
        (candidateIsCampusSpecific && !existingIsCampusSpecific) ||
        (
          candidateIsCampusSpecific === existingIsCampusSpecific &&
          createdAtTimestamp(candidate) > createdAtTimestamp(existing)
        )
      ) {
        effectiveByKey.set(key, candidate);
      }
    }

    for (const schedule of effectiveByKey.values()) {
      effectiveSchedules.push({ ...schedule, campus_id: campusId });
    }
  }

  return effectiveSchedules;
}
