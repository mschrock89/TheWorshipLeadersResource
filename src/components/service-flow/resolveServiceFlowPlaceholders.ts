import { TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME } from "@/lib/teamBuilderBlankSlot";
import type { RosterMember } from "@/hooks/useTeamRosterForDate";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";

function normalizeRoleText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function compactRoleText(value?: string | null): string {
  return normalizeRoleText(value).replace(/\s+/g, "");
}

function rosterMemberHasRole(member: RosterMember, roles: Set<string>) {
  return [...member.positions, ...member.positionSlots].some((role) =>
    roles.has(compactRoleText(role)),
  );
}

export function formatRosterRoleNames(members: RosterMember[], roles: Set<string>) {
  const seen = new Set<string>();

  return members
    .filter((member) => rosterMemberHasRole(member, roles))
    .map((member) => member.memberName?.trim())
    .filter((name): name is string => Boolean(name) && name !== TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME)
    .filter((name) => {
      const key = compactRoleText(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

export function isNamePlaceholderTitle(title: string) {
  const normalized = normalizeRoleText(title);
  return normalized === "name place holder" || normalized === "name placeholder";
}

export function isAnnouncementsContext(title: string, sectionTitle: string) {
  const compactTitle = compactRoleText(title);
  const compactSectionTitle = compactRoleText(sectionTitle);
  return (
    compactSectionTitle.includes("announcement") ||
    compactSectionTitle.includes("anncouncement") ||
    compactSectionTitle.includes("annoucement") ||
    compactSectionTitle.includes("annoucnemt") ||
    compactSectionTitle.includes("annoucnemtn") ||
    compactTitle.includes("announcement") ||
    compactTitle.includes("anncouncement") ||
    compactTitle.includes("annoucement") ||
    compactTitle.includes("annoucnemt") ||
    compactTitle.includes("annoucnemtn")
  );
}

export function isClosingPrayerContext(title: string, sectionTitle: string) {
  const normalizedTitle = normalizeRoleText(title);
  const normalizedSectionTitle = normalizeRoleText(sectionTitle);
  return (
    normalizedSectionTitle.includes("closing prayer") ||
    normalizedSectionTitle.includes("communion closing prayer") ||
    normalizedTitle.includes("communion closing prayer")
  );
}

export function isLessonContext(title: string, sectionTitle: string) {
  const normalizedTitle = normalizeRoleText(title);
  const normalizedSectionTitle = normalizeRoleText(sectionTitle);
  return (
    normalizedSectionTitle.includes("lesson") ||
    normalizedSectionTitle.includes("message") ||
    normalizedSectionTitle.includes("sermon") ||
    normalizedSectionTitle.includes("teaching") ||
    normalizedTitle.includes("lesson") ||
    normalizedTitle.includes("teacher") ||
    normalizedTitle.includes("message") ||
    normalizedTitle.includes("sermon")
  );
}

export function isLessonPlaceholderTitle(title: string) {
  const normalized = normalizeRoleText(title);
  return (
    isNamePlaceholderTitle(title) ||
    normalized === "lesson" ||
    normalized === "teacher" ||
    normalized === "teacher place holder" ||
    normalized === "teacher placeholder" ||
    normalized === "speaker" ||
    normalized === "speaker place holder" ||
    normalized === "speaker placeholder"
  );
}

const ANNOUNCEMENT_ROLES = new Set([
  "announcement",
  "announcements",
  "anncouncement",
  "anncouncements",
  "annoucement",
  "annoucements",
]);
const CLOSING_PRAYER_ROLES = new Set(["closingprayer", "closer"]);
const TEACHER_ROLES = new Set(["teacher", "speaker", "pastor speaker", "pastorspeaker"]);

export type ScheduledRoleNames = {
  announcements: string;
  closingPrayer: string;
  teacher: string;
  /** Compact current and swapped-out names for this role. */
  announcementNameKeys: string[];
  closingPrayerNameKeys: string[];
};

function collectRoleNameKeys(roster: RosterMember[], roles: Set<string>) {
  const keys = new Set<string>();
  for (const member of roster) {
    if (!rosterMemberHasRole(member, roles)) continue;
    for (const name of [member.memberName, member.originalMemberName]) {
      const trimmed = name?.trim();
      if (!trimmed || trimmed === TEAM_BUILDER_BLANK_SLOT_MEMBER_NAME) continue;
      const key = compactRoleText(trimmed);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

function appendNameKey(nameKeys: string[], extraName?: string | null) {
  const key = compactRoleText(extraName);
  if (!key || nameKeys.includes(key)) return nameKeys;
  return [...nameKeys, key];
}

function scheduledNameParts(title: string) {
  return title
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => compactRoleText(part))
    .filter(Boolean);
}

/** True when every name in the title is a current or swapped-out person for this role. */
export function storedTitleMatchesScheduledNames(
  title: string,
  nameKeys: string[],
  extraName?: string | null,
) {
  const parts = scheduledNameParts(title);
  const keys = appendNameKey(nameKeys, extraName);
  if (parts.length === 0 || keys.length === 0) return false;
  const known = new Set(keys);
  return parts.every((part) => known.has(part));
}

export function buildScheduledRoleNames(roster: RosterMember[]): ScheduledRoleNames {
  return {
    announcements: formatRosterRoleNames(roster, ANNOUNCEMENT_ROLES),
    closingPrayer: formatRosterRoleNames(roster, CLOSING_PRAYER_ROLES),
    teacher: formatRosterRoleNames(roster, TEACHER_ROLES),
    announcementNameKeys: collectRoleNameKeys(roster, ANNOUNCEMENT_ROLES),
    closingPrayerNameKeys: collectRoleNameKeys(roster, CLOSING_PRAYER_ROLES),
  };
}

export function resolveServiceFlowPlaceholderTitle(params: {
  item: Pick<ServiceFlowItem, "title" | "song">;
  sectionTitle: string;
  roleNames: ScheduledRoleNames;
  announcerName?: string | null;
  teacherName?: string | null;
}) {
  const rawTitle = params.item.song?.title || params.item.title;
  if (params.item.song?.title) return rawTitle;

  if (isAnnouncementsContext(rawTitle, params.sectionTitle)) {
    const currentAnnouncer = params.roleNames.announcements;
    const tracksAnnouncer =
      isNamePlaceholderTitle(rawTitle) ||
      storedTitleMatchesScheduledNames(
        rawTitle,
        params.roleNames.announcementNameKeys,
        params.announcerName,
      );
    if (currentAnnouncer && tracksAnnouncer) return currentAnnouncer;
    if (isNamePlaceholderTitle(rawTitle)) {
      return params.announcerName?.trim() || rawTitle;
    }
  }

  if (isClosingPrayerContext(rawTitle, params.sectionTitle)) {
    const currentCloser = params.roleNames.closingPrayer;
    const tracksCloser =
      isNamePlaceholderTitle(rawTitle) ||
      storedTitleMatchesScheduledNames(rawTitle, params.roleNames.closingPrayerNameKeys);
    if (currentCloser && tracksCloser) return currentCloser;
  }

  if (
    normalizeRoleText(rawTitle) === "communion closing prayer" &&
    params.roleNames.closingPrayer
  ) {
    return params.roleNames.closingPrayer;
  }

  if (isLessonPlaceholderTitle(rawTitle) && isLessonContext(rawTitle, params.sectionTitle)) {
    return params.teacherName?.trim() || params.roleNames.teacher || rawTitle;
  }

  return rawTitle;
}

export function buildResolvedServiceFlowTitles(
  items: ServiceFlowItem[],
  roleNames: ScheduledRoleNames,
  options?: { announcerName?: string | null; teacherName?: string | null },
) {
  const titles = new Map<string, string>();
  let currentSectionTitle = "";

  for (const item of items) {
    if (item.item_type === "header") {
      currentSectionTitle = item.title;
      continue;
    }

    titles.set(
      item.id,
      resolveServiceFlowPlaceholderTitle({
        item,
        sectionTitle: currentSectionTitle,
        roleNames,
        announcerName: options?.announcerName,
        teacherName: options?.teacherName,
      }),
    );
  }

  return titles;
}
