export const WEEKEND_RUNDOWN_STATUS_OPTIONS = [
  { value: "no_issues", label: "No Issues" },
  { value: "minor_issues", label: "Minor Issues" },
  { value: "no_distractions", label: "No Distractions" },
  { value: "dumpster_fire", label: "Dumpster Fire" },
] as const;

export const GOOD_FIT_LABEL = "good_fit";

const WEEKEND_RUNDOWN_ADMIN_ROLES = new Set([
  "admin",
  "campus_admin",
]);

export function canAccessWeekendRundown(roleNames: string[]) {
  return roleNames.some((role) => WEEKEND_RUNDOWN_ADMIN_ROLES.has(role));
}

export function canReviewWeekendSongs(roleNames: string[]) {
  return roleNames.some((role) => WEEKEND_RUNDOWN_ADMIN_ROLES.has(role));
}

export function getWeekendRundownTargetSunday(now = new Date()) {
  const thisSunday = new Date(now);
  thisSunday.setDate(now.getDate() - now.getDay());
  thisSunday.setHours(0, 0, 0, 0);

  const unlockTime = new Date(thisSunday);
  unlockTime.setHours(13, 45, 0, 0);

  if (now.getDay() === 0 && now < unlockTime) {
    thisSunday.setDate(thisSunday.getDate() - 7);
  }

  return thisSunday;
}

export function getWeekendPlanDate(
  weekendSunday: Date,
  campus?: { has_saturday_service?: boolean | null; has_sunday_service?: boolean | null } | null,
) {
  const planDate = new Date(weekendSunday);
  const usesWeekendPair = Boolean(campus?.has_saturday_service && campus?.has_sunday_service);

  if (usesWeekendPair) {
    planDate.setDate(planDate.getDate() - 1);
  }

  return planDate;
}
