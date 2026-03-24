export const AUDITION_CANDIDATE_ROLE = "audition_candidate";
export const REFERENCE_TRACK_MANAGER_ROLES = new Set([
  "network_worship_pastor",
  "campus_pastor",
  "campus_worship_pastor",
  "student_worship_pastor",
]);

export const AUDITION_ALLOWED_PATHS = new Set([
  "/calendar",
  "/my-setlists",
  "/songs",
  "/resources",
]);

export function isAuditionCandidateRole(roles: string[]) {
  return roles.includes(AUDITION_CANDIDATE_ROLE);
}

export function canAuditionCandidateAccessPath(pathname: string) {
  return AUDITION_ALLOWED_PATHS.has(pathname);
}

export function canManageReferenceTracks(params: {
  isAdmin: boolean;
  roleNames: string[];
  playlistCampusId?: string | null;
  userCampusIds?: string[];
}) {
  const { isAdmin, roleNames, playlistCampusId, userCampusIds = [] } = params;

  if (isAdmin || roleNames.includes("network_worship_pastor")) {
    return true;
  }

  if (!playlistCampusId) {
    return false;
  }

  const hasCampusScopedRole = roleNames.some((role) =>
    REFERENCE_TRACK_MANAGER_ROLES.has(role),
  );

  if (!hasCampusScopedRole) {
    return false;
  }

  return userCampusIds.includes(playlistCampusId);
}
