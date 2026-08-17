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

/** Collect canonical ministry types from metadata.ministryType / ministryTypes. */
export function readPushMinistryTypesFromMetadata(
  metadata: Record<string, unknown> | undefined,
): string[] {
  if (!metadata) return [];

  const collected = new Set<string>();

  const single = metadata.ministryType;
  if (typeof single === "string") {
    const normalized = normalizePushMinistryType(single);
    if (normalized) collected.add(normalized);
  }

  const many = metadata.ministryTypes;
  if (Array.isArray(many)) {
    for (const value of many) {
      if (typeof value !== "string") continue;
      // Skip admin-ping team tokens like "team:uuid"
      if (value.startsWith("team:")) continue;
      const normalized = normalizePushMinistryType(value);
      if (normalized) collected.add(normalized);
    }
  }

  return Array.from(collected);
}

/**
 * True when the user has muted every ministry on this notification.
 * Missing prefs = enabled (opt-out model).
 */
export function isMutedForAllPushMinistries(
  mutedMinistryTypes: Set<string> | undefined,
  notificationMinistryTypes: string[],
): boolean {
  if (notificationMinistryTypes.length === 0) return false;
  if (!mutedMinistryTypes || mutedMinistryTypes.size === 0) return false;
  return notificationMinistryTypes.every((ministryType) =>
    mutedMinistryTypes.has(ministryType)
  );
}
