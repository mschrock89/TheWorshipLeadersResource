import { addDays, isSaturday, isSunday, nextSaturday, nextSunday, subDays } from "date-fns";
import { formatDateForDB, parseLocalDate } from "./dateUtils.ts";

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
/**
 * Team Builder groups a weekend onto one date. Dual-day campuses keep Saturday.
 * A Sunday-only campus such as Shelbyville keeps Sunday, including when an
 * older fill was saved on the Saturday before that service.
 */
export function teamBuilderWeekendBucketKey(
  dateStr: string,
  campus: CampusWeekendDays | null | undefined,
): string {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();
  if (day !== 0 && day !== 6) return dateStr;

  if (weekendPlanWeekday(campus) === 0) {
    return day === 0 ? dateStr : formatDateForDB(addDays(date, 1));
  }

  return day === 6 ? dateStr : formatDateForDB(subDays(date, 1));
}

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
