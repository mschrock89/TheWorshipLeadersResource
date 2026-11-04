import { useState } from "react";
import { toast } from "sonner";
import type { SendGapRequestDefaults } from "@/components/gaps/SendGapRequestDialog";
import type { SwapRequest } from "@/hooks/useSwapRequests";
import { supabase } from "@/integrations/supabase/client";
import { gapMinistryForSwap, gapSlotFromAssignments } from "@/lib/gapFromSwap";
import { getCurrentResourceAppKey } from "@/lib/resourceApp";
import { isVideoPosition } from "@/lib/constants";
import { isWeekend } from "@/lib/utils";

interface ScheduleRow {
  campus_id: string | null;
  ministry_type: string | null;
}

function pickSchedule(rows: ScheduleRow[], ministryType: string | null | undefined): ScheduleRow | undefined {
  return (
    rows.find((row) => row.campus_id && ministryType && row.ministry_type === ministryType) ||
    rows.find((row) => row.campus_id) ||
    rows[0]
  );
}

/**
 * Opens the gap-request dialog from swaps management, either blank (any service
 * date) or filled from a swap nobody has accepted.
 */
export function useSwapGapComposer() {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<SendGapRequestDefaults | undefined>();
  const [intro, setIntro] = useState<string | undefined>();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const openBlank = () => {
    setDefaults(undefined);
    setIntro(undefined);
    setOpen(true);
  };

  const openForSwap = async (request: SwapRequest, dates?: string[]) => {
    const scheduleDate = [...(dates?.length ? dates : [request.original_date])].sort()[0];
    const name = request.requester?.full_name?.trim() || "A volunteer";
    const reason =
      request.status === "declined"
        ? `${name} asked for a swap and it was declined.`
        : `${name} asked for a swap and no one has taken it yet.`;
    setPendingKey(request.id);

    try {
      const resourceAppKey = getCurrentResourceAppKey();
      const [membersResult, overridesResult, scheduleResult] = await Promise.all([
        supabase
          .from("team_members")
          .select("position, position_slot")
          .eq("team_id", request.team_id)
          .eq("user_id", request.requester_id),
        supabase
          .from("team_member_date_overrides")
          .select("position, position_slot")
          .eq("team_id", request.team_id)
          .eq("user_id", request.requester_id)
          .eq("schedule_date", request.original_date),
        supabase
          .from("team_schedule")
          .select("campus_id, ministry_type")
          .eq("resource_app_key", resourceAppKey)
          .eq("team_id", request.team_id)
          .eq("schedule_date", request.original_date),
      ]);

      if (membersResult.error) console.error("Failed to load the requester's roster slot:", membersResult.error);
      if (overridesResult.error) console.error("Failed to load the requester's date slot:", overridesResult.error);
      if (scheduleResult.error) console.error("Failed to load the service campus:", scheduleResult.error);

      const schedule = pickSchedule(scheduleResult.data || [], request.ministry_type);
      const ministryType = gapMinistryForSwap(
        request.ministry_type || schedule?.ministry_type,
        request.position,
      );

      setDefaults({
        campusId: request.campus_id || schedule?.campus_id || undefined,
        ministryType,
        scheduleDate,
        positionSlot: gapSlotFromAssignments(request.position, [
          ...(overridesResult.data || []),
          ...(membersResult.data || []),
        ]),
        coversWeekendPair: !isVideoPosition(request.position) && isWeekend(scheduleDate),
        message: reason,
        excludeUserIds: [request.requester_id],
      });
      setIntro(
        `${reason} This notifies everyone else in the same position. They can answer Yes or No from the notification.`,
      );
      setOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't prepare the gap request");
    } finally {
      setPendingKey(null);
    }
  };

  return { open, setOpen, defaults, intro, pendingKey, openBlank, openForSwap };
}
