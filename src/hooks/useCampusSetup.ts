import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { persistCampusMinistrySchedule } from "@/hooks/useCampusMinistrySchedules";
import type { CampusMinistryDraft } from "@/lib/campusSetup";
import { weekendColumnsFromDrafts } from "@/lib/campusMinistrySchedule";

type AttendanceSupabase = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};

export type CampusSetupInput = {
  campusId: string | null;
  name: string;
  ministries: CampusMinistryDraft[];
  attendanceEnabled: boolean;
  latitude: string;
  longitude: string;
  radius: string;
  copyFromCampusId: string | null;
  copyRosterTemplates: boolean;
  copyServiceFlows: boolean;
  copyNotificationChoices: boolean;
};

async function deleteMinistrySchedules(campusId: string, ministryTypes: string[]) {
  if (ministryTypes.length === 0) return;
  const { error } = await supabase
    .from("campus_ministry_service_schedules")
    .delete()
    .eq("campus_id", campusId)
    .in("ministry_type", ministryTypes);
  if (error) throw error;
}

async function replaceCampusMinistries(campusId: string, ministryTypes: string[]) {
  const { error: deleteError } = await supabase
    .from("campus_ministries")
    .delete()
    .eq("campus_id", campusId);
  if (deleteError) throw deleteError;
  if (ministryTypes.length === 0) return;
  const { error: insertError } = await supabase
    .from("campus_ministries")
    .insert(ministryTypes.map((ministryType) => ({ campus_id: campusId, ministry_type: ministryType })));
  if (insertError) throw insertError;
}

function ministryIsOffered(offered: Set<string>, ministryType: string) {
  return offered.has(ministryType) || (ministryType === "weekend_team" && offered.has("weekend"));
}

async function copyCampusSetup(
  sourceCampusId: string,
  campusId: string,
  ministryTypes: string[],
  options: { roster: boolean; serviceFlows: boolean; notifications: boolean },
) {
  const warnings: string[] = [];
  const offered = new Set(ministryTypes);

  if (options.roster) {
    const { data: templates, error: templateError } = await supabase
      .from("team_template_configs")
      .select("team_id, ministry_type, template_config")
      .eq("campus_id", sourceCampusId);
    if (templateError) {
      warnings.push("Roster templates were not copied.");
    } else {
      const rows = (templates || []).filter((row) => ministryIsOffered(offered, row.ministry_type));
      if (rows.length > 0) {
        const { error } = await supabase.from("team_template_configs").upsert(
          rows.map((row) => ({
            team_id: row.team_id,
            campus_id: campusId,
            ministry_type: row.ministry_type,
            template_config: row.template_config,
          })),
          { onConflict: "team_id,campus_id,ministry_type" },
        );
        if (error) warnings.push("Roster templates were not copied.");
      }
    }
  }

  if (options.serviceFlows) {
    const { data: flows, error: flowError } = await supabase
      .from("service_flow_templates")
      .select("id, ministry_type, name")
      .eq("campus_id", sourceCampusId);
    if (flowError) {
      warnings.push("Service flow templates were not copied.");
    } else {
      for (const flow of flows || []) {
        if (!ministryIsOffered(offered, flow.ministry_type)) continue;
        const { data: created, error: createError } = await supabase
          .from("service_flow_templates")
          .insert({ campus_id: campusId, ministry_type: flow.ministry_type, name: flow.name })
          .select("id")
          .single();
        if (createError || !created) {
          warnings.push("Service flow templates were not copied.");
          break;
        }
        const { data: items, error: itemError } = await supabase
          .from("service_flow_template_items")
          .select("item_type, sequence_order, title, default_duration_seconds")
          .eq("template_id", flow.id);
        if (itemError) {
          warnings.push("Service flow templates were not copied.");
          break;
        }
        if (!items || items.length === 0) continue;
        const { error: insertItemsError } = await supabase.from("service_flow_template_items").insert(
          items.map((item) => ({ ...item, template_id: created.id })),
        );
        if (insertItemsError) {
          warnings.push("Service flow templates were not copied.");
          break;
        }
      }
    }
  }

  if (options.notifications) {
    const { data: prefs, error: prefsError } = await supabase
      .from("user_admin_push_prefs")
      .select("user_id, channel, enabled")
      .eq("campus_id", sourceCampusId);
    if (prefsError) {
      warnings.push("Leadership notification choices were not copied.");
    } else if (prefs && prefs.length > 0) {
      const { error } = await supabase.from("user_admin_push_prefs").upsert(
        prefs.map((pref) => ({
          user_id: pref.user_id,
          campus_id: campusId,
          channel: pref.channel,
          enabled: pref.enabled,
        })),
        { onConflict: "user_id,campus_id,channel" },
      );
      if (error) warnings.push("Leadership notification choices were not copied.");
    }
  }

  return [...new Set(warnings)];
}

export function useSaveCampusSetup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CampusSetupInput) => {
      const name = input.name.trim();
      const enabled = input.ministries.filter((ministry) => ministry.enabled);
      const weekend = enabled.find((ministry) => ministry.ministryType === "weekend");
      const weekendColumns = weekend
        ? weekendColumnsFromDrafts(weekend.days)
        : {
            has_saturday_service: false,
            has_sunday_service: false,
            saturday_service_time: null,
            sunday_service_time: null,
          };

      let campusId = input.campusId;
      if (campusId) {
        const { error } = await supabase
          .from("campuses")
          .update({
            name,
            has_saturday_service: weekendColumns.has_saturday_service,
            has_sunday_service: weekendColumns.has_sunday_service,
            saturday_service_time: weekendColumns.saturday_service_time,
            sunday_service_time: weekendColumns.sunday_service_time,
          })
          .eq("id", campusId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("campuses")
          .insert({
            name,
            is_network_wide: false,
            has_saturday_service: weekendColumns.has_saturday_service,
            has_sunday_service: weekendColumns.has_sunday_service,
            saturday_service_time: weekendColumns.saturday_service_time,
            sunday_service_time: weekendColumns.sunday_service_time,
          })
          .select("id")
          .single();
        if (error) throw error;
        campusId = data.id;
      }

      await replaceCampusMinistries(campusId, enabled.map((ministry) => ministry.ministryType));

      const cleared = input.ministries
        .filter((ministry) => !ministry.enabled || (ministry.followWeekend && ministry.ministryType !== "weekend"))
        .map((ministry) => ministry.ministryType);
      await deleteMinistrySchedules(campusId, cleared);

      for (const ministry of enabled) {
        if (ministry.followWeekend) continue;
        await persistCampusMinistrySchedule({
          campusId,
          ministryType: ministry.ministryType,
          drafts: ministry.days,
        });
      }

      const radius = Math.max(25, Math.min(5000, Number(input.radius) || 150));
      const { error: attendanceError } = await (supabase as unknown as AttendanceSupabase).rpc(
        "update_attendance_campus_settings",
        {
          _campus_id: campusId,
          _attendance_enabled: input.attendanceEnabled,
          _geofence_latitude: input.latitude.trim() ? Number(input.latitude) : null,
          _geofence_longitude: input.longitude.trim() ? Number(input.longitude) : null,
          _geofence_radius_meters: radius,
        },
      );
      if (attendanceError) throw new Error(attendanceError.message);

      let warnings: string[] = [];
      if (!input.campusId && input.copyFromCampusId) {
        warnings = await copyCampusSetup(
          input.copyFromCampusId,
          campusId,
          enabled.map((ministry) => ministry.ministryType),
          {
            roster: input.copyRosterTemplates,
            serviceFlows: input.copyServiceFlows,
            notifications: input.copyNotificationChoices,
          },
        );
      }

      return { campusId, warnings, created: !input.campusId };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campuses"] }),
        queryClient.invalidateQueries({ queryKey: ["campus-ministries"] }),
        queryClient.invalidateQueries({ queryKey: ["campus-ministry-schedules"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-campuses"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-push-prefs"] }),
      ]);
      toast({
        title: result.created ? "Campus added" : "Campus saved",
        description: result.warnings.length > 0 ? result.warnings.join(" ") : undefined,
      });
    },
    onError: (error) => {
      toast({
        title: "Could not save campus",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
