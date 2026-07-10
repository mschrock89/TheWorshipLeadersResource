// Capability keys and the legacy fail-safe resolver.
//
// The DB (role_capabilities + has_capability) is the source of truth once the
// permissions migration is applied. Until then — or if that query ever fails —
// useCapabilities falls back to legacyCapabilitiesFromRoles below, which
// reproduces the exact role logic that used to live in useAuth / useSetlist*.
// Keep this in lockstep with the seed in
// supabase/migrations/20260708120000_add_permissions_capabilities_foundation.sql.

import type { ResourceAppKey } from "@/lib/constants";

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

  // weekend_rundown: admin/campus_admin everywhere, student admins in student apps.
  if (has("admin") || has("campus_admin") || isStudentAppAdmin) {
    caps.add(CAPABILITIES.WEEKEND_RUNDOWN);
  }

  return caps;
}

/**
 * Given a resolved capability set, does it satisfy `cap`? admin_full is a
 * break-glass superset (mirrors has_capability in SQL) so full admins pass
 * every check until the Phase 5 cutover removes that fallback.
 */
export function capabilitySetAllows(caps: Set<string>, cap: CapabilityKey | string): boolean {
  return caps.has(cap) || caps.has(CAPABILITIES.ADMIN_FULL);
}
