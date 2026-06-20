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

// Production/video teams rotate on their own schedule in Team Builder, independent of
// the weekend worship team for a given date (e.g. video can be Team 1 while weekend
// worship is Team 3). Always honor the support schedule row as authored, rather than
// requiring it to share the weekend worship team for that date.
export function supportScheduleHasWeekendAnchor(
  _entry: TeamScheduleRowLike,
  _allEntries: TeamScheduleRowLike[],
): boolean {
  return true;
}

export function filterValidSupportTeamScheduleEntries<T extends TeamScheduleRowLike>(
  entries: T[],
): T[] {
  return entries;
}

export function shouldSkipMisalignedSupportScheduleEntry(
  _entry: TeamScheduleRowLike,
  _allEntries: TeamScheduleRowLike[],
): boolean {
  return false;
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
