const WEEKEND_MINISTRIES = new Set(["weekend", "weekend_team", "sunday_am"]);

const WORSHIP_NIGHT_NAME_PATTERN =
  /\b(?:worship\s*night|night of worship|night of prayer\s*(?:and|&)\s*worship)\b/i;
const PRAYER_NIGHT_NAME_PATTERN = /\b(?:prayer\s*night|night of prayer)\b/i;
const KIDS_CAMP_NAME_PATTERN = /\bkids\s*camp\b/i;
const STUDENT_CAMP_NAME_PATTERN = /\bstudent\s*camp\b/i;

export function isWeekendMinistryType(ministryType?: string | null): boolean {
  return !!ministryType && WEEKEND_MINISTRIES.has(ministryType);
}

/** The ministry selected in Custom Service Admin is the source of truth for calendars and rosters. */
export function getEffectiveCustomServiceMinistryType(
  ministryType: string,
  _serviceName = "",
): string {
  return ministryType;
}

/**
 * Service flow templates follow the gathering, not the Weekend default.
 * A custom service saved as Weekend but named "A Night of Prayer and Worship"
 * uses the Worship Night template.
 */
export function getServiceFlowMinistryType(ministryType: string, serviceName = ""): string {
  if (ministryType === "prayer_night" || ministryType === "worship_night") {
    return ministryType;
  }

  const name = serviceName || "";
  if (WORSHIP_NIGHT_NAME_PATTERN.test(name)) return "worship_night";
  if (PRAYER_NIGHT_NAME_PATTERN.test(name)) return "prayer_night";

  if (
    ministryType === "kids_camp" ||
    ministryType.startsWith("kids_camp_") ||
    ministryType === "student_camp" ||
    ministryType.startsWith("student_camp_")
  ) {
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
