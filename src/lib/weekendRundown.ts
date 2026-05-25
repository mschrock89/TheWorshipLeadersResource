import { hasOrgAdminPrivilegesForResourceApp } from "@/lib/resourceApp";

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
  return hasOrgAdminPrivilegesForResourceApp(roleNames) || roleNames.some((role) => WEEKEND_RUNDOWN_ADMIN_ROLES.has(role));
}

export function canReviewWeekendSongs(roleNames: string[]) {
  return hasOrgAdminPrivilegesForResourceApp(roleNames) || roleNames.some((role) => WEEKEND_RUNDOWN_ADMIN_ROLES.has(role));
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

export function getWednesdayRundownTargetDate(now = new Date()) {
  const targetWednesday = new Date(now);
  const daysSinceWednesday = (now.getDay() + 4) % 7;
  targetWednesday.setDate(now.getDate() - daysSinceWednesday);
  targetWednesday.setHours(0, 0, 0, 0);

  const unlockTime = new Date(targetWednesday);
  unlockTime.setHours(21, 0, 0, 0);

  if (now.getDay() === 3 && now < unlockTime) {
    targetWednesday.setDate(targetWednesday.getDate() - 7);
  }

  return targetWednesday;
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
