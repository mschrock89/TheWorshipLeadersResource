import { isNetworkWideMinistryType } from "./constants.ts";
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
  worship_teams?: { name?: string | null } | null;
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

/**
 * A campus calendar shows a rotation team on a date only after Team Builder has
 * someone on that team. Standing members cover the whole period. A one-date
 * fill-in covers only that date, so a copied rotation does not fill the rest
 * of the trimester. Network-wide camp schedules are not campus rosters.
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
  const dateKey = `${periodName}|${scheduleDate}`;
  return teamIsStaffed(
    teamId,
    teamName,
    gate.staffedTeamIdsByDate.get(dateKey),
    gate.staffedTeamNamesByDate.get(dateKey),
  );
}
