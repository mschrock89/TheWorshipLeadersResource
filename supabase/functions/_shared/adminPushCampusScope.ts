// Admin-audience pushes (setlist confirms, swap leader notices, break requests,
// unanswered-swap gaps) should reach an admin only for campuses they cover.
// Serving, chat, and other personal pushes are not in this set.
//
// Org Admins and Campus Admins only cover campuses they are a Campus Admin for.
// A home-campus assignment, a ministry assignment, or building the setlist does
// not add a campus. Network pastors who are not admins still follow their
// campus assignments.

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
 * null means they are not limited (someone who is not an Admin or Org Admin,
 * or a network pastor with no campus assignment).
 * An empty list means they are an Admin or Org Admin with no Campus Admin
 * campuses, so they receive none of these pushes.
 *
 * Org Admins and Campus Admins only hear about campuses on their Campus Admin
 * rows. Network pastors who are not admins hear about campuses they are
 * assigned to.
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

  const isOrgOrCampusAdmin = roleRows.some((row) => row.role === "admin" || row.role === "campus_admin");
  if (isOrgOrCampusAdmin) return adminCampuses;

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

export function readCampusScopeExemptUserIds(metadata: Record<string, unknown> | undefined): Set<string> {
  const raw = metadata?.campusScopeExemptUserIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0));
}
