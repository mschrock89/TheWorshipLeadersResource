import { formatDateForDB } from "./dateUtils.ts";

/** Church-local calendar used by schedule reminders and the swap cutoff. */
export const SWAP_NOTICE_TIME_ZONE = "America/Chicago";

/** A swap cannot be requested when the date is closer than this many days. */
export const SWAP_MINIMUM_NOTICE_DAYS = 7;

export const SWAP_NOTICE_ERROR =
  "Swap requests must be submitted at least 7 days before the date.";

/** YYYY-MM-DD for an instant in the church time zone. */
export function churchCalendarDate(
  now = new Date(),
  timeZone = SWAP_NOTICE_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function toSwapDateString(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return formatDateForDB(date);
}

/** Whole church-calendar days from today until the swap date. Negative if past. */
export function daysUntilSwapDate(
  date: Date | string,
  today = churchCalendarDate(),
): number {
  const [year, month, day] = toSwapDateString(date).split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/** True when the date is fewer than 7 days before the swap, including past dates. */
export function isSwapDateTooSoon(
  date: Date | string,
  now = new Date(),
): boolean {
  return daysUntilSwapDate(date, churchCalendarDate(now)) < SWAP_MINIMUM_NOTICE_DAYS;
}
