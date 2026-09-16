const WEEKEND_MINISTRIES = new Set(["weekend", "weekend_team", "sunday_am"]);

export function isWeekendMinistryType(ministryType?: string | null): boolean {
  return !!ministryType && WEEKEND_MINISTRIES.has(ministryType);
}

/** The ministry selected in Custom Service Admin is the source of truth. */
export function getEffectiveCustomServiceMinistryType(
  ministryType: string,
  _serviceName = "",
): string {
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
