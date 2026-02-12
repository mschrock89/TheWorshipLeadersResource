export const AUDITION_CANDIDATE_ROLE = "audition_candidate";

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
