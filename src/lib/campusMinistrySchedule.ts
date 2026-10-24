import { CALENDAR_MINISTRY_FILTER_ORDER, MINISTRY_TYPES } from "./constants.ts";
import { parseLocalDate } from "./dateUtils.ts";

export type CampusWeekendTimes = {
  has_saturday_service?: boolean | null;
  has_sunday_service?: boolean | null;
  saturday_service_time?: string[] | null;
  sunday_service_time?: string[] | null;
};

export type MinistryServiceScheduleRow = {
  campus_id: string;
  ministry_type: string;
  day_of_week: number;
  service_times: string[];
};

export type DayScheduleDraft = {
  day: number;
  label: string;
  enabled: boolean;
  times: string[];
};

type WeekdayDefinition = {
  day: number;
  label: string;
  defaultTime: string;
};

const WEEKDAYS: WeekdayDefinition[] = [
  { day: 0, label: "Sunday", defaultTime: "10:00" },
  { day: 1, label: "Monday", defaultTime: "18:00" },
  { day: 2, label: "Tuesday", defaultTime: "18:00" },
  { day: 3, label: "Wednesday", defaultTime: "18:30" },
  { day: 4, label: "Thursday", defaultTime: "18:00" },
  { day: 5, label: "Friday", defaultTime: "18:00" },
  { day: 6, label: "Saturday", defaultTime: "17:00" },
];

/** Saturday and Sunday first, then the rest of the week. */
export const SERVICE_DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];

const WEEKEND_ALIGNED_MINISTRIES = new Set([
  "weekend",
  "weekend_team",
  "sunday_am",
  "production",
  "video",
  "speaker",
  "eon_weekend",
]);

const weekdayByDay = new Map(WEEKDAYS.map((day) => [day.day, day]));

export function normalizeServiceTime(value: string | null | undefined): string {
  return (value || "").trim().slice(0, 5);
}

export function scheduleMinistryType(ministryType: string | null | undefined): string | null {
  if (!ministryType || ministryType === "all") return null;
  if (ministryType === "weekend_team" || ministryType === "sunday_am") return "weekend";
  return ministryType;
}

export function ministryUsesCampusWeekendDefaults(ministryType: string | null | undefined): boolean {
  const ministry = scheduleMinistryType(ministryType);
  return ministry != null && WEEKEND_ALIGNED_MINISTRIES.has(ministry);
}

export const SERVICE_SCHEDULE_MINISTRY_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const labels = new Map<string, string>(
    MINISTRY_TYPES.filter((ministry) => !("hidden" in ministry && ministry.hidden) && ministry.value !== "weekend_team").map(
      (ministry) => [ministry.value, ministry.label],
    ),
  );
  const options: Array<{ value: string; label: string }> = [{ value: "weekend", label: "Weekend Services" }];
  for (const value of CALENDAR_MINISTRY_FILTER_ORDER) {
    if (value === "weekend_team") continue;
    const label = labels.get(value);
    if (!label) continue;
    options.push({ value, label });
    labels.delete(value);
  }
  for (const [value, label] of labels) {
    options.push({ value, label });
  }
  return options;
})();

export function serviceScheduleMinistryLabel(ministryType: string | null | undefined): string {
  return SERVICE_SCHEDULE_MINISTRY_OPTIONS.find((option) => option.value === ministryType)?.label || ministryType || "Ministry";
}

function normalizedTimes(times: string[] | null | undefined, fallback: string): string[] {
  const unique = [...new Set((times || []).map((time) => normalizeServiceTime(time)).filter(Boolean))].sort();
  return unique.length > 0 ? unique : [fallback];
}

function campusDayTimes(campus: CampusWeekendTimes | null | undefined, day: number): string[] | null {
  if (day === 6) {
    return campus?.has_saturday_service ? normalizedTimes(campus.saturday_service_time, "17:00") : null;
  }
  if (day === 0) {
    return campus?.has_sunday_service !== false ? normalizedTimes(campus?.sunday_service_time, "10:00") : null;
  }
  return null;
}

export function buildDayScheduleDrafts({
  ministryType,
  campus,
  rows,
}: {
  ministryType: string;
  campus?: CampusWeekendTimes | null;
  rows: MinistryServiceScheduleRow[];
}): DayScheduleDraft[] {
  const ministry = scheduleMinistryType(ministryType) || ministryType;
  const ministryRows = rows.filter((row) => row.ministry_type === ministry);
  const savedDays = new Map(ministryRows.map((row) => [row.day_of_week, row.service_times]));
  const hasSavedSchedule = ministryRows.length > 0;
  const inheritWeekend = !hasSavedSchedule && ministryUsesCampusWeekendDefaults(ministry);

  return SERVICE_DAY_ORDER.map((day) => {
    const definition = weekdayByDay.get(day)!;
    if (hasSavedSchedule) {
      const saved = savedDays.get(day);
      const times = saved ? normalizedTimes(saved, definition.defaultTime) : [definition.defaultTime];
      return {
        day,
        label: definition.label,
        enabled: Boolean(saved && saved.length > 0),
        times,
      };
    }
    const inherited = inheritWeekend ? campusDayTimes(campus, day) : null;
    return {
      day,
      label: definition.label,
      enabled: Boolean(inherited),
      times: inherited || [definition.defaultTime],
    };
  });
}

export function ministryScheduleIsInherited(
  ministryType: string,
  rows: MinistryServiceScheduleRow[],
): boolean {
  const ministry = scheduleMinistryType(ministryType) || ministryType;
  if (ministry === "weekend") return false;
  return rows.every((row) => row.ministry_type !== ministry) && ministryUsesCampusWeekendDefaults(ministry);
}

export function enabledScheduleRows(drafts: DayScheduleDraft[]): Array<{ day_of_week: number; service_times: string[] }> {
  return drafts
    .filter((draft) => draft.enabled)
    .map((draft) => ({
      day_of_week: draft.day,
      service_times: normalizedTimes(draft.times, ""),
    }))
    .filter((row) => row.service_times.length > 0 && row.service_times[0] !== "");
}

export function weekendColumnsFromDrafts(drafts: DayScheduleDraft[]) {
  const rows = enabledScheduleRows(drafts);
  const saturday = rows.find((row) => row.day_of_week === 6);
  const sunday = rows.find((row) => row.day_of_week === 0);
  return {
    has_saturday_service: Boolean(saturday),
    has_sunday_service: Boolean(sunday),
    saturday_service_time: saturday?.service_times ?? null,
    sunday_service_time: sunday?.service_times ?? null,
  };
}

export function recurringServiceTimesForDate(
  rows: MinistryServiceScheduleRow[],
  campusId: string | null | undefined,
  ministryType: string | null | undefined,
  dateStr: string,
): string[] | null {
  const ministry = scheduleMinistryType(ministryType);
  if (!campusId || !ministry) return null;
  const ministryRows = rows.filter((row) => row.campus_id === campusId && row.ministry_type === ministry);
  if (ministryRows.length === 0) return null;
  const day = parseLocalDate(dateStr).getDay();
  const match = ministryRows.find((row) => row.day_of_week === day);
  return (match?.service_times || []).map((time) => normalizeServiceTime(time)).filter(Boolean);
}

export function configuredServiceWeekdays(
  rows: MinistryServiceScheduleRow[],
  campusId: string | null | undefined,
  ministryType: string | null | undefined,
): number[] | null {
  const ministry = scheduleMinistryType(ministryType);
  if (!campusId || !ministry) return null;
  const days = rows
    .filter((row) => row.campus_id === campusId && row.ministry_type === ministry && row.service_times.length > 0)
    .map((row) => row.day_of_week);
  return days.length > 0 ? days : null;
}

export function configuredMinistryTypes(
  rows: MinistryServiceScheduleRow[],
  campusId: string,
): string[] {
  const ministries = new Set<string>();
  for (const row of rows) {
    if (row.campus_id === campusId && row.ministry_type !== "weekend" && row.service_times.length > 0) {
      ministries.add(row.ministry_type);
    }
  }
  return SERVICE_SCHEDULE_MINISTRY_OPTIONS
    .map((option) => option.value)
    .filter((value) => ministries.has(value));
}
