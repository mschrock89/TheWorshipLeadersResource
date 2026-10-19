const WEEKEND_SERVICE_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);

export type ServiceFlowClockItem = {
  id: string;
  item_type: string;
  title: string;
  duration_seconds: number | null;
  notes?: string | null;
  song?: { title?: string | null } | null;
};

const SERVICE_START_LINE = /(?:^|\n)[ \t]*SERVICE START[ \t]*(?=\n|$)/i;

/** The service start time is the end of a line marked SERVICE START. */
export function itemMarksServiceStart(item: { notes?: string | null }) {
  return SERVICE_START_LINE.test(item.notes || "");
}

export function notesWithoutServiceStart(notes: string | null | undefined) {
  if (!notes) return "";
  return notes
    .replace(/(?:^|\n)[ \t]*SERVICE START[ \t]*(?=\n|$)/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function notesWithServiceStart(notes: string | null | undefined, enabled: boolean) {
  if (!enabled) {
    const stripped = notesWithoutServiceStart(notes);
    return stripped || null;
  }
  if (itemMarksServiceStart({ notes })) return notes?.trim() || "SERVICE START";
  const base = (notes || "").trim();
  return base ? `${base}\nSERVICE START` : "SERVICE START";
}

/** Other lines to clear when this line becomes the one that ends at the service start. */
export function otherServiceStartClears<T extends { id: string; notes?: string | null }>(
  items: T[],
  itemId: string,
  nextNotes: string | null | undefined,
): Array<{ id: string; notes: string | null }> {
  if (nextNotes === undefined || !itemMarksServiceStart({ notes: nextNotes })) return [];
  return items
    .filter((item) => item.id !== itemId && itemMarksServiceStart(item))
    .map((item) => ({ id: item.id, notes: notesWithServiceStart(item.notes, false) }));
}

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

/**
 * Index of the first playable line that begins at the service start.
 * A marked line wins: the service begins when that line ends.
 * Otherwise the first line under a Start header begins at the service start.
 * With neither, the rundown starts on the first line.
 */
export function serviceClockOriginIndex(items: ServiceFlowClockItem[]): number {
  const markedIndex = items.findIndex(
    (item) => item.item_type !== "header" && itemMarksServiceStart(item),
  );
  if (markedIndex >= 0) {
    for (let index = markedIndex + 1; index < items.length; index += 1) {
      if (items[index].item_type !== "header") return index;
    }
    return items.length;
  }

  let seenStartHeader = false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.item_type === "header") {
      if (isServiceStartHeader(item.title)) seenStartHeader = true;
      continue;
    }
    if (seenStartHeader) return index;
  }

  return 0;
}

/** The line that finishes at the service start, such as Pre-Roll. */
export function serviceStartBoundaryItem<T extends ServiceFlowClockItem>(items: T[]): T | null {
  const origin = serviceClockOriginIndex(items);
  for (let index = origin - 1; index >= 0; index -= 1) {
    if (items[index].item_type !== "header") return items[index];
  }
  return null;
}

export function flowMarksServiceStart(items: ServiceFlowClockItem[]) {
  return items.some((item) =>
    item.item_type === "header" ? isServiceStartHeader(item.title) : itemMarksServiceStart(item),
  );
}

function serviceTimeOverrideMatches(overrideMinistryType: string, ministryType: string): boolean {
  if (overrideMinistryType === ministryType) return true;
  return WEEKEND_SERVICE_TYPES.has(overrideMinistryType) && WEEKEND_SERVICE_TYPES.has(ministryType);
}

function uniqueClockTimes(values?: Array<string | null> | null): string[] {
  const times = (values || [])
    .map(normalizeClockSource)
    .filter((time): time is string => Boolean(time));
  return [...new Set(times)].sort();
}

/** Every start time for this campus and date, earliest first. */
export function listScheduledServiceTimes(source: ScheduledServiceStartSource): string[] {
  const customServiceStartTime = normalizeClockSource(source.customServiceStartTime);
  if (customServiceStartTime) return [customServiceStartTime];

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

  const overrideTimes = uniqueClockTimes(matchingOverride?.service_times);
  if (overrideTimes.length > 0) return overrideTimes;

  if (!source.campus || !WEEKEND_SERVICE_TYPES.has(source.ministryType)) return [];

  const [year, month, day] = source.serviceDate.split("-").map(Number);
  const serviceDate = new Date(year, (month || 1) - 1, day || 1);
  const dayOfWeek = serviceDate.getDay();
  const defaultTimes =
    dayOfWeek === 6
      ? source.campus.saturday_service_time
      : dayOfWeek === 0
        ? source.campus.sunday_service_time
        : [];

  return uniqueClockTimes(defaultTimes);
}

export function resolveScheduledServiceStartTime(source: ScheduledServiceStartSource): string | null {
  return listScheduledServiceTimes(source)[0] || null;
}

export type ServiceFlowSpan = {
  preServiceSeconds: number;
  serviceDurationSeconds: number;
};

/** How long pre-service runs before the service begins, and how long the service itself runs. */
export function measureServiceFlowSpan(items: ServiceFlowClockItem[]): ServiceFlowSpan {
  const startItemIndex = serviceClockOriginIndex(items);

  let preServiceSeconds = 0;
  for (let index = 0; index < startItemIndex; index += 1) {
    const item = items[index];
    if (item.item_type === "header") continue;
    preServiceSeconds += item.duration_seconds || 0;
  }

  let serviceDurationSeconds = 0;
  for (let index = startItemIndex; index < items.length; index += 1) {
    const item = items[index];
    if (item.item_type === "header") continue;
    serviceDurationSeconds += item.duration_seconds || 0;
  }

  return { preServiceSeconds, serviceDurationSeconds };
}

export function localClockSeconds(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

/**
 * Today's rundown follows the campus and ministry schedule. A saved flow time
 * is only a fallback when this date has no scheduled starts, or when Live is
 * open on another day.
 */
export function resolveLiveServiceStartTime({
  scheduledTimes,
  savedStartTime,
  nowSeconds,
  serviceDate,
  today,
  span,
}: {
  scheduledTimes: string[];
  savedStartTime?: string | null;
  nowSeconds: number;
  serviceDate: string;
  today: string;
  span?: Partial<ServiceFlowSpan>;
}): string | null {
  if (scheduledTimes.length > 0 && serviceDate === today) {
    return selectServiceTimeForLocalClock(scheduledTimes, nowSeconds, span);
  }
  return normalizeClockSource(savedStartTime) || scheduledTimes[0] || null;
}

/**
 * A pre-roll cue may shift this service's clocks. A cue from an earlier
 * service must not keep the rundown on that service after the clock moves on.
 */
export function liveClockAnchorApplies(
  anchorServiceStartSeconds: number,
  selectedStart: string | null,
  scheduledTimes: string[],
): boolean {
  const selected = clockSourceToSeconds(selectedStart);
  if (selected == null || !Number.isFinite(anchorServiceStartSeconds)) return false;
  const delta = Math.abs(anchorServiceStartSeconds - selected);
  const otherDistances = uniqueClockTimes(scheduledTimes)
    .map(clockSourceToSeconds)
    .filter((seconds): seconds is number => seconds != null && seconds !== selected)
    .map((seconds) => Math.abs(anchorServiceStartSeconds - seconds));
  const nearestOther = otherDistances.length > 0 ? Math.min(...otherDistances) : Number.POSITIVE_INFINITY;
  const limit = nearestOther === Number.POSITIVE_INFINITY ? 45 * 60 : Math.max(45 * 60, nearestOther / 2);
  return delta <= limit && delta <= nearestOther;
}

/**
 * Which service the local clock is in. The next service takes over when its
 * pre-service begins. Before the first service, and after the last one ends,
 * the nearest service stays selected.
 */
export function selectServiceTimeForLocalClock(
  serviceTimes: string[],
  nowSeconds: number,
  span: Partial<ServiceFlowSpan> = {},
): string | null {
  const starts = uniqueClockTimes(serviceTimes)
    .map((label) => ({ label, seconds: clockSourceToSeconds(label) }))
    .filter((start): start is { label: string; seconds: number } => start.seconds !== null)
    .sort((a, b) => a.seconds - b.seconds);

  if (starts.length === 0) return null;
  if (starts.length === 1) return starts[0].label;

  const preServiceSeconds = Math.max(0, span.preServiceSeconds || 0);
  const serviceDurationSeconds = Math.max(0, span.serviceDurationSeconds || 0);
  const windows = starts.map((start, index) => {
    const opensAt = start.seconds - preServiceSeconds;
    const next = starts[index + 1];
    const closesAt = next
      ? next.seconds - preServiceSeconds
      : serviceDurationSeconds > 0
        ? start.seconds + serviceDurationSeconds
        : Number.POSITIVE_INFINITY;
    return { label: start.label, opensAt, closesAt };
  });

  if (nowSeconds < windows[0].opensAt) return windows[0].label;

  const active = windows.find((window) => nowSeconds >= window.opensAt && nowSeconds < window.closesAt);
  return active?.label || windows[windows.length - 1].label;
}

export type ServiceFlowClockOptions = {
  /**
   * Wall-clock seconds when the line that ends at the service start actually
   * began, such as the Pre-Roll MIDI note. Shifts every rundown time.
   */
  boundaryStartedAtSeconds?: number | null;
};

/**
 * Clock for each rundown line. The entered time is the service start.
 * A line marked "service starts at the end" finishes at that time, so iPod
 * and Pre-Roll before it count backward. Otherwise the first line under a
 * Start header begins at that time. With neither, the first line starts then.
 */
export function buildServiceFlowClockTimes(
  items: ServiceFlowClockItem[],
  startTime?: string | null,
  options?: ServiceFlowClockOptions,
): Map<string, string> {
  const clockMap = new Map<string, string>();
  const startItemIndex = serviceClockOriginIndex(items);
  const boundary = serviceStartBoundaryItem(items);
  const liveStart = options?.boundaryStartedAtSeconds;
  let startSeconds = clockSourceToSeconds(startTime);
  if (liveStart != null && boundary && startItemIndex > 0) {
    startSeconds = liveStart + (boundary.duration_seconds || 0);
  }
  if (startSeconds === null) return clockMap;

  let secondsBeforeServiceStart = 0;
  for (let index = 0; index < startItemIndex; index += 1) {
    const item = items[index];
    if (item.item_type === "header") continue;
    secondsBeforeServiceStart += item.duration_seconds || 0;
  }

  let runningSeconds = startSeconds - secondsBeforeServiceStart;

  for (const item of items) {
    if (item.item_type === "header") continue;
    clockMap.set(item.id, formatClockTime(runningSeconds));
    runningSeconds += item.duration_seconds || 0;
  }

  return clockMap;
}
