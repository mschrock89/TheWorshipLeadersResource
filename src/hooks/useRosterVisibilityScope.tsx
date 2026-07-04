import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRosterVisibilityScope, type RosterVisibilityScope } from "@/lib/access";

// Scopes the Team Roster sections to the viewer: weekend worship volunteers
// don't see Production/Video, and production/video volunteers only see each
// other. Classification comes from the viewer's profile ministry_types (the
// same field the Profile page manages); leaders always get the full roster.
export function useRosterVisibilityScope(): RosterVisibilityScope {
  const { user, canManageTeam } = useAuth();

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

  return getRosterVisibilityScope({ canManageTeam, ministryTypes });
}
