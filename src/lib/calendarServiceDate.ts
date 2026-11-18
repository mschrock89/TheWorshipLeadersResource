import { formatDateForDB, parseLocalDate } from "./dateUtils.ts";

/** Nearest known service to today. A future date wins a tie. Today is used when nothing is scheduled. */
export function closestCalendarServiceDate(from: Date, knownDates: Array<string | null | undefined>): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const todayStr = formatDateForDB(today);
  const todayMs = today.getTime();
  let best: { date: string; distance: number; upcoming: boolean } | null = null;

  for (const value of knownDates) {
    if (!value) continue;
    const parsed = parseLocalDate(value);
    if (Number.isNaN(parsed.getTime())) continue;
    const distance = Math.abs(parsed.getTime() - todayMs);
    const upcoming = value >= todayStr;
    if (
      !best
      || distance < best.distance
      || (distance === best.distance && upcoming && !best.upcoming)
    ) {
      best = { date: value, distance, upcoming };
    }
  }

  return best ? parseLocalDate(best.date) : today;
}
