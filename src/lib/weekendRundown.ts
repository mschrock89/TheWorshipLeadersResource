import { getCurrentResourceAppKey, hasOrgAdminPrivilegesForResourceApp } from "@/lib/resourceApp";

export const WEEKEND_RUNDOWN_STATUS_OPTIONS = [
  { value: "no_issues", label: "No Issues" },
  { value: "minor_issues", label: "Minor Issues" },
  { value: "no_distractions", label: "No Distractions" },
  { value: "dumpster_fire", label: "Dumpster Fire" },
] as const;

export const GOOD_FIT_LABEL = "good_fit";

export type WeekendRundownStatus = (typeof WEEKEND_RUNDOWN_STATUS_OPTIONS)[number]["value"];

export interface WeekendRundownDraft {
  overallStatus: WeekendRundownStatus;
  notes: string;
  songNotes: Record<string, string>;
  vocalNotes: Record<string, string>;
  vocalFitLabels: Record<string, string | null>;
  savedAt: string;
}

function getWeekendRundownDraftKey(userId: string, campusId: string, weekendDate: string) {
  return `weekend-rundown-draft:${getCurrentResourceAppKey()}:${userId}:${campusId}:${weekendDate}`;
}

export function loadWeekendRundownDraft(
  userId: string | undefined,
  campusId: string | null | undefined,
  weekendDate: string,
): WeekendRundownDraft | null {
  if (typeof window === "undefined" || !userId || !campusId) return null;

  const raw = window.localStorage.getItem(getWeekendRundownDraftKey(userId, campusId, weekendDate));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WeekendRundownDraft;
  } catch {
    window.localStorage.removeItem(getWeekendRundownDraftKey(userId, campusId, weekendDate));
    return null;
  }
}

export function saveWeekendRundownDraft(
  userId: string | undefined,
  campusId: string | null | undefined,
  weekendDate: string,
  draft: Omit<WeekendRundownDraft, "savedAt">,
) {
  if (typeof window === "undefined" || !userId || !campusId) return;

  window.localStorage.setItem(
    getWeekendRundownDraftKey(userId, campusId, weekendDate),
    JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
  );
}

export function clearWeekendRundownDraft(
  userId: string | undefined,
  campusId: string | null | undefined,
  weekendDate: string,
) {
  if (typeof window === "undefined" || !userId || !campusId) return;
  window.localStorage.removeItem(getWeekendRundownDraftKey(userId, campusId, weekendDate));
}

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
