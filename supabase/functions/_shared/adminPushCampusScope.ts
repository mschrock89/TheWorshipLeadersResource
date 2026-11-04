// Admin-audience pushes (setlist confirms, swap leader notices, break requests,
// unanswered-swap gaps) should reach an admin only for campuses they cover.
// Serving, chat, and other personal pushes are not in this set.

export const ADMIN_CAMPUS_SCOPED_PUSH_TYPES = new Set([
  "setlist-confirmed",
  "swap-confirmed",
  "swap-unanswered-gap",
  "break-request",
]);

const CAMPUS_LIMITED_ROLES = new Set([
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "network_worship_leader",
]);

export type AdminCampusRole = {
  role: string;
  admin_campus_id?: string | null;
};

/**
 * Campuses this person should receive admin pushes for.
 * null means they are not limited to a campus (a network admin with no campus
 * assignment, or someone who is not an admin).
 *
 * Campus Admin rows win. Otherwise an admin or network pastor who is assigned
 * to campuses only hears about those campuses.
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
  if (adminCampuses.length > 0) return adminCampuses;

  const isCampusLimitedRole = roleRows.some((row) => CAMPUS_LIMITED_ROLES.has(row.role));
  const assigned = Array.from(new Set(assignedCampusIds.filter(Boolean)));
  if (isCampusLimitedRole && assigned.length > 0) return assigned;

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
