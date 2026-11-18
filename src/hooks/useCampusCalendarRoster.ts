import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCampusCalendarRosterGate,
  isPublishedTeamBuilderAssignment,
  unpublishedTeamBuilderKey,
  type CampusCalendarRosterGate,
} from "@/lib/campusCalendarRoster";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

function teamNameOf(
  team: { name?: string | null } | { name?: string | null }[] | null,
) {
  return (Array.isArray(team) ? team[0]?.name : team?.name) ?? null;
}

/**
 * Published Team Builder roster for a campus. Calendar and Set Builder share
 * this so every campus shows the same team Murfreesboro Central's publish does:
 * the team that the current published rotation actually has people on.
 */
export function useCampusCalendarRosterGate(campusId?: string | null) {
  const resourceAppKey = getCurrentResourceAppKey();

  return useQuery({
    queryKey: ["calendar-campus-roster", campusId ?? null, resourceAppKey],
    enabled: !!campusId,
    queryFn: async (): Promise<CampusCalendarRosterGate> => {
      const { data: periods, error: periodsError } = await supabase
        .from("rotation_periods")
        .select("id, name")
        .eq("campus_id", campusId!);

      if (periodsError) throw periodsError;

      const periodRows = (periods || []).filter((period) => period.id && period.name);
      const periodIds = periodRows.map((period) => period.id);
      if (periodIds.length === 0) {
        return buildCampusCalendarRosterGate({ periods: [], assignments: [], hides: [] });
      }

      const [membersResult, overridesResult, hidesResult, draftsResult] = await Promise.all([
        supabase
          .from("team_members")
          .select("rotation_period_id, team_id, user_id, member_name, ministry_types, worship_teams(name)")
          .in("rotation_period_id", periodIds),
        supabase
          .from("team_member_date_overrides")
          .select("rotation_period_id, team_id, user_id, member_name, ministry_types, schedule_date, worship_teams(name)")
          .in("rotation_period_id", periodIds),
        supabase
          .from("team_period_hides")
          .select("rotation_period_id, team_id")
          .in("rotation_period_id", periodIds),
        supabase
          .from("team_rotation_drafts")
          .select("rotation_period_id, ministry_type, published_at")
          .eq("campus_id", campusId!),
      ]);

      if (membersResult.error) throw membersResult.error;
      if (overridesResult.error) throw overridesResult.error;
      if (hidesResult.error) throw hidesResult.error;

      // Volunteers cannot read drafts. Their member rows are already limited to
      // published rotations, so a draft-read failure should not hide the roster.
      const unpublishedKeys = new Set(
        draftsResult.error ? [] : (draftsResult.data || [])
          .filter((draft) => !draft.published_at)
          .map((draft) => unpublishedTeamBuilderKey(draft.rotation_period_id, draft.ministry_type)),
      );

      const standingAssignments = (membersResult.data || []).map((row) => ({
        rotationPeriodId: row.rotation_period_id,
        teamId: row.team_id,
        teamName: teamNameOf(row.worship_teams),
        userId: row.user_id,
        memberName: row.member_name,
        ministryTypes: row.ministry_types,
      }));
      const dateAssignments = (overridesResult.data || []).map((row) => ({
        rotationPeriodId: row.rotation_period_id,
        teamId: row.team_id,
        teamName: teamNameOf(row.worship_teams),
        userId: row.user_id,
        memberName: row.member_name,
        ministryTypes: row.ministry_types,
        scheduleDate: row.schedule_date,
      }));

      return buildCampusCalendarRosterGate({
        periods: periodRows.map((period) => ({ id: period.id, name: period.name })),
        assignments: [...standingAssignments, ...dateAssignments].filter((assignment) =>
          isPublishedTeamBuilderAssignment(
            assignment.rotationPeriodId,
            assignment.ministryTypes,
            unpublishedKeys,
          ),
        ),
        hides: (hidesResult.data || []).map((hide) => ({
          rotationPeriodId: hide.rotation_period_id,
          teamId: hide.team_id,
        })),
      });
    },
  });
}
