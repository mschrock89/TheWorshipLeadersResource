/** Canonical push-pref keys for weekend worship aliases. */
const WEEKEND_PUSH_MINISTRY_ALIASES = new Set([
  "weekend",
  "weekend_team",
  "sunday_am",
  "speaker",
]);

const CREATIVE_PUSH_MINISTRY_ALIASES = new Set(["creative", "photo_team"]);

/**
 * Normalize ministry types for push preference storage and matching.
 * Weekend aliases collapse to `weekend_team`; creative aliases to `creative`.
 */
export function normalizePushMinistryType(
  ministryType: string | null | undefined,
): string | null {
  if (!ministryType) return null;
  const trimmed = ministryType.trim().toLowerCase();
  if (!trimmed) return null;
  if (WEEKEND_PUSH_MINISTRY_ALIASES.has(trimmed)) return "weekend_team";
  if (CREATIVE_PUSH_MINISTRY_ALIASES.has(trimmed)) return "creative";
  return trimmed;
}

/** Unique canonical ministry types from a list of raw assignment values. */
export function uniqueNormalizedPushMinistryTypes(
  ministryTypes: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  for (const ministryType of ministryTypes) {
    const normalized = normalizePushMinistryType(ministryType);
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}
