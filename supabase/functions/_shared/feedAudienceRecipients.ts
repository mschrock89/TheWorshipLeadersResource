import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

const WEEKEND_ALIASES = ["weekend", "weekend_team", "sunday_am", "speaker"];
const LEADER_CHAT_ALIASES = ["leader_chat", "student_leader_chat"];

export function matchingFeedMinistryTypes(ministryType: string | null | undefined): string[] | null {
  if (!ministryType) return null;
  if (WEEKEND_ALIASES.includes(ministryType)) return [...WEEKEND_ALIASES];
  if (LEADER_CHAT_ALIASES.includes(ministryType)) return [...LEADER_CHAT_ALIASES];
  return [ministryType];
}

export async function resolveFeedAudienceUserIds(
  supabase: SupabaseClient,
  input: {
    resourceAppKey?: string | null;
    campusId?: string | null;
    ministryType?: string | null;
    campInstanceId?: string | null;
    campResourceAppKeys?: string[];
    excludeUserId?: string | null;
  },
): Promise<string[]> {
  const excludeUserId = input.excludeUserId || null;
  let subQuery = supabase
    .from("push_subscriptions")
    .select("user_id")
    .not("user_id", "is", null);

  if (excludeUserId) {
    subQuery = subQuery.neq("user_id", excludeUserId);
  }

  if (input.campInstanceId && (input.campResourceAppKeys?.length || 0) > 0) {
    subQuery = subQuery.in("resource_app_key", input.campResourceAppKeys!);
  } else if (input.resourceAppKey) {
    subQuery = subQuery.eq("resource_app_key", input.resourceAppKey);
  }

  const { data: subs, error: subsError } = await subQuery;
  if (subsError) {
    console.error("Error fetching feed push subscriptions:", subsError);
    throw new Error("Failed to fetch recipients");
  }

  let recipientUserIds = Array.from(
    new Set((subs || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
  );

  if (input.campInstanceId) {
    return recipientUserIds;
  }

  if (!input.campusId || recipientUserIds.length === 0) {
    return recipientUserIds;
  }

  const ministryTypes = matchingFeedMinistryTypes(input.ministryType);
  if (ministryTypes) {
    const { data: ministryUsers, error: ministryError } = await supabase
      .from("user_ministry_campuses")
      .select("user_id")
      .eq("campus_id", input.campusId)
      .in("ministry_type", ministryTypes)
      .in("user_id", recipientUserIds);

    if (ministryError) {
      console.error("Error filtering feed push recipients by ministry:", ministryError);
      throw new Error("Failed to filter recipients by ministry");
    }

    return Array.from(
      new Set((ministryUsers || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
    );
  }

  const { data: campusUsers, error: campusError } = await supabase
    .from("user_campuses")
    .select("user_id")
    .eq("campus_id", input.campusId)
    .in("user_id", recipientUserIds);

  if (campusError) {
    console.error("Error filtering feed push recipients by campus:", campusError);
    throw new Error("Failed to filter recipients by campus");
  }

  return Array.from(
    new Set((campusUsers || []).map((row: { user_id: string }) => row.user_id).filter(Boolean)),
  );
}
