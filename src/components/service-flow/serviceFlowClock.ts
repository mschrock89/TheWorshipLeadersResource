const WEEKEND_SERVICE_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);

export type ServiceFlowClockItem = {
  id: string;
  item_type: string;
  title: string;
  duration_seconds: number | null;
  song?: { title?: string | null } | null;
};

export type ScheduledServiceStartSource = {
  customServiceStartTime?: string | null;
  serviceDate: string;
  ministryType: string;
  campusId?: string | null;
  campus?: {
    saturday_service_time: string[] | null;
    sunday_service_time: string[] | null;
  } | null;
  overrides?: Array<{
    campus_id: string | null;
    ministry_type?: string | null;
    service_date: string;
    service_times?: string[] | null;
  }>;
};

export function normalizeClockSource(value?: string | null): string | null {
  const normalized = value?.trim().slice(0, 5) || "";
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

export function clockSourceToSeconds(value?: string | null): number | null {
  const normalized = normalizeClockSource(value);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 3600 + minutes * 60;
}

export function formatClockTime(totalSeconds: number): string {
  const secondsInDay = 24 * 60 * 60;
  const normalizedSeconds = ((Math.round(totalSeconds / 60) * 60) % secondsInDay + secondsInDay) % secondsInDay;
  const hours24 = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function isServiceStartHeader(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "start" || normalized === "service start" || normalized === "start header";
}

function serviceTimeOverrideMatches(overrideMinistryType: string, ministryType: string): boolean {
  if (overrideMinistryType === ministryType) return true;
  return WEEKEND_SERVICE_TYPES.has(overrideMinistryType) && WEEKEND_SERVICE_TYPES.has(ministryType);
}

export function resolveScheduledServiceStartTime(source: ScheduledServiceStartSource): string | null {
  const customServiceStartTime = normalizeClockSource(source.customServiceStartTime);
  if (customServiceStartTime) return customServiceStartTime;

  const matchingOverride = (source.overrides || [])
    .filter((override) => {
      if (!source.campusId || override.campus_id !== source.campusId) return false;
      if (override.service_date !== source.serviceDate) return false;
      return serviceTimeOverrideMatches(override.ministry_type || "weekend", source.ministryType);
    })
    .sort((a, b) => {
      const aExact = (a.ministry_type || "weekend") === source.ministryType ? 0 : 1;
      const bExact = (b.ministry_type || "weekend") === source.ministryType ? 0 : 1;
      return aExact - bExact || (a.ministry_type || "").localeCompare(b.ministry_type || "");
    })[0];

  const overrideTime = matchingOverride?.service_times
    ?.map(normalizeClockSource)
    .filter((time): time is string => Boolean(time))
    .sort()[0];
  if (overrideTime) return overrideTime;

  if (!source.campus || !WEEKEND_SERVICE_TYPES.has(source.ministryType)) return null;

  const [year, month, day] = source.serviceDate.split("-").map(Number);
  const serviceDate = new Date(year, (month || 1) - 1, day || 1);
  const dayOfWeek = serviceDate.getDay();
  const defaultTimes =
    dayOfWeek === 6
      ? source.campus.saturday_service_time
      : dayOfWeek === 0
        ? source.campus.sunday_service_time
        : [];

  return (defaultTimes || [])
    .map(normalizeClockSource)
    .filter((time): time is string => Boolean(time))
    .sort()[0] || null;
}

/**
 * Clock for each rundown line. The entered time is the first item under the
 * Start header. Pre-service lines before that header count backward by their
 * durations. Later lines count forward. With no Start header, the first line
 * starts at the entered time.
 */
export function buildServiceFlowClockTimes(
  items: ServiceFlowClockItem[],
  startTime?: string | null,
): Map<string, string> {
  const clockMap = new Map<string, string>();
  const startSeconds = clockSourceToSeconds(startTime);
  if (startSeconds === null) return clockMap;

  let seenStartHeader = false;
  let startItemIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.item_type === "header") {
      if (isServiceStartHeader(item.title)) seenStartHeader = true;
      continue;
    }
    if (seenStartHeader) {
      startItemIndex = index;
      break;
    }
  }

  let secondsBeforeServiceStart = 0;
  if (startItemIndex >= 0) {
    for (let index = 0; index < startItemIndex; index += 1) {
      const item = items[index];
      if (item.item_type === "header") continue;
      secondsBeforeServiceStart += item.duration_seconds || 0;
    }
  }

  let runningSeconds = startItemIndex >= 0
    ? startSeconds - secondsBeforeServiceStart
    : startSeconds;

  for (const item of items) {
    if (item.item_type === "header") continue;
    clockMap.set(item.id, formatClockTime(runningSeconds));
    runningSeconds += item.duration_seconds || 0;
  }

  return clockMap;
}
