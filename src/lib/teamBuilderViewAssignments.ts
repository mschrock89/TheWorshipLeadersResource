import { isBlankTeamBuilderAssignment } from "./teamBuilderBlankSlot.ts";

export interface TeamBuilderViewAssignmentInput {
  id: string;
  team_id: string;
  user_id: string | null;
  member_name: string;
  position: string;
  position_slot: string | null;
  display_order: number;
  rotation_period_id: string | null;
  ministry_types: string[] | null;
  service_day?: string | null;
  schedule_dates?: string[];
}

export interface TeamBuilderViewAssignment extends TeamBuilderViewAssignmentInput {
  ministry_types: string[];
  service_day: string | null;
}

export interface TeamBuilderDateFillInput {
  id: string;
  team_id: string;
  user_id: string | null;
  member_name: string;
  position: string;
  position_slot: string;
  rotation_period_id: string;
  schedule_date: string;
  ministry_types: string[] | null;
}

function personKey(userId: string | null, memberName: string) {
  if (userId) return `user:${userId}`;
  return `name:${memberName.trim().toLowerCase()}`;
}

function slotPersonKey(teamId: string, positionSlot: string | null, userId: string | null, memberName: string) {
  return `${teamId}|${positionSlot || ""}|${personKey(userId, memberName)}`;
}

/**
 * My Team and Manage All Teams read different tables.
 * Standing rows live on team_members. One-date fills live on
 * team_member_date_overrides. Both belong on My Team.
 * A date fill that repeats the standing person is already covered.
 */
export function buildMyTeamViewAssignments(
  standing: TeamBuilderViewAssignmentInput[],
  dateFills: TeamBuilderDateFillInput[],
): TeamBuilderViewAssignment[] {
  const standingRows = standing
    .filter((row) => !isBlankTeamBuilderAssignment(row))
    .map((row) => ({
      ...row,
      ministry_types: row.ministry_types || [],
      service_day: row.service_day || null,
    }));

  const standingPeople = new Set(
    standingRows.map((row) =>
      slotPersonKey(row.team_id, row.position_slot, row.user_id, row.member_name),
    ),
  );
  const fillsByPerson = new Map<string, TeamBuilderViewAssignment>();

  for (const fill of dateFills) {
    if (isBlankTeamBuilderAssignment(fill)) continue;
    const key = slotPersonKey(fill.team_id, fill.position_slot, fill.user_id, fill.member_name);
    if (standingPeople.has(key)) continue;

    const existing = fillsByPerson.get(key);
    if (existing) {
      const dates = new Set(existing.schedule_dates || []);
      dates.add(fill.schedule_date);
      existing.schedule_dates = [...dates].sort();
      continue;
    }

    fillsByPerson.set(key, {
      id: fill.id,
      team_id: fill.team_id,
      user_id: fill.user_id,
      member_name: fill.member_name,
      position: fill.position,
      position_slot: fill.position_slot,
      display_order: 0,
      rotation_period_id: fill.rotation_period_id,
      ministry_types: fill.ministry_types || [],
      service_day: null,
      schedule_dates: [fill.schedule_date],
    });
  }

  return [...standingRows, ...fillsByPerson.values()];
}
