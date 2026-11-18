import { addDays, isSaturday, isSunday, nextSaturday, nextSunday, subDays } from "date-fns";

export type CampusWeekendDays = {
  has_saturday_service?: boolean | null;
  has_sunday_service?: boolean | null;
};

/** Saturday when the campus meets Saturday. Sunday when it meets Sunday only. */
export function weekendPlanWeekday(campus: CampusWeekendDays | null | undefined): 0 | 6 {
  const saturday = campus?.has_saturday_service === true;
  const sunday = campus ? campus.has_sunday_service !== false : true;
  if (campus && sunday && !saturday) return 0;
  return 6;
}

/**
 * Set Builder stores one date for a weekend. Dual-day campuses keep Saturday.
 * A Sunday-only campus such as Shelbyville keeps Sunday, which is the day
 * Team Builder, the calendar, and the roster actually use.
 */
export function anchorWeekendPlanDate(date: Date, campus: CampusWeekendDays | null | undefined): Date {
  if (weekendPlanWeekday(campus) === 0) {
    if (isSunday(date)) return date;
    if (isSaturday(date)) return addDays(date, 1);
    return nextSunday(date);
  }

  if (isSaturday(date)) return date;
  if (isSunday(date)) return subDays(date, 1);
  return nextSaturday(date);
}
