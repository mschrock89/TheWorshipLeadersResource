// Setlist approval routing — resolves who approves a set and whether it needs
// approval at all, from the setlist_approval_rules table. Setlists are a
// worship-domain feature (draft_sets has no resource_app_key), so rules are
// always resolved under the 'worship' scope regardless of which app's UI planned
// the set.
//
// If the rules table isn't deployed yet, everything falls back to LEGACY_*,
// which reproduces the old hardcoded constants exactly.

import { supabase } from "@/integrations/supabase/client";
import { isSessionSetMinistryType, isWeekendTeamMinistryType } from "@/lib/constants";
import { CAPABILITIES } from "@/lib/capabilities";

/** Weekend services stay approved-but-unposted until this many days before plan_date. */
export const WEEKEND_SETLIST_PUBLISH_LEAD_DAYS = 10;
const CHURCH_TIME_ZONE = "America/Chicago";

/** Previous hardcoded approver (Kyle Elkins). Kept only as a deploy-order fallback. */
export const LEGACY_APPROVER_USER_ID = "22c10f05-955a-498c-b18f-2ac570868b35";
const LEGACY_DIRECT_PUBLISHER_FIRST_NAMES = new Set(["eli", "christian"]);
const LEGACY_DIRECT_PUBLISH_MINISTRY_TYPES = new Set(["kids_camp", "encounter", "eon", "eon_weekend", "ms_hs"]);

export const SETLIST_APPROVAL_SCOPE = "worship";

export interface ApprovalRuleRow {
  resource_app: string;
  campus_id: string | null;
  ministry_type: string | null;
  requires_approval: boolean;
  approver_user_id: string | null;
}

export interface ResolvedApproval {
  requiresApproval: boolean;
  approverUserId: string | null;
}

function firstName(fullName: string | null | undefined) {
  return (fullName || "").trim().toLowerCase().split(/\s+/)[0] || "";
}

/**
 * Most-specific rule wins: campus+ministry > campus > ministry > app default.
 * Returns null when the rules table is unavailable, so callers can fall back.
 */
export async function resolveApprovalRule(params: {
  campusId?: string | null;
  ministryType?: string | null;
}): Promise<ResolvedApproval | null> {
  const { data, error } = await supabase
    .from("setlist_approval_rules")
    .select("resource_app, campus_id, ministry_type, requires_approval, approver_user_id")
    .eq("resource_app", SETLIST_APPROVAL_SCOPE);

  if (error || !data) return null;

  const rules = data as ApprovalRuleRow[];
  const campusId = params.campusId ?? null;
  const ministryType = params.ministryType ?? null;

  const score = (r: ApprovalRuleRow): number => {
    // Reject rules that name a different campus/ministry than this set.
    if (r.campus_id !== null && r.campus_id !== campusId) return -1;
    if (r.ministry_type !== null && r.ministry_type !== ministryType) return -1;
    return (r.campus_id !== null ? 2 : 0) + (r.ministry_type !== null ? 1 : 0);
  };

  let best: ApprovalRuleRow | null = null;
  let bestScore = -1;
  for (const r of rules) {
    const s = score(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }

  if (!best) return { requiresApproval: true, approverUserId: null };
  return { requiresApproval: best.requires_approval, approverUserId: best.approver_user_id };
}

/** Does this user hold a personal "publish without approval" override? */
export async function userCanPublishWithoutApproval(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_capability_overrides")
    .select("granted")
    .eq("user_id", userId)
    .eq("capability_key", CAPABILITIES.PUBLISH_SET_WITHOUT_APPROVAL)
    .in("resource_app", [SETLIST_APPROVAL_SCOPE, "all"])
    .maybeSingle();

  if (error || !data) return false;
  return data.granted === true;
}

/**
 * Whether a set should publish immediately (skip the approval queue).
 * Data-driven; falls back to the old person/ministry rules if the tables are
 * missing (deploy-order safety).
 */
export async function shouldPublishDirectly(params: {
  userId: string;
  fullName: string | null;
  campusId?: string | null;
  ministryType?: string | null;
}): Promise<boolean> {
  const rule = await resolveApprovalRule({
    campusId: params.campusId,
    ministryType: params.ministryType,
  });

  if (rule === null) {
    // Legacy fallback: tables not deployed yet.
    if (params.userId === LEGACY_APPROVER_USER_ID) return true;
    if (
      params.ministryType &&
      (LEGACY_DIRECT_PUBLISH_MINISTRY_TYPES.has(params.ministryType) ||
        isSessionSetMinistryType(params.ministryType))
    ) {
      return true;
    }
    return LEGACY_DIRECT_PUBLISHER_FIRST_NAMES.has(firstName(params.fullName));
  }

  // Camp session sets always publish directly regardless of rule.
  if (params.ministryType && isSessionSetMinistryType(params.ministryType)) return true;
  if (!rule.requiresApproval) return true;

  return userCanPublishWithoutApproval(params.userId);
}

/** Resolve who should review a set that needs approval. */
export async function resolveApproverUserId(params: {
  campusId?: string | null;
  ministryType?: string | null;
}): Promise<string | null> {
  const rule = await resolveApprovalRule(params);
  if (rule === null) return LEGACY_APPROVER_USER_ID; // fallback
  return rule.approverUserId;
}

/** Church-local calendar date (YYYY-MM-DD) for "today" in scheduling rules. */
export function churchToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function formatSetlistPublishOn(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Weekend services (weekend / weekend_team / sunday_am) approved more than
 * 10 days out should not post yet. Returns the calendar date to post on,
 * or null when the set should post immediately.
 */
export function weekendSetlistPublishOn(
  ministryType: string | null | undefined,
  planDate: string | null | undefined,
  now = new Date(),
): string | null {
  if (!planDate || !isWeekendTeamMinistryType(ministryType)) return null;
  const publishOn = addCalendarDays(planDate, -WEEKEND_SETLIST_PUBLISH_LEAD_DAYS);
  if (publishOn <= churchToday(now)) return null;
  return publishOn;
}

/** Is this user an approver for at least one rule (i.e. can see the queue)? */
export async function isApproverUser(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("setlist_approval_rules")
    .select("approver_user_id")
    .eq("approver_user_id", userId)
    .limit(1);

  if (error) return userId === LEGACY_APPROVER_USER_ID; // fallback
  return (data?.length ?? 0) > 0;
}
