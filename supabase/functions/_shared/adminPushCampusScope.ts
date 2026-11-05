// Admin-audience pushes (setlist confirms, swap leader notices, break requests,
// unanswered-swap gaps). Serving, chat, and other personal pushes are not in
// this set. Org Admin delivery is then narrowed by the profile notification menu.
//
// Campus Admins only cover campuses they administer. A home-campus assignment,
// a ministry assignment, or building the setlist does not add a campus.
// Org Admins are not limited here: the profile notification menu decides
// which leadership pushes they receive. Network pastors who are not admins
// still follow their campus assignments.

export const ADMIN_CAMPUS_SCOPED_PUSH_TYPES = new Set([
  "setlist-confirmed",
  "swap-confirmed",
  "swap-unanswered-gap",
  "break-request",
]);

export type AdminCampusRole = {
  role: string;
  admin_campus_id?: string | null;
};

/**
 * Campuses this person should receive admin pushes for.
 * null means they are not limited. Org Admins are not limited, because the
 * profile notification menu is the override for those pushes. A network pastor
 * with no campus assignment is also not limited.
 * An empty list means they are a Campus Admin with no campuses, so they
 * receive none of these pushes.
 *
 * Campus Admins only hear about campuses on their Campus Admin rows.
 * Network pastors who are not admins hear about campuses they are assigned to.
 */
export function adminPushCampusLimit(
  roleRows: AdminCampusRole[],
  assignedCampusIds: string[],
): string[] | null {
  const adminCampuses = Array.from(
    new Set(
      roleRows
        .filter((row) => row.role === "campus_admin" && row.admin_campus_id)
        .map((row) => row.admin_campus_id as string),
    ),
  );

  // The profile menu overrides the Org Admin audience. Do not also limit
  // them to Campus Admin rows, or a checked campus would still be dropped.
  if (roleRows.some((row) => row.role === "admin")) return null;

  if (roleRows.some((row) => row.role === "campus_admin")) return adminCampuses;

  const isNetworkLeader = roleRows.some((row) =>
    row.role === "network_worship_pastor" || row.role === "network_worship_leader"
  );
  const assigned = Array.from(new Set(assignedCampusIds.filter(Boolean)));
  if (isNetworkLeader && assigned.length > 0) return assigned;

  return null;
}

export function adminReceivesCampusPush(
  roleRows: AdminCampusRole[],
  assignedCampusIds: string[],
  notificationCampusIds: string[],
): boolean {
  if (notificationCampusIds.length === 0) return true;
  const limit = adminPushCampusLimit(roleRows, assignedCampusIds);
  if (limit === null) return true;
  return limit.some((campusId) => notificationCampusIds.includes(campusId));
}

export function readPushCampusIds(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const ids: string[] = [];
  const single = metadata.campusId ?? metadata.campus_id;
  if (typeof single === "string" && single) ids.push(single);
  const many = metadata.campusIds;
  if (Array.isArray(many)) {
    for (const id of many) {
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  return Array.from(new Set(ids));
}

const PUSH_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type PushCampusLookup = {
  source: "break_request" | "draft_set" | "swap_request";
  id: string;
};

/** Campus name carried on older pushes that never set campusId. */
export function campusNameFromPushMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const vars = metadata?.vars;
  if (!vars || typeof vars !== "object") return null;
  const name = (vars as Record<string, unknown>).campus;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.toLowerCase() === "your campus") return null;
  return trimmed;
}

/**
 * Leadership pushes can be tied back to a row when the caller left campusId off.
 * The profile menu needs that campus so an Org Admin opt-out is honored.
 */
export function campusLookupFromPushTag(tag: string | undefined | null): PushCampusLookup | null {
  if (!tag) return null;
  const id = tag.match(PUSH_ID)?.[0];
  if (!id) return null;
  if (tag.startsWith("break-request-")) return { source: "break_request", id };
  if (tag.startsWith("setlist-confirm-")) return { source: "draft_set", id };
  if (tag.startsWith("swap-gap-") || tag.startsWith("swap-leads-")) return { source: "swap_request", id };
  return null;
}

export function readCampusScopeExemptUserIds(metadata: Record<string, unknown> | undefined): Set<string> {
  const raw = metadata?.campusScopeExemptUserIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0));
}
