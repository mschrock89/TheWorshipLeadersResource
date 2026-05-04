export const AUDITION_CANDIDATE_ROLE = "audition_candidate";
const WEEKEND_GROUP_TEXT_MINISTRY_ALIASES = new Set([
  "weekend",
  "weekend_team",
  "sunday_am",
]);
const WORSHIP_PASTOR_GROUP_TEXT_ROLES = new Set([
  "campus_worship_pastor",
  "network_worship_pastor",
]);
const PRODUCTION_MANAGER_GROUP_TEXT_ROLES = new Set(["production_manager"]);
const VIDEO_DIRECTOR_GROUP_TEXT_ROLES = new Set(["video_director"]);
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

const PRODUCTION_POSITION_KEYWORDS = [
  "foh",
  "monitor",
  "audio",
  "sound",
  "lighting",
  "lights",
  "stage",
];

const VIDEO_POSITION_KEYWORDS = [
  "camera",
  "director",
  "broadcast",
  "stream",
  "video",
  "graphics",
  "propresenter",
];

const matchesPositionKeyword = (position: string, keywords: string[]) => {
  const lower = position.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const hasWeekendGroupTextMinistry = (ministryTypes?: string[] | null) => {
  if (!ministryTypes || ministryTypes.length === 0) return true;
  return ministryTypes.some((type) => WEEKEND_GROUP_TEXT_MINISTRY_ALIASES.has(type));
};

const hasMatchingPosition = (
  positions: string[] | null | undefined,
  keywords: string[],
) => (positions || []).some((position) => matchesPositionKeyword(position, keywords));

export function filterGroupTextRecipients<T extends { ministryTypes?: string[] | null; positions?: string[] | null }>(
  members: T[],
  params: { isAdmin: boolean; roleNames: string[] },
) {
  const { isAdmin, roleNames } = params;

  if (isAdmin) {
    return members;
  }

  const hasProductionManagerRole = roleNames.some((role) =>
    PRODUCTION_MANAGER_GROUP_TEXT_ROLES.has(role),
  );
  const hasVideoDirectorRole = roleNames.some((role) =>
    VIDEO_DIRECTOR_GROUP_TEXT_ROLES.has(role),
  );
  const hasWorshipPastorRole = roleNames.some((role) =>
    WORSHIP_PASTOR_GROUP_TEXT_ROLES.has(role),
  );

  const weekendMembers = members.filter((member) =>
    hasWeekendGroupTextMinistry(member.ministryTypes),
  );

  if (hasProductionManagerRole && !hasVideoDirectorRole) {
    return weekendMembers.filter((member) =>
      hasMatchingPosition(member.positions, PRODUCTION_POSITION_KEYWORDS),
    );
  }

  if (hasVideoDirectorRole && !hasProductionManagerRole) {
    return weekendMembers.filter((member) =>
      hasMatchingPosition(member.positions, VIDEO_POSITION_KEYWORDS),
    );
  }

  if (hasWorshipPastorRole) {
    return weekendMembers.filter(
      (member) =>
        !hasMatchingPosition(member.positions, PRODUCTION_POSITION_KEYWORDS) &&
        !hasMatchingPosition(member.positions, VIDEO_POSITION_KEYWORDS),
    );
  }

  return members;
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
