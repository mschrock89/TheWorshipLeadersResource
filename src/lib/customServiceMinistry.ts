import { normalizeSessionSetMinistryType } from "@/lib/constants";

const WEEKEND_MINISTRIES = new Set(["weekend", "weekend_team", "sunday_am"]);

const WORSHIP_NIGHT_NAME_PATTERN =
  /\b(?:worship\s*night|night of worship|night of prayer\s*(?:and|&)\s*worship)\b/i;
const PRAYER_NIGHT_NAME_PATTERN = /\b(?:prayer\s*night|night of prayer)\b/i;
const KIDS_CAMP_NAME_PATTERN = /\bkids\s*camp\b/i;
const STUDENT_CAMP_NAME_PATTERN = /\bstudent\s*camp\b/i;

export function isWeekendMinistryType(ministryType?: string | null): boolean {
  return !!ministryType && WEEKEND_MINISTRIES.has(ministryType);
}

/**
 * Custom services are often created with the default Weekend ministry even when
 * the name is a specialty gathering (Worship Night, Prayer Night, camp).
 * Resolve the ministry the service should actually use for templates/setlists.
 */
export function getEffectiveCustomServiceMinistryType(
  ministryType: string,
  serviceName = "",
): string {
  if (ministryType === "prayer_night" || ministryType === "worship_night") {
    return ministryType;
  }

  const name = serviceName || "";
  if (WORSHIP_NIGHT_NAME_PATTERN.test(name)) return "worship_night";
  if (PRAYER_NIGHT_NAME_PATTERN.test(name)) return "prayer_night";

  const sessionBaseMinistry = normalizeSessionSetMinistryType(ministryType);
  if (sessionBaseMinistry === "kids_camp" || sessionBaseMinistry === "student_camp") {
    return ministryType;
  }
  if (KIDS_CAMP_NAME_PATTERN.test(name)) return "kids_camp";
  if (STUDENT_CAMP_NAME_PATTERN.test(name)) return "student_camp";

  return ministryType;
}

export function isSpecialtyCustomServiceMinistry(ministryType?: string | null): boolean {
  return (
    ministryType === "worship_night" ||
    ministryType === "prayer_night" ||
    ministryType === "kids_camp" ||
    ministryType === "student_camp"
  );
}
