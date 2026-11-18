import { isBlankTeamBuilderAssignment } from "./teamBuilderBlankSlot.ts";
import { getWeekendPairDate } from "./utils.ts";

export type WeekendServiceDay = "saturday" | "sunday";

export function getServiceDayForDate(dateStr: string): WeekendServiceDay | null {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

export function filterDatesForServiceDay<T extends string>(
  dates: T[],
  serviceDay: WeekendServiceDay | null | undefined,
): T[] {
  if (!serviceDay) return dates;
  return dates.filter((date) => getServiceDayForDate(date) === serviceDay);
}

/**
 * A Saturday override must not fill Sunday, and the reverse.
 * Overrides on a non-weekend date (for example Friday) can still cover the
 * related weekend day when that day has no override of its own.
 */
export function overrideAppliesToRosterDate(overrideDate: string, rosterDate: string): boolean {
  if (overrideDate === rosterDate) return true;

  const rosterDay = getServiceDayForDate(rosterDate);
  const overrideDay = getServiceDayForDate(overrideDate);
  if (rosterDay && overrideDay && rosterDay !== overrideDay) return false;

  return true;
}

/**
 * Sunday-only campuses saved some fills on the Saturday key Team Builder used
 * to group the weekend. Those fills belong on Sunday. A campus that also meets
 * Saturday keeps Saturday and Sunday separate.
 */
export function overrideAppliesToCampusService(
  overrideDate: string,
  rosterDate: string,
  campus?: { has_saturday_service?: boolean | null; has_sunday_service?: boolean | null } | null,
): boolean {
  if (overrideAppliesToRosterDate(overrideDate, rosterDate)) return true;

  const sundayOnly = !!campus && campus.has_sunday_service !== false && campus.has_saturday_service !== true;
  if (!sundayOnly) return false;
  if (getServiceDayForDate(rosterDate) !== "sunday" || getServiceDayForDate(overrideDate) !== "saturday") {
    return false;
  }
  return getWeekendPairDate(overrideDate) === rosterDate;
}

export function assignmentsAreSamePerson(
  a?: { user_id?: string | null; member_name?: string | null } | null,
  b?: { user_id?: string | null; member_name?: string | null } | null,
): boolean {
  if (!a || !b) return false;
  const aBlank = isBlankTeamBuilderAssignment(a);
  const bBlank = isBlankTeamBuilderAssignment(b);
  if (aBlank || bBlank) return aBlank && bBlank;
  if (a.user_id && b.user_id) return a.user_id === b.user_id;
  return (a.member_name || "").trim().toLowerCase() === (b.member_name || "").trim().toLowerCase();
}
