import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { canonicalSwapPosition } from "../_shared/swapPositions.ts";
import {
  buildAppUrl,
  canSendGapRequest,
  corsHeaders,
  formatGapWhen,
  formatGapPosition,
  formatMinistry,
  jsonResponse,
  ministriesMatch,
  sendPush,
  weekendPairDate,
} from "../_shared/gapRequests.ts";

interface SendGapRequestBody {
  dryRun?: boolean;
  campusId?: string;
  ministryType?: string;
  scheduleDate?: string;
  position?: string;
  /** Team Builder slot the volunteer will fill (drums, eg_2, vocalist_3, ...). */
  positionSlot?: string;
  coversWeekendPair?: boolean;
  message?: string | null;
  targetCampusIds?: string[];
  targetMinistryTypes?: string[];
  /** Subset of the previewed candidates to notify. Omit to notify all of them. */
  userIds?: string[];
  resourceAppKey?: string;
}

interface Candidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  campus_names: string[];
  ministry_types: string[];
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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

    const body = (await req.json()) as SendGapRequestBody;
    const campusId = body.campusId?.trim();
    const ministryType = body.ministryType?.trim();
    const scheduleDate = body.scheduleDate?.trim();
    const position = body.position?.trim();
    const positionSlot = body.positionSlot?.trim() || position;
    const resourceAppKey = body.resourceAppKey || req.headers.get("x-resource-app-key") || "worship";
    const targetCampusIds = unique(body.targetCampusIds?.length ? body.targetCampusIds : [campusId]);
    const targetMinistryTypes = unique(body.targetMinistryTypes?.length ? body.targetMinistryTypes : [ministryType]);
    const message = body.message?.trim() || null;

    if (!campusId || !ministryType || !scheduleDate || !position) {
      return jsonResponse({ error: "Campus, ministry, date, and position are required" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
      return jsonResponse({ error: "Date must be YYYY-MM-DD" }, 400);
    }
    if (scheduleDate < churchToday()) {
      return jsonResponse({ error: "That date has already passed" }, 400);
    }
    if (targetCampusIds.length === 0 || targetMinistryTypes.length === 0) {
      return jsonResponse({ error: "Pick at least one campus and one ministry to reach" }, 400);
    }

    if (!(await canSendGapRequest(supabase, user.id, campusId, ministryType))) {
      return jsonResponse({ error: "You don't have permission to send gap requests for this campus" }, 403);
    }

    const positionFamily = canonicalSwapPosition(position);

    const { data: assignments, error: assignmentError } = await supabase
      .from("user_campus_ministry_positions")
      .select("user_id, campus_id, ministry_type, position")
      .in("campus_id", targetCampusIds);

    if (assignmentError) throw assignmentError;

    const candidateAssignments = new Map<string, { campusIds: Set<string>; ministries: Set<string> }>();
    for (const assignment of assignments || []) {
      if (!assignment.user_id || assignment.user_id === user.id) continue;
      if (canonicalSwapPosition(assignment.position || "") !== positionFamily) continue;
      if (!targetMinistryTypes.some((target) => ministriesMatch(assignment.ministry_type, target))) continue;

      const entry = candidateAssignments.get(assignment.user_id) ?? { campusIds: new Set(), ministries: new Set() };
      entry.campusIds.add(assignment.campus_id);
      entry.ministries.add(assignment.ministry_type);
      candidateAssignments.set(assignment.user_id, entry);
    }

    const candidateIds = Array.from(candidateAssignments.keys());
    const [{ data: profiles, error: profilesError }, { data: campuses, error: campusesError }] = await Promise.all([
      candidateIds.length
        ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", candidateIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("campuses").select("id, name").in("id", unique([campusId, ...targetCampusIds])),
    ]);

    if (profilesError) throw profilesError;
    if (campusesError) throw campusesError;

    const campusNames = new Map((campuses || []).map((campus) => [campus.id, campus.name as string]));
    const candidates: Candidate[] = (profiles || [])
      .map((profile) => {
        const entry = candidateAssignments.get(profile.id)!;
        return {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          campus_names: Array.from(entry.campusIds).map((id) => campusNames.get(id) || "").filter(Boolean).sort(),
          ministry_types: Array.from(entry.ministries).sort(),
        };
      })
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    if (body.dryRun) {
      return jsonResponse({ candidates });
    }

    const recipientIds = body.userIds
      ? candidates.filter((candidate) => body.userIds!.includes(candidate.id)).map((candidate) => candidate.id)
      : candidates.map((candidate) => candidate.id);

    if (recipientIds.length === 0) {
      return jsonResponse({ error: "No volunteers selected to notify" }, 400);
    }

    const { data: gapRequest, error: insertError } = await supabase
      .from("gap_requests")
      .insert({
        created_by: user.id,
        campus_id: campusId,
        ministry_type: ministryType,
        schedule_date: scheduleDate,
        position,
        position_slot: positionSlot,
        covers_weekend_pair: Boolean(body.coversWeekendPair) && weekendPairDate(scheduleDate) !== null,
        message,
        target_campus_ids: targetCampusIds,
        target_ministry_types: targetMinistryTypes,
        resource_app_key: resourceAppKey,
      })
      .select("id")
      .single();

    if (insertError || !gapRequest) throw insertError ?? new Error("Failed to create gap request");

    const { error: recipientsError } = await supabase
      .from("gap_request_recipients")
      .insert(recipientIds.map((recipientId) => ({ gap_request_id: gapRequest.id, user_id: recipientId })));

    if (recipientsError) {
      await supabase.from("gap_requests").delete().eq("id", gapRequest.id);
      throw recipientsError;
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const senderName = senderProfile?.full_name?.trim() || "Your worship pastor";
    const positionLabel = formatGapPosition(position);
    const dateLabel = formatGapWhen(scheduleDate, Boolean(body.coversWeekendPair));
    const campusLabel = campusNames.get(campusId) || "your campus";
    const ministryLabel = formatMinistry(ministryType);
    const detailPath = `/gaps/${gapRequest.id}`;

    const pushSent = await sendPush(supabaseUrl, supabaseServiceKey, {
      title: `${positionLabel} needed ${dateLabel}`,
      message: `${senderName} needs a ${positionLabel} at ${campusLabel} for ${ministryLabel} on ${dateLabel}. Can you serve?`,
      url: buildAppUrl(resourceAppKey, detailPath),
      tag: `gap-request-${gapRequest.id}`,
      userIds: recipientIds,
      contextType: "gap-request",
      contextId: gapRequest.id,
      createdBy: user.id,
      actions: [
        { action: "yes", title: "Yes, I can serve" },
        { action: "no", title: "No, I can't" },
      ],
      actionUrls: {
        yes: buildAppUrl(resourceAppKey, `${detailPath}?respond=yes`),
        no: buildAppUrl(resourceAppKey, `${detailPath}?respond=no`),
      },
      iosCategory: "GAP_REQUEST",
      metadata: {
        resourceAppKey,
        ministryType,
        gapRequestId: gapRequest.id,
        vars: {
          sender: senderName,
          position: positionLabel,
          campus: campusLabel,
          ministry: ministryLabel,
          date: dateLabel,
        },
      },
    });

    return jsonResponse({
      success: true,
      gapRequestId: gapRequest.id,
      notified: recipientIds.length,
      pushSent,
    });
  } catch (error) {
    console.error("Error in send-gap-request:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
