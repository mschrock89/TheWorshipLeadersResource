export const WEEKEND_ANCHOR_MINISTRY_TYPES = new Set(["weekend", "sunday_am", "weekend_team"]);
export const WEEKEND_SUPPORT_MINISTRY_TYPES = new Set(["production", "video"]);
export const WEEKEND_INDEPENDENT_MINISTRY_TYPES = new Set(["production", "video", "speaker"]);

export interface TeamScheduleRowLike {
  team_id: string;
  schedule_date: string;
  rotation_period?: string | null;
  campus_id?: string | null;
  ministry_type?: string | null;
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

/**
 * Null / both / weekend means the assignment covers the whole weekend.
 * Calendar roster uses this; Team Builder split cards must match.
 */
export function assignmentBelongsOnServiceDay(
  serviceDay: string | null | undefined,
  targetServiceDay: "saturday" | "sunday",
): boolean {
  if (!serviceDay) return true;

  const normalizedServiceDay = serviceDay.toLowerCase();
  if (normalizedServiceDay === "both" || normalizedServiceDay === "weekend") {
    return true;
  }

  return normalizedServiceDay === targetServiceDay;
}

export function assignmentMatchesServiceDay(
  serviceDay: string | null | undefined,
  scheduleDate: string,
): boolean {
  const dateServiceDay = getServiceDayForDate(scheduleDate);
  if (!dateServiceDay) return true;

  return assignmentBelongsOnServiceDay(serviceDay, dateServiceDay);
}

const SPEAKER_POSITION_TOKENS = new Set([
  "teacher",
  "announcement",
  "announcements",
  "closing_prayer",
  "closer",
]);

export function isSpeakerAssignmentPosition(
  position?: string | null,
  positionSlot?: string | null,
): boolean {
  return [positionSlot, position].some((value) =>
    SPEAKER_POSITION_TOKENS.has((value || "").trim().toLowerCase()),
  );
}

/**
 * Teacher / Announcement / Closer slots belong to Speakers even when the row
 * still carries leftover weekend tags from before the ministry split.
 */
export function inferAssignmentMinistryTypes(
  ministryTypes: string[] | null | undefined,
  position?: string | null,
  positionSlot?: string | null,
): string[] {
  if (isSpeakerAssignmentPosition(position, positionSlot)) {
    return ["speaker"];
  }
  if (Array.isArray(ministryTypes) && ministryTypes.length > 0) {
    return ministryTypes;
  }
  return [];
}

/** Persist/display default: speaker slots are Speakers, everything else falls back to Weekend. */
export function defaultMinistryTypesForAssignment(
  ministryTypes: string[] | null | undefined,
  position?: string | null,
  positionSlot?: string | null,
): string[] {
  if (isSpeakerAssignmentPosition(position, positionSlot)) {
    return ["speaker"];
  }
  if (Array.isArray(ministryTypes) && ministryTypes.length > 0) {
    return ministryTypes;
  }
  return ["weekend"];
}

// Group the interchangeable weekend worship aliases, but keep video/production/speaker
// distinct: those ministries rotate on their own Team Builder schedule, so a speaker
// is only "scheduled" on speaker rows, never leftover weekend worship dates.
const normalizeScheduleMinistryGroup = (ministryType: string) =>
  WEEKEND_ANCHOR_MINISTRY_TYPES.has(ministryType) ? "weekend" : ministryType;

export function assignmentMatchesSupportScheduleMinistry(
  memberMinistryTypes: string[],
  scheduleMinistryType: string,
): boolean {
  if (!scheduleMinistryType) {
    return memberMinistryTypes.length === 0;
  }

  const normalizedSchedule = normalizeScheduleMinistryGroup(scheduleMinistryType);
  const normalizedMemberMinistries = memberMinistryTypes.map(normalizeScheduleMinistryGroup);

  if (WEEKEND_INDEPENDENT_MINISTRY_TYPES.has(normalizedSchedule)) {
    return normalizedMemberMinistries.includes(normalizedSchedule);
  }

  if (normalizedMemberMinistries.length === 0) {
    return true;
  }

  // Speaker-only (or production/video-only) people must not inherit leftover
  // weekend worship dates just because they sit on the same Team 1/2/3/4.
  if (normalizedMemberMinistries.every((ministry) => WEEKEND_INDEPENDENT_MINISTRY_TYPES.has(ministry))) {
    return normalizedMemberMinistries.includes(normalizedSchedule);
  }

  return normalizedMemberMinistries.includes(normalizedSchedule);
}
