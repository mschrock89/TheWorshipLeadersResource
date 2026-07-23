import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRosterVisibilityScope, type RosterVisibilityScope } from "@/lib/access";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";

// Scopes the Team Roster sections to the viewer: weekend worship volunteers
// don't see Production/Video, and production/video volunteers only see each
// other. Actual Team Builder membership is authoritative, with the profile's
// ministry_types retained as a fallback; leaders always get the full roster.
export function useRosterVisibilityScope(): RosterVisibilityScope {
  const { user, canManageTeam } = useAuth();
  const resourceAppKey = getCurrentResourceAppKey();

  const { data: ministryTypes } = useQuery({
    queryKey: ["roster-visibility-ministry-types", user?.id],
    enabled: !!user?.id && !canManageTeam,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("ministry_types")
        .eq("id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.ministry_types as string[] | null) ?? [];
    },
  });

  const { data: teamAssignments } = useQuery({
    queryKey: ["roster-visibility-team-assignments", user?.id, resourceAppKey],
    enabled: !!user?.id && !canManageTeam,
    queryFn: async () => {
      const today = new Date();
      const todayString = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          ministry_types,
          position,
          position_slot,
          worship_teams!inner (resource_app_key),
          rotation_periods (end_date)
        `)
        .eq("user_id", user!.id)
        .eq("worship_teams.resource_app_key", resourceAppKey);

      if (error) throw error;
      return (data || [])
        // Historical rotations should not broaden a current worship volunteer's
        // access just because they served in Production years ago. Null-period
        // legacy rows and current/future memberships remain authoritative.
        .filter((assignment) =>
          !assignment.rotation_periods || assignment.rotation_periods.end_date >= todayString
        )
        .map((assignment) => ({
          ministryTypes: assignment.ministry_types,
          position: assignment.position,
          positionSlot: assignment.position_slot,
        }));
    },
  });

  return getRosterVisibilityScope({
    canManageTeam,
    ministryTypes,
    teamAssignments,
  });
}
