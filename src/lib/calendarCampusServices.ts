import {
  getViewMinistryLabel,
  isNetworkWideMinistryType,
  isSessionSetMinistryType,
  normalizeSessionSetMinistryType,
} from "./constants.ts";
import {
  configuredServiceWeekdays,
  ministryUsesCampusWeekendDefaults,
  normalizeServiceTime,
  recurringServiceTimesForDate,
  scheduleMinistryType,
  type CampusWeekendTimes,
  type MinistryServiceScheduleRow,
} from "./campusMinistrySchedule.ts";
import { calendarLinkedMinistries, isSeparateProductionMinistry } from "./linkedProduction.ts";

export type CalendarCampusService = {
  key: string;
  label: string;
  /** Ministry passed to the roster query. */
  rosterMinistry: string;
  /** Ministry passed to the setlist query. */
  songMinistry: string;
  timeOfDay: string | null;
  times: string[];
};

type ScheduleEntryLike = {
  ministry_type?: string | null;
  time_of_day?: string | null;
};

type ServiceOverrideLike = {
  ministry_type?: string | null;
  service_times?: string[] | null;
};

const SESSION_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function uniqueTimes(times: Array<string | null | undefined>) {
  return [...new Set(times.map((time) => normalizeServiceTime(time)).filter(Boolean))].sort();
}

function inheritedWeekendTimes(campus: CampusWeekendTimes | null | undefined, day: number) {
  if (!campus) return null;
  if (day === 6) {
    if (!campus.has_saturday_service) return null;
    const times = uniqueTimes(campus.saturday_service_time || []);
    return times.length > 0 ? times : ["17:00"];
  }
  if (day === 0) {
    if (campus.has_sunday_service === false) return null;
    const times = uniqueTimes(campus.sunday_service_time || []);
    return times.length > 0 ? times : ["10:00"];
  }
  return null;
}

/** A schedule or override row belongs to this campus service view. */
export function calendarEntryMatchesView(
  entryMinistry: string | null | undefined,
  view: string | null | undefined,
) {
  if (!entryMinistry || !view) return false;
  const sessionEntry = normalizeSessionSetMinistryType(entryMinistry) || entryMinistry;
  const sessionView = normalizeSessionSetMinistryType(view) || view;
  const linked = calendarLinkedMinistries(view) || calendarLinkedMinistries(sessionView);
  if (linked) {
    return linked.includes(entryMinistry) || linked.includes(sessionEntry);
  }
  if (view === "weekend_team" || view === "weekend" || view === "sunday_am") {
    return sessionEntry === "weekend" || sessionEntry === "sunday_am" || sessionEntry === "weekend_team";
  }
  return entryMinistry === view || sessionEntry === sessionView;
}

export function isCalendarSupportMinistry(ministryType: string | null | undefined) {
  return (
    isSeparateProductionMinistry(ministryType) ||
    ministryType === "video" ||
    ministryType === "speaker"
  );
}

function sessionLabel(timeOfDay: string) {
  return timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1);
}

/**
 * Every worship service a campus holds on this date, in ministry order.
 * Production and video stay inside the worship service they serve.
 * Network-wide camps show up only on dates that are actually scheduled.
 */
export function listCalendarCampusServices({
  date,
  campusId,
  campus,
  viewMinistries,
  schedules,
  scheduleEntries,
  overrides = [],
}: {
  date: Date;
  campusId: string | null;
  campus: CampusWeekendTimes | null;
  viewMinistries: readonly string[];
  schedules: MinistryServiceScheduleRow[];
  scheduleEntries: readonly ScheduleEntryLike[];
  overrides?: readonly ServiceOverrideLike[];
}): CalendarCampusService[] {
  const day = date.getDay();
  const dateKey = localDateKey(date);
  const services: CalendarCampusService[] = [];

  for (const view of viewMinistries) {
    if (!view || view === "audition") continue;
    const ministry = scheduleMinistryType(view) || view;
    const matching = scheduleEntries.filter((entry) => calendarEntryMatchesView(entry.ministry_type, view));
    const recurring = campusId
      ? recurringServiceTimesForDate(schedules, campusId, ministry, dateKey)
      : null;
    const inherited =
      recurring == null && ministryUsesCampusWeekendDefaults(view)
        ? inheritedWeekendTimes(campus, day)
        : null;
    const overrideTimes = uniqueTimes(
      overrides
        .filter((override) => calendarEntryMatchesView(override.ministry_type, view))
        .flatMap((override) => override.service_times || []),
    );
    const clockTimes = uniqueTimes([...(recurring && recurring.length > 0 ? recurring : inherited || []), ...overrideTimes]);
    const networkWide = isNetworkWideMinistryType(ministry);
    const meets = matching.length > 0 || clockTimes.length > 0;
    if (!meets) continue;
    if (networkWide && matching.length === 0 && overrideTimes.length === 0) continue;

    const sessionTimes = isSessionSetMinistryType(view)
      ? [...new Set(matching.map((entry) => entry.time_of_day).filter((time): time is string => Boolean(time)))]
          .sort((a, b) => (SESSION_ORDER[a] ?? 99) - (SESSION_ORDER[b] ?? 99))
      : [];
    const base = normalizeSessionSetMinistryType(view) || view;

    if (sessionTimes.length > 0) {
      for (const timeOfDay of sessionTimes) {
        services.push({
          key: `${base}|${timeOfDay}`,
          label: `${getViewMinistryLabel(base)} · ${sessionLabel(timeOfDay)}`,
          rosterMinistry: base,
          songMinistry: `${base}_${timeOfDay}`,
          timeOfDay,
          times: clockTimes,
        });
      }
      continue;
    }

    services.push({
      key: view,
      label: getViewMinistryLabel(view),
      rosterMinistry: view,
      songMinistry: view,
      timeOfDay: null,
      times: clockTimes,
    });
  }

  return services;
}

export function calendarEntriesForService<T extends ScheduleEntryLike>(
  entries: readonly T[],
  service: Pick<CalendarCampusService, "rosterMinistry" | "songMinistry" | "timeOfDay">,
): T[] {
  return entries.filter((entry) => {
    const matches =
      calendarEntryMatchesView(entry.ministry_type, service.rosterMinistry) ||
      calendarEntryMatchesView(entry.ministry_type, service.songMinistry);
    if (!matches) return false;
    if (!service.timeOfDay) return true;
    if (entry.time_of_day) return entry.time_of_day === service.timeOfDay;
    return isCalendarSupportMinistry(entry.ministry_type);
  });
}

/** Weekdays any campus ministry meets, so the calendar can open on the next service. */
export function calendarCampusServiceWeekdays({
  campusId,
  campus,
  viewMinistries,
  schedules,
}: {
  campusId: string | null;
  campus: CampusWeekendTimes | null;
  viewMinistries: readonly string[];
  schedules: MinistryServiceScheduleRow[];
}): number[] {
  if (!campusId) return [];
  const days = new Set<number>();
  for (const view of viewMinistries) {
    if (!view || view === "audition") continue;
    const ministry = scheduleMinistryType(view) || view;
    if (isNetworkWideMinistryType(ministry)) continue;
    const configured = configuredServiceWeekdays(schedules, campusId, ministry);
    if (configured && configured.length > 0) {
      configured.forEach((day) => days.add(day));
      continue;
    }
    if (!ministryUsesCampusWeekendDefaults(view) || !campus) continue;
    if (campus.has_saturday_service) days.add(6);
    if (campus.has_sunday_service !== false) days.add(0);
  }
  return [...days].sort((a, b) => a - b);
}
