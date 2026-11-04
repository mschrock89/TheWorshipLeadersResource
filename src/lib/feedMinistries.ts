import type { ResourceAppKey } from "@/lib/resourceApps";
import { isStudentResourceAppKey } from "@/lib/resourceApp";

// Ministries that each get their own campus-scoped Feed. Distinct from the full
// chat ministry list (src/lib/chat.ts): only these ministries were chosen to
// have a Feed. The FIRST entry is the default/legacy ministry that existing
// posts were backfilled into (see the split_feed_by_ministry migration):
// worship -> "weekend", students -> "leader_chat".
export const WORSHIP_FEED_MINISTRY_TYPES = [
  { value: "weekend", label: "Weekend Worship" },
  { value: "production", label: "Production" },
  { value: "video", label: "Video" },
  { value: "encounter", label: "HS Worship" },
  { value: "eon", label: "MS Worship" },
  { value: "evident", label: "Evident" },
] as const;

export const STUDENT_FEED_MINISTRY_TYPES = [
  { value: "leader_chat", label: "Leader Chat" },
] as const;

export type FeedMinistryOption = { value: string; label: string };

/** Everyone assigned to the selected campus, across ministries. */
export const CAMPUS_WIDE_FEED_TYPE = "campus_wide";
/** Every user on this resource app, regardless of campus. */
export const NETWORK_WIDE_FEED_TYPE = "network_wide";

export const BROAD_FEED_SCOPES = [
  { value: CAMPUS_WIDE_FEED_TYPE, label: "Campus Wide" },
  { value: NETWORK_WIDE_FEED_TYPE, label: "Network Wide" },
] as const;

const FEED_MINISTRY_LABELS = new Map<string, string>([
  ...BROAD_FEED_SCOPES.map((scope) => [scope.value, scope.label] as const),
  ...[...WORSHIP_FEED_MINISTRY_TYPES, ...STUDENT_FEED_MINISTRY_TYPES].map(
    (ministry) => [ministry.value, ministry.label] as const,
  ),
]);

export function getFeedMinistryTypesForResourceApp(
  resourceAppKey: ResourceAppKey | string,
): readonly FeedMinistryOption[] {
  return isStudentResourceAppKey(resourceAppKey)
    ? STUDENT_FEED_MINISTRY_TYPES
    : WORSHIP_FEED_MINISTRY_TYPES;
}

export function getDefaultFeedMinistryType(
  resourceAppKey: ResourceAppKey | string,
): string {
  return getFeedMinistryTypesForResourceApp(resourceAppKey)[0].value;
}

/** Ministry feeds plus Campus Wide and Network Wide. */
export function getFeedScopeOptions(
  resourceAppKey: ResourceAppKey | string,
): readonly FeedMinistryOption[] {
  return [...BROAD_FEED_SCOPES, ...getFeedMinistryTypesForResourceApp(resourceAppKey)];
}

export function isCampusWideFeedType(ministryType: string | null | undefined): boolean {
  return ministryType === CAMPUS_WIDE_FEED_TYPE;
}

export function isNetworkWideFeedType(ministryType: string | null | undefined): boolean {
  return ministryType === NETWORK_WIDE_FEED_TYPE;
}

export function isValidFeedScope(
  resourceAppKey: ResourceAppKey | string,
  scope: string | null | undefined,
): boolean {
  if (!scope) return false;
  return getFeedScopeOptions(resourceAppKey).some((option) => option.value === scope);
}

export function isValidFeedMinistryType(
  resourceAppKey: ResourceAppKey | string,
  ministryType: string | null | undefined,
): boolean {
  if (!ministryType) return false;
  return getFeedMinistryTypesForResourceApp(resourceAppKey).some(
    (ministry) => ministry.value === ministryType,
  );
}

export function getFeedMinistryLabel(ministryType: string | null | undefined): string {
  if (!ministryType) return "";
  return FEED_MINISTRY_LABELS.get(ministryType) ?? ministryType;
}
