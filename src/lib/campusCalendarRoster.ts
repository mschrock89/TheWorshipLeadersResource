import { isNetworkWideMinistryType, normalizeSessionSetMinistryType } from "./constants.ts";
import {
  isBlankTeamBuilderAssignment,
  isBlankTeamBuilderMemberName,
} from "./teamBuilderBlankSlot.ts";

export interface CampusRosterPeriod {
  id: string;
  name: string;
}

export interface CampusRosterAssignment {
  rotationPeriodId: string | null;
  teamId: string;
  teamName?: string | null;
  userId?: string | null;
  memberName?: string | null;
  /** Set for a one-date fill-in. Standing Team Builder members omit this. */
  scheduleDate?: string | null;
}

export interface CampusRosterHide {
  rotationPeriodId: string;
  teamId: string;
}

export interface CampusCalendarRosterGate {
  periodNames: ReadonlySet<string>;
  staffedTeamIdsByPeriod: ReadonlyMap<string, ReadonlySet<string>>;
  staffedTeamNamesByPeriod: ReadonlyMap<string, ReadonlySet<string>>;
  staffedTeamIdsByDate: ReadonlyMap<string, ReadonlySet<string>>;
  staffedTeamNamesByDate: ReadonlyMap<string, ReadonlySet<string>>;
  hiddenTeamIdsByPeriod: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface CalendarScheduleEntryLike {
  team_id?: string | null;
  schedule_date?: string | null;
  rotation_period?: string | null;
  ministry_type?: string | null;
  campus_id?: string | null;
  created_at?: string | null;
  worship_teams?: { name?: string | null } | null;
}

const WEEKEND_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

/** Weekend worship, production, and speakers share one Sat/Sun bucket. Video and MS Weekend do not. */
export function ministrySharesWeekendTeam(ministryType: string | null | undefined) {
  return !!ministryType && ministryType !== "video" && ministryType !== "eon_weekend";
}

export function weekendServicePairDate(dateStr: string): string | null {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 6) date.setDate(date.getDate() + 1);
  else if (dayOfWeek === 0) date.setDate(date.getDate() - 1);
  else return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function scheduleDatesForPublishedTeam(dateStr: string) {
  const pair = weekendServicePairDate(dateStr);
  return pair ? [dateStr, pair] : [dateStr];
}

/** Roster lookup uses the day the published team is actually scheduled. */
export function parseScheduleRosterDate(scheduleDate: string | null | undefined, fallback: Date) {
  if (!scheduleDate) return fallback;
  const [year, month, day] = scheduleDate.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day);
}

export function normalizePublishedTeamMinistry(ministry: string | null | undefined) {
  const value = (ministry || "").trim();
  if (!value || value === "weekend_team" || value === "sunday_am") return "weekend";
  return value;
}

export function unpublishedTeamBuilderKey(
  rotationPeriodId: string,
  ministryType: string | null | undefined,
) {
  return `${rotationPeriodId}|${normalizePublishedTeamMinistry(ministryType)}`;
}

/**
 * A saved draft with no publish time is hidden. No draft row, or a row with
 * published_at, is the current published Team Builder.
 */
export function isPublishedTeamBuilderAssignment(
  rotationPeriodId: string | null | undefined,
  ministryTypes: string[] | null | undefined,
  unpublishedKeys: ReadonlySet<string>,
) {
  if (!rotationPeriodId) return true;
  const ministries = ministryTypes && ministryTypes.length > 0 ? ministryTypes : ["weekend"];
  return ministries.some(
    (ministry) => !unpublishedKeys.has(unpublishedTeamBuilderKey(rotationPeriodId, ministry)),
  );
}

export function scheduleMinistryMatches(
  entryMinistryType: string | null | undefined,
  requestedMinistryType: string | null | undefined,
) {
  const normalizedRequestedMinistryType = normalizeSessionSetMinistryType(requestedMinistryType);

  if (!normalizedRequestedMinistryType) return true;
  if (!entryMinistryType) return false;

  if (WEEKEND_MINISTRY_ALIASES.has(normalizedRequestedMinistryType)) {
    return WEEKEND_MINISTRY_ALIASES.has(entryMinistryType);
  }

  return entryMinistryType === normalizedRequestedMinistryType;
}

function countsAsBuiltTeam(assignment: CampusRosterAssignment) {
  if (isBlankTeamBuilderAssignment({
    user_id: assignment.userId,
    member_name: assignment.memberName,
  })) {
    return false;
  }

  if (assignment.userId) return true;
  const name = assignment.memberName?.trim();
  return !!name && !isBlankTeamBuilderMemberName(name);
}

function addToPeriodSet(
  sets: Map<string, Set<string>>,
  periodName: string,
  value: string,
) {
  const existing = sets.get(periodName);
  if (existing) {
    existing.add(value);
    return;
  }
  sets.set(periodName, new Set([value]));
}

export function buildCampusCalendarRosterGate({
  periods,
  assignments,
  hides,
}: {
  periods: CampusRosterPeriod[];
  assignments: CampusRosterAssignment[];
  hides: CampusRosterHide[];
}): CampusCalendarRosterGate {
  const periodNameById = new Map(periods.map((period) => [period.id, period.name]));
  const staffedTeamIdsByPeriod = new Map<string, Set<string>>();
  const staffedTeamNamesByPeriod = new Map<string, Set<string>>();
  const staffedTeamIdsByDate = new Map<string, Set<string>>();
  const staffedTeamNamesByDate = new Map<string, Set<string>>();
  const hiddenTeamIdsByPeriod = new Map<string, Set<string>>();

  for (const period of periods) {
    if (!period.name) continue;
    staffedTeamIdsByPeriod.set(period.name, new Set());
    staffedTeamNamesByPeriod.set(period.name, new Set());
    hiddenTeamIdsByPeriod.set(period.name, new Set());
  }

  for (const assignment of assignments) {
    if (!assignment.rotationPeriodId || !countsAsBuiltTeam(assignment)) continue;
    const periodName = periodNameById.get(assignment.rotationPeriodId);
    if (!periodName) continue;
    const teamName = assignment.teamName?.trim().toLowerCase();
    const scheduleDate = assignment.scheduleDate?.trim();
    if (scheduleDate) {
      const dateKey = `${periodName}|${scheduleDate}`;
      addToPeriodSet(staffedTeamIdsByDate, dateKey, assignment.teamId);
      if (teamName) addToPeriodSet(staffedTeamNamesByDate, dateKey, teamName);
      continue;
    }
    addToPeriodSet(staffedTeamIdsByPeriod, periodName, assignment.teamId);
    if (teamName) addToPeriodSet(staffedTeamNamesByPeriod, periodName, teamName);
  }

  for (const hide of hides) {
    const periodName = periodNameById.get(hide.rotationPeriodId);
    if (!periodName) continue;
    addToPeriodSet(hiddenTeamIdsByPeriod, periodName, hide.teamId);
  }

  return {
    periodNames: new Set(periods.map((period) => period.name).filter(Boolean)),
    staffedTeamIdsByPeriod,
    staffedTeamNamesByPeriod,
    staffedTeamIdsByDate,
    staffedTeamNamesByDate,
    hiddenTeamIdsByPeriod,
  };
}

function teamIsStaffed(
  teamId: string,
  teamName: string | null,
  ids: ReadonlySet<string> | undefined,
  names: ReadonlySet<string> | undefined,
) {
  if (ids?.has(teamId)) return true;
  return !!teamName && !!names?.has(teamName);
}

function teamIsStaffedOnDate(
  periodName: string,
  scheduleDate: string,
  teamId: string,
  teamName: string | null,
  gate: CampusCalendarRosterGate,
) {
  const dateKey = `${periodName}|${scheduleDate}`;
  return teamIsStaffed(
    teamId,
    teamName,
    gate.staffedTeamIdsByDate.get(dateKey),
    gate.staffedTeamNamesByDate.get(dateKey),
  );
}

/**
 * A campus shows a rotation team on a date only after the published Team Builder
 * has someone on that team. Standing members cover the whole period. A one-date
 * fill covers that date, and a weekend fill covers Saturday and Sunday together
 * except for Video and MS Weekend. Network-wide camp schedules are not campus rosters.
 */
export function isCalendarTeamScheduleVisible(
  entry: CalendarScheduleEntryLike,
  gate: CampusCalendarRosterGate,
): boolean {
  if (isNetworkWideMinistryType(entry.ministry_type)) return true;

  const periodName = entry.rotation_period?.trim();
  if (!periodName || !gate.periodNames.has(periodName)) return true;

  const teamId = entry.team_id;
  if (!teamId) return true;
  if (gate.hiddenTeamIdsByPeriod.get(periodName)?.has(teamId)) return false;

  const teamName = entry.worship_teams?.name?.trim().toLowerCase() || null;
  if (teamIsStaffed(
    teamId,
    teamName,
    gate.staffedTeamIdsByPeriod.get(periodName),
    gate.staffedTeamNamesByPeriod.get(periodName),
  )) {
    return true;
  }

  const scheduleDate = entry.schedule_date?.trim();
  if (!scheduleDate) return false;
  if (teamIsStaffedOnDate(periodName, scheduleDate, teamId, teamName, gate)) return true;

  if (!ministrySharesWeekendTeam(entry.ministry_type)) return false;
  const pairDate = weekendServicePairDate(scheduleDate);
  if (!pairDate) return false;
  return teamIsStaffedOnDate(periodName, pairDate, teamId, teamName, gate);
}

function preferCampusScheduleRow<T extends CalendarScheduleEntryLike>(
  entries: T[],
  campusId?: string | null,
) {
  return [...entries].sort((a, b) => {
    const aCampusPriority = a.campus_id === campusId ? 2 : a.campus_id == null ? 1 : 0;
    const bCampusPriority = b.campus_id === campusId ? 2 : b.campus_id == null ? 1 : 0;
    if (aCampusPriority !== bCampusPriority) return bCampusPriority - aCampusPriority;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

function chooseScheduleRow<T extends CalendarScheduleEntryLike>(
  entries: T[],
  campusId: string | null | undefined,
  ministryType: string | null | undefined,
  allowOtherMinistry: boolean,
) {
  if (entries.length === 0) return null;
  const sorted = preferCampusScheduleRow(entries, campusId);
  if (!ministryType) return sorted[0] ?? null;
  const match = sorted.find((entry) => scheduleMinistryMatches(entry.ministry_type, ministryType));
  if (match) return match;
  return allowOtherMinistry ? sorted[0] ?? null : null;
}

function isHiddenCampusScheduleEntry(
  entry: CalendarScheduleEntryLike,
  gate: CampusCalendarRosterGate,
) {
  const periodName = entry.rotation_period?.trim();
  const teamId = entry.team_id;
  if (!entry.campus_id || !periodName || !teamId || !gate.periodNames.has(periodName)) return true;
  return !!gate.hiddenTeamIdsByPeriod.get(periodName)?.has(teamId);
}

/**
 * Prefer teams the published roster actually has people on. When nobody is
 * assigned, keep this campus's own schedule row so an empty Team Builder week
 * still shows the same team. Shared rows stay hidden until someone is assigned.
 */
export function selectPublishedScheduleEntries<T extends CalendarScheduleEntryLike>(
  entries: T[],
  gate?: CampusCalendarRosterGate | null,
): T[] {
  if (!gate) return entries;
  const staffed = entries.filter((entry) => isCalendarTeamScheduleVisible(entry, gate));
  if (staffed.length > 0) return staffed;
  return entries.filter((entry) => !isHiddenCampusScheduleEntry(entry, gate));
}

/**
 * Calendar and Set Builder both use this. Prefer the team scheduled on the
 * requested date from the published roster. A weekend ministry can use the
 * other day of that weekend when the campus only published one of them.
 */
export function pickVisibleCampusScheduleEntry<T extends CalendarScheduleEntryLike>(
  entries: T[],
  options: {
    campusId?: string | null;
    ministryType?: string | null;
    preferredDate: string;
    gate?: CampusCalendarRosterGate | null;
  },
): T | null {
  const visible = selectPublishedScheduleEntries(entries, options.gate);

  const preferred = visible.filter((entry) => entry.schedule_date === options.preferredDate);
  const preferredMatch = chooseScheduleRow(preferred, options.campusId, options.ministryType, false);
  if (preferredMatch) return preferredMatch;

  if (ministrySharesWeekendTeam(options.ministryType)) {
    const pairDate = weekendServicePairDate(options.preferredDate);
    if (pairDate) {
      const pairMatch = chooseScheduleRow(
        visible.filter((entry) => entry.schedule_date === pairDate),
        options.campusId,
        options.ministryType,
        false,
      );
      if (pairMatch) return pairMatch;
    }
  }

  return chooseScheduleRow(preferred, options.campusId, options.ministryType, true);
}
