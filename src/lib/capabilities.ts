// Capability keys and the resolver the permissions screen edits.
//
// role_capabilities + user_capability_overrides are the source of truth.
// Each checkbox grants only that capability. Full admin access does not
// imply the others. If the tables cannot be read, useCapabilities falls
// back to legacyCapabilitiesFromRoles.

import { supabase } from "@/integrations/supabase/client";
import type { ResourceAppKey } from "@/lib/resourceApps";

export const CAPABILITIES = {
  ADMIN_FULL: "admin_full",
  ADMIN_TOOLS: "admin_tools",
  MANAGE_PERMISSIONS: "manage_permissions",
  LEADER_ACCESS: "leader_access",
  MANAGE_TEAM: "manage_team",
  SWITCH_CAMPUS_CHAT: "switch_campus_chat",
  PLAN_SET: "plan_set",
  VIEW_ALL_SETLISTS: "view_all_setlists",
  VIDEO_DIRECTOR_TOOLS: "video_director_tools",
  PRODUCTION_MANAGER_TOOLS: "production_manager_tools",
  WEEKEND_RUNDOWN: "weekend_rundown",
  PUBLISH_SET_WITHOUT_APPROVAL: "publish_set_without_approval",
  LIVE_LINE_NOTES: "live_line_notes",
  POST_FEED: "post_feed",
} as const;

export type CapabilityKey = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

// The isLeader role set from the old useAuth.
const LEADER_ROLES = [
  "campus_admin",
  "campus_worship_pastor",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "network_worship_pastor",
  "network_worship_leader",
] as const;

function isStudentApp(appKey: ResourceAppKey | string): boolean {
  return appKey === "students_hs" || appKey === "students_ms";
}

/**
 * Reproduces the pre-migration behavior: given a user's roles and the current
 * resource app, return the capability keys they effectively hold. Used as a
 * fail-safe so `can()` keeps working if the new tables aren't deployed yet.
 */
export function legacyCapabilitiesFromRoles(
  roles: string[],
  appKey: ResourceAppKey | string,
): Set<string> {
  const has = (r: string) => roles.includes(r);
  const caps = new Set<string>();
  // Student pastors act as full admins inside the HS/MS apps only.
  const isStudentAppAdmin = isStudentApp(appKey) && (has("student_pastor") || has("network_student_pastor"));
  const isFullAdmin = has("admin") || isStudentAppAdmin;

  if (isFullAdmin) {
    caps.add(CAPABILITIES.ADMIN_FULL);
    caps.add(CAPABILITIES.ADMIN_TOOLS);
  }
  if (has("admin")) {
    caps.add(CAPABILITIES.MANAGE_PERMISSIONS);
  }

  const isLeader = isFullAdmin || LEADER_ROLES.some(has);
  if (isLeader) caps.add(CAPABILITIES.LEADER_ACCESS);

  if (isLeader || has("video_director") || has("production_manager")) {
    caps.add(CAPABILITIES.MANAGE_TEAM);
  }

  // switch_campus_chat: leader set minus student_worship_pastor.
  if (
    isFullAdmin ||
    has("campus_admin") ||
    has("campus_worship_pastor") ||
    has("network_student_pastor") ||
    has("student_pastor") ||
    has("childrens_pastor") ||
    has("network_worship_pastor") ||
    has("network_worship_leader")
  ) {
    caps.add(CAPABILITIES.SWITCH_CAMPUS_CHAT);
  }

  if (
    has("admin") ||
    has("campus_admin") ||
    has("network_worship_leader") ||
    has("network_worship_pastor") ||
    has("campus_worship_pastor") ||
    has("student_worship_pastor") ||
    has("video_director") ||
    has("production_manager")
  ) {
    caps.add(CAPABILITIES.PLAN_SET);
  }

  if (
    isFullAdmin ||
    has("campus_admin") ||
    has("campus_worship_pastor") ||
    has("network_student_pastor") ||
    has("student_pastor") ||
    has("student_worship_pastor") ||
    has("childrens_pastor") ||
    has("network_worship_pastor") ||
    has("network_worship_leader") ||
    has("campus_pastor")
  ) {
    caps.add(CAPABILITIES.VIEW_ALL_SETLISTS);
  }

  if (has("admin") || has("video_director")) caps.add(CAPABILITIES.VIDEO_DIRECTOR_TOOLS);
  if (has("admin") || has("production_manager")) caps.add(CAPABILITIES.PRODUCTION_MANAGER_TOOLS);
  if (has("admin") || has("production_manager") || has("video_director")) {
    caps.add(CAPABILITIES.LIVE_LINE_NOTES);
  }

  // weekend_rundown: admin/campus_admin everywhere, student admins in student apps.
  if (has("admin") || has("campus_admin") || isStudentAppAdmin) {
    caps.add(CAPABILITIES.WEEKEND_RUNDOWN);
  }

  return caps;
}

/**
 * A capability is allowed only when that exact key is granted. Full admin
 * access is its own checkbox and does not unlock the rest.
 */
export function capabilitySetAllows(caps: Set<string>, cap: CapabilityKey | string): boolean {
  return caps.has(cap);
}

type RoleGrantRow = {
  capability_key: string;
  role: string;
  resource_app: string;
};

const ROLE_GRANT_TTL_MS = 10 * 60 * 1000;
const roleGrantCache = new Map<string, { at: number; rows: RoleGrantRow[] }>();
const roleGrantInflight = new Map<string, Promise<RoleGrantRow[] | null>>();

// The grant table is the same for every person in an app. Cache it so a
// reload during a crowded launch does not scan it again.
async function loadRoleGrants(resourceApp: string): Promise<RoleGrantRow[] | null> {
  const memory = roleGrantCache.get(resourceApp);
  if (memory && Date.now() - memory.at < ROLE_GRANT_TTL_MS) return memory.rows;

  const storageKey = `role-caps:${resourceApp}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; rows: RoleGrantRow[] };
      if (Date.now() - parsed.at < ROLE_GRANT_TTL_MS && Array.isArray(parsed.rows)) {
        roleGrantCache.set(resourceApp, parsed);
        return parsed.rows;
      }
    }
  } catch {
    // Private browsing can reject sessionStorage.
  }

  const existing = roleGrantInflight.get(resourceApp);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase
      .from("role_capabilities")
      .select("capability_key, role, resource_app")
      .in("resource_app", [resourceApp, "all"]);
    if (error || !data) return null;
    const entry = { at: Date.now(), rows: data as RoleGrantRow[] };
    roleGrantCache.set(resourceApp, entry);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch {
      // Ignore quota and private-mode failures.
    }
    return entry.rows;
  })();

  roleGrantInflight.set(resourceApp, request);
  try {
    return await request;
  } finally {
    roleGrantInflight.delete(resourceApp);
  }
}

/** Role grants plus per-user overrides for this app. Exact keys only. */
export async function fetchCapabilitySet(userId: string, resourceApp: string): Promise<Set<string>> {
  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (rolesError) {
    console.error("fetchCapabilitySet: failed to load roles:", rolesError);
    return new Set<string>();
  }

  const roles = (roleRows || []).map((row) => row.role as string);
  const appScope = [resourceApp, "all"];
  const [{ data: overrides, error: overridesError }, grants] = await Promise.all([
    supabase
      .from("user_capability_overrides")
      .select("capability_key, granted, resource_app, expires_at")
      .eq("user_id", userId)
      .in("resource_app", appScope),
    loadRoleGrants(resourceApp),
  ]);

  if (overridesError || !grants) {
    console.error("fetchCapabilitySet: falling back to role defaults", overridesError);
    return legacyCapabilitiesFromRoles(roles, resourceApp);
  }

  const roleSet = new Set(roles);
  const caps = new Set<string>();
  for (const grant of grants || []) {
    if (roleSet.has(grant.role as string)) caps.add(grant.capability_key);
  }

  const nowMs = Date.now();
  const revoked = new Set<string>();
  for (const override of overrides || []) {
    if (override.expires_at && new Date(override.expires_at).getTime() <= nowMs) continue;
    if (override.granted) caps.add(override.capability_key);
    else revoked.add(override.capability_key);
  }
  for (const key of revoked) caps.delete(key);

  return caps;
}
