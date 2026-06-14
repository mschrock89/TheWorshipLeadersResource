export const WEEKEND_ANCHOR_MINISTRY_TYPES = new Set(["weekend", "sunday_am", "weekend_team"]);
export const WEEKEND_SUPPORT_MINISTRY_TYPES = new Set(["production", "video"]);
export const WEEKEND_SCHEDULE_MINISTRY_ALIASES = WEEKEND_ANCHOR_MINISTRY_TYPES;

export interface TeamScheduleRowLike {
  team_id: string;
  schedule_date: string;
  rotation_period?: string | null;
  campus_id?: string | null;
  ministry_type?: string | null;
}

export function isSupportTeamScheduleMinistry(ministryType?: string | null): boolean {
  return ministryType === "production" || ministryType === "video";
}

export function supportScheduleHasWeekendAnchor(
  entry: TeamScheduleRowLike,
  allEntries: TeamScheduleRowLike[],
): boolean {
  if (!isSupportTeamScheduleMinistry(entry.ministry_type)) {
    return true;
  }

  return allEntries.some(
    (other) =>
      other.team_id === entry.team_id &&
      other.schedule_date === entry.schedule_date &&
      (other.rotation_period || "") === (entry.rotation_period || "") &&
      WEEKEND_ANCHOR_MINISTRY_TYPES.has(other.ministry_type || "weekend") &&
      (other.campus_id === entry.campus_id ||
        other.campus_id == null ||
        entry.campus_id == null),
  );
}

export function filterValidSupportTeamScheduleEntries<T extends TeamScheduleRowLike>(
  entries: T[],
): T[] {
  return entries.filter((entry) => supportScheduleHasWeekendAnchor(entry, entries));
}

export function shouldSkipMisalignedSupportScheduleEntry(
  entry: TeamScheduleRowLike,
  allEntries: TeamScheduleRowLike[],
): boolean {
  return (
    isSupportTeamScheduleMinistry(entry.ministry_type) &&
    !supportScheduleHasWeekendAnchor(entry, allEntries)
  );
}

function getServiceDayForDate(dateStr: string): "saturday" | "sunday" | null {
  const dayOfWeek = parseLocalDate(dateStr).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function assignmentMatchesServiceDay(
  serviceDay: string | null | undefined,
  scheduleDate: string,
): boolean {
  if (!serviceDay) return true;

  const normalizedServiceDay = serviceDay.toLowerCase();
  if (normalizedServiceDay === "both" || normalizedServiceDay === "weekend") return true;

  const dateServiceDay = getServiceDayForDate(scheduleDate);
  if (!dateServiceDay) return true;

  return normalizedServiceDay === dateServiceDay;
}

export function assignmentMatchesSupportScheduleMinistry(
  memberMinistryTypes: string[],
  scheduleMinistryType: string,
): boolean {
  if (memberMinistryTypes.length === 0 || !scheduleMinistryType) {
    return true;
  }

  if (memberMinistryTypes.includes(scheduleMinistryType)) {
    return true;
  }

  if (WEEKEND_SCHEDULE_MINISTRY_ALIASES.has(scheduleMinistryType)) {
    return memberMinistryTypes.some((memberMinistry) =>
      WEEKEND_SUPPORT_MINISTRY_TYPES.has(memberMinistry),
    );
  }

  if (WEEKEND_SUPPORT_MINISTRY_TYPES.has(scheduleMinistryType)) {
    return memberMinistryTypes.some((memberMinistry) =>
      WEEKEND_SCHEDULE_MINISTRY_ALIASES.has(memberMinistry),
    );
  }

  return false;
}
