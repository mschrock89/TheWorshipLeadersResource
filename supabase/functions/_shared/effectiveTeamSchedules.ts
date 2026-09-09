export interface TeamScheduleForPrecedence {
  campus_id: string | null;
  ministry_type: string | null;
  time_of_day?: string | null;
  resource_app_key?: string | null;
  created_at?: string | null;
}

export type CampusEffectiveSchedule<T extends TeamScheduleForPrecedence> =
  Omit<T, "campus_id"> & { campus_id: string };

export type RosterPushCampus = {
  id: string;
  is_network_wide?: boolean | null;
  has_saturday_service?: boolean | null;
  has_sunday_service?: boolean | null;
};

/** Calendar weekday for a YYYY-MM-DD service date, independent of runtime TZ. */
function dayOfWeekForDate(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** Whether a campus actually runs a weekend service on the given date. Weekdays are always eligible. */
export function campusHasServiceOnDate(campus: RosterPushCampus, dateStr: string): boolean {
  const dayOfWeek = dayOfWeekForDate(dateStr);
  if (dayOfWeek === 6) return !!campus.has_saturday_service;
  if (dayOfWeek === 0) return !!campus.has_sunday_service;
  return true;
}

/**
 * Campuses whose Calendar roster should receive serving/video reminders for a date.
 * Network Wide is never a service campus; Sat/Sun follow has_*_service flags.
 */
export function campusIdsEligibleForRosterPush(
  campuses: RosterPushCampus[],
  dateStr: string,
): string[] {
  return campuses
    .filter((campus) => Boolean(campus.id) && !campus.is_network_wide && campusHasServiceOnDate(campus, dateStr))
    .map((campus) => campus.id);
}

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
  // Only the campuses the caller asked for. Shared (campus-null) rows expand to
  // those campuses; campus-specific rows still win per campus. Do not union in
  // extra campus ids from the schedule rows — that previously applied Saturday
  // shared teams to Network Wide and Sunday-only campuses.
  const resolvedCampusIds = Array.from(new Set(campusIds.filter(Boolean)));

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
