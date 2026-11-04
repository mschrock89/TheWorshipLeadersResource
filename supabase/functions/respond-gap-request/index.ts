import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAppUrl,
  corsHeaders,
  formatGapDate,
  formatGapPosition,
  formatGapWhen,
  jsonResponse,
  resolveGapPlacement,
  sendPush,
  writeGapOverrides,
} from "../_shared/gapRequests.ts";

type GapAction = "yes" | "no" | "confirm" | "cancel";

interface RespondGapRequestBody {
  gapRequestId?: string;
  action?: GapAction;
  /** Volunteer to confirm (action = "confirm"). */
  userId?: string;
}

function churchToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { gapRequestId, action, userId: targetUserId } = (await req.json()) as RespondGapRequestBody;
    if (!gapRequestId || !action || !["yes", "no", "confirm", "cancel"].includes(action)) {
      return jsonResponse({ error: "gapRequestId and a valid action are required" }, 400);
    }

    const { data: gap, error: gapError } = await supabase
      .from("gap_requests")
      .select(
        "id, created_by, campus_id, ministry_type, schedule_date, position, position_slot, covers_weekend_pair, status, resource_app_key, campuses(name)",
      )
      .eq("id", gapRequestId)
      .maybeSingle();

    if (gapError) throw gapError;
    if (!gap) return jsonResponse({ error: "Gap request not found" }, 404);

    const resourceAppKey = gap.resource_app_key || "worship";
    const detailUrl = buildAppUrl(resourceAppKey, `/gaps/${gap.id}`);
    const positionLabel = formatGapPosition(gap.position);
    const dateLabel = formatGapWhen(gap.schedule_date, gap.covers_weekend_pair);
    // deno-lint-ignore no-explicit-any
    const campusLabel = (gap.campuses as any)?.name || "your campus";
    const pushMetadata = { resourceAppKey, ministryType: gap.ministry_type, gapRequestId: gap.id };

    const closedReason =
      gap.status === "filled"
        ? "This spot has already been filled."
        : gap.status === "cancelled"
          ? "This request was cancelled."
          : gap.schedule_date < churchToday()
            ? "This date has already passed."
            : null;

    if (action === "yes" || action === "no") {
      if (closedReason) return jsonResponse({ error: closedReason, status: gap.status }, 409);

      const { data: existing, error: existingError } = await supabase
        .from("gap_request_recipients")
        .select("id, response")
        .eq("gap_request_id", gap.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing) return jsonResponse({ error: "This request wasn't sent to you" }, 403);

      if (existing.response === action) {
        return jsonResponse({ success: true, response: action, unchanged: true });
      }

      const { error: updateError } = await supabase
        .from("gap_request_recipients")
        .update({ response: action, responded_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateError) throw updateError;

      const { data: responder } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const responderName = responder?.full_name?.trim() || "A volunteer";

      if (action === "yes") {
        await sendPush(supabaseUrl, supabaseServiceKey, {
          title: `${responderName} can serve ${dateLabel}`,
          message: `${responderName} said yes to ${positionLabel} on ${dateLabel}. Open the request to approve them.`,
          url: detailUrl,
          tag: `gap-response-${gap.id}-${user.id}`,
          userIds: [gap.created_by],
          contextType: "gap-response",
          contextId: gap.id,
          createdBy: user.id,
          metadata: { ...pushMetadata, vars: { responder: responderName, position: positionLabel, date: dateLabel } },
        });
      } else {
        const { data: openResponses } = await supabase
          .from("gap_request_recipients")
          .select("response")
          .eq("gap_request_id", gap.id)
          .neq("response", "no");

        if ((openResponses || []).length === 0) {
          await sendPush(supabaseUrl, supabaseServiceKey, {
            title: `No ${positionLabel} available ${dateLabel}`,
            message: `Everyone you asked has said no to ${positionLabel} on ${dateLabel}. You may need to widen the campuses or ministries you reach.`,
            url: detailUrl,
            tag: `gap-all-declined-${gap.id}`,
            userIds: [gap.created_by],
            contextType: "gap-response",
            contextId: gap.id,
            createdBy: user.id,
            metadata: pushMetadata,
          });
        }
      }

      return jsonResponse({ success: true, response: action });
    }

    const { data: canManage, error: manageError } = await supabase.rpc("viewer_can_manage_gap_request", {
      _gap_request_id: gap.id,
      _viewer_id: user.id,
    });
    if (manageError) throw manageError;
    if (!canManage) return jsonResponse({ error: "You can't manage this gap request" }, 403);

    if (gap.status !== "open") {
      return jsonResponse({ error: closedReason || "This request is closed", status: gap.status }, 409);
    }

    const { data: yesRows, error: yesError } = await supabase
      .from("gap_request_recipients")
      .select("user_id")
      .eq("gap_request_id", gap.id)
      .eq("response", "yes");
    if (yesError) throw yesError;
    const yesUserIds = (yesRows || []).map((row) => row.user_id as string);

    const { data: sender } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const senderName = sender?.full_name?.trim() || "Your worship pastor";

    if (action === "confirm") {
      if (!targetUserId || !yesUserIds.includes(targetUserId)) {
        return jsonResponse({ error: "Only volunteers who said yes can be approved" }, 400);
      }

      const placement = await resolveGapPlacement(supabase, {
        ...gap,
        resource_app_key: resourceAppKey,
      });

      const { data: claimed, error: fillError } = await supabase
        .from("gap_requests")
        .update({
          status: "filled",
          filled_by_user_id: targetUserId,
          filled_at: new Date().toISOString(),
          team_id: placement?.teamId ?? null,
        })
        .eq("id", gap.id)
        .eq("status", "open")
        .select("id");
      if (fillError) throw fillError;
      if (!claimed?.length) return jsonResponse({ error: "This request was already closed" }, 409);

      const { data: volunteer } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", targetUserId)
        .maybeSingle();
      const volunteerName = volunteer?.full_name?.trim() || "Volunteer";

      let slottedDates: string[] = [];
      let scheduleError: string | null = placement
        ? null
        : "No team is scheduled at this campus and ministry for that date, so add them in Team Builder.";

      if (placement && placement.dates.length > 0) {
        try {
          await writeGapOverrides(supabase, placement, gap, { id: targetUserId, name: volunteerName });
          slottedDates = placement.dates;
          await supabase.from("gap_requests").update({ slotted_dates: slottedDates }).eq("id", gap.id);
        } catch (overrideError) {
          console.error("Failed to add gap volunteer to the roster:", overrideError);
          scheduleError = "They're approved, but adding them to the roster failed, so add them in Team Builder.";
        }
      }

      const scheduledWhen = slottedDates.length
        ? slottedDates.map(formatGapDate).join(" & ")
        : dateLabel;

      await sendPush(supabaseUrl, supabaseServiceKey, {
        title: `You're on the schedule ${scheduledWhen}`,
        message: `${senderName} approved you for ${positionLabel} at ${campusLabel} on ${scheduledWhen}. Thank you!`,
        url: detailUrl,
        tag: `gap-filled-${gap.id}`,
        userIds: [targetUserId],
        contextType: "gap-filled",
        contextId: gap.id,
        createdBy: user.id,
        metadata: {
          ...pushMetadata,
          vars: { sender: senderName, position: positionLabel, campus: campusLabel, date: scheduledWhen },
        },
      });

      await sendPush(supabaseUrl, supabaseServiceKey, {
        title: `${positionLabel} spot filled`,
        message: `Thanks for offering to serve ${dateLabel}! ${senderName} found someone for ${positionLabel}, so you're not needed this time.`,
        url: detailUrl,
        tag: `gap-closed-${gap.id}`,
        userIds: yesUserIds.filter((id) => id !== targetUserId),
        contextType: "gap-filled",
        contextId: gap.id,
        createdBy: user.id,
        metadata: pushMetadata,
      });

      return jsonResponse({
        success: true,
        status: "filled",
        volunteerName,
        teamName: placement?.teamName ?? null,
        slottedDates,
        scheduleError,
      });
    }

    const { data: cancelled, error: cancelError } = await supabase
      .from("gap_requests")
      .update({ status: "cancelled" })
      .eq("id", gap.id)
      .eq("status", "open")
      .select("id");
    if (cancelError) throw cancelError;
    if (!cancelled?.length) return jsonResponse({ error: "This request was already closed" }, 409);

    await sendPush(supabaseUrl, supabaseServiceKey, {
      title: `${positionLabel} no longer needed`,
      message: `Thanks for offering to serve ${dateLabel}! ${senderName} no longer needs a ${positionLabel}.`,
      url: detailUrl,
      tag: `gap-closed-${gap.id}`,
      userIds: yesUserIds,
      contextType: "gap-filled",
      contextId: gap.id,
      createdBy: user.id,
      metadata: pushMetadata,
    });

    return jsonResponse({ success: true, status: "cancelled" });
  } catch (error) {
    console.error("Error in respond-gap-request:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
