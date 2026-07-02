import { createClient } from "npm:@supabase/supabase-js@2";

export interface CampusWeekendServiceConfig {
  has_saturday_service?: boolean | null;
  has_sunday_service?: boolean | null;
}

type SupabaseClient = ReturnType<typeof createClient>;

const MINISTRY_LABELS: Record<string, string> = {
  production: "Production",
  video: "Video",
};

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateForDB(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isWeekend(dateStr: string): boolean {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

export function getWeekendKey(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();

  if (day === 0) {
    const saturday = new Date(date);
    saturday.setDate(date.getDate() - 1);
    return formatDateForDB(saturday);
  }
  if (day === 6) {
    return dateStr;
  }
  return dateStr;
}

export function getWeekendPairDate(dateStr: string): string | null {
  const date = parseLocalDate(dateStr);
  const day = date.getDay();

  if (day === 6) {
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + 1);
    return formatDateForDB(sunday);
  }
  if (day === 0) {
    const saturday = new Date(date);
    saturday.setDate(date.getDate() - 1);
    return formatDateForDB(saturday);
  }
  return null;
}

export function campusHasServiceOnDate(
  campus: CampusWeekendServiceConfig | undefined | null,
  dateStr: string,
): boolean {
  if (!campus) return true;
  const dayOfWeek = parseLocalDate(dateStr).getDay();
  if (dayOfWeek === 6) return !!campus.has_saturday_service;
  if (dayOfWeek === 0) return !!campus.has_sunday_service;
  return true;
}

export function formatWeekendDateRangeNatural(
  saturdayDate: string,
  sundayDate: string,
  campus?: CampusWeekendServiceConfig | null,
): string {
  const satDate = parseLocalDate(saturdayDate);
  const sunDate = parseLocalDate(sundayDate);
  const showSaturday =
    saturdayDate !== sundayDate && campusHasServiceOnDate(campus, saturdayDate);
  const showSunday =
    saturdayDate !== sundayDate && campusHasServiceOnDate(campus, sundayDate);

  const formatMonthLong = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "long" });
  const formatDay = (date: Date) => date.getDate();

  if (showSaturday && showSunday) {
    if (satDate.getMonth() === sunDate.getMonth()) {
      return `${formatMonthLong(satDate)} ${formatDay(satDate)}-${formatDay(sunDate)}`;
    }
    return `${formatMonthLong(satDate)} ${formatDay(satDate)} - ${formatMonthLong(sunDate)} ${formatDay(sunDate)}`;
  }
  if (showSunday) {
    return sunDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }
  if (showSaturday) {
    return satDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }
  return sunDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function formatWeekendGroupDateLabelCompact(
  saturdayDate: string,
  sundayDate: string,
  campus?: CampusWeekendServiceConfig | null,
): string {
  return formatWeekendDateRangeNatural(saturdayDate, sundayDate, campus);
}

export function getWeekendScheduleDates(
  scheduleDate: string,
  campus?: CampusWeekendServiceConfig | null,
): string[] {
  if (!isWeekend(scheduleDate)) {
    return [scheduleDate];
  }

  const saturday = getWeekendKey(scheduleDate);
  const sunday = getWeekendPairDate(saturday) || scheduleDate;
  const dates: string[] = [];

  if (campusHasServiceOnDate(campus, saturday)) {
    dates.push(saturday);
  }
  if (sunday !== saturday && campusHasServiceOnDate(campus, sunday)) {
    dates.push(sunday);
  }

  return dates.length > 0 ? dates : [scheduleDate];
}

function formatLongServiceDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatSingleDayLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

const WEEKEND_SETLIST_MINISTRIES = ["weekend", "weekend_team", "sunday_am", "speaker"];

export interface SupportTeamPushContent {
  title: string;
  message: string;
  link: string;
  actions: Array<{ action: string; title: string }>;
}

export async function resolveSetlistConfirmLink(
  supabase: SupabaseClient,
  params: {
    campusId: string;
    scheduleDate: string;
    campus?: CampusWeekendServiceConfig | null;
  },
): Promise<string> {
  const dates = getWeekendScheduleDates(params.scheduleDate, params.campus);

  const { data: setlists, error } = await supabase
    .from("draft_sets")
    .select("id, ministry_type, plan_date")
    .eq("campus_id", params.campusId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .in("plan_date", dates)
    .in("ministry_type", WEEKEND_SETLIST_MINISTRIES);

  if (error || !setlists?.length) {
    return "/my-setlists?confirm=1";
  }

  const sorted = [...setlists].sort((a, b) => {
    const aWeight = a.ministry_type === "weekend_team" ? 0 : 1;
    const bWeight = b.ministry_type === "weekend_team" ? 0 : 1;
    if (aWeight !== bWeight) return aWeight - bWeight;
    return a.plan_date.localeCompare(b.plan_date);
  });

  return `/my-setlists?setId=${sorted[0].id}&confirm=1`;
}

export function buildSupportTeamPushContent(params: {
  ministryType: "production" | "video";
  teamName: string;
  scheduleDate: string;
  campus?: CampusWeekendServiceConfig | null;
  confirmLink?: string;
}): SupportTeamPushContent {
  const ministryLabel = MINISTRY_LABELS[params.ministryType] || params.ministryType;
  const link = params.confirmLink || "/my-setlists?confirm=1";
  const actions = [{ action: "confirm", title: "Confirm" }];

  if (params.ministryType === "video") {
    const formattedDate = formatLongServiceDate(params.scheduleDate);
    return {
      title: `${params.teamName} ${ministryLabel} — ${formattedDate}`,
      message:
        `You're scheduled to serve with ${params.teamName} ${ministryLabel} on ${formattedDate}. Confirm here.`,
      link,
      actions,
    };
  }

  if (isWeekend(params.scheduleDate)) {
    const saturday = getWeekendKey(params.scheduleDate);
    const sunday = getWeekendPairDate(saturday) || params.scheduleDate;
    const dateLabel = formatWeekendDateRangeNatural(saturday, sunday, params.campus);
    const showBothDays =
      saturday !== sunday &&
      campusHasServiceOnDate(params.campus, saturday) &&
      campusHasServiceOnDate(params.campus, sunday);

    return {
      title: `${params.teamName} ${ministryLabel} — ${dateLabel}`,
      message: showBothDays
        ? `You're scheduled to serve with ${params.teamName} ${ministryLabel} this weekend, ${dateLabel}. Confirm here.`
        : `You're scheduled to serve with ${params.teamName} ${ministryLabel} on ${dateLabel}. Confirm here.`,
      link,
      actions,
    };
  }

  const formattedDate = formatSingleDayLabel(params.scheduleDate);
  return {
    title: `${params.teamName} ${ministryLabel} — ${formattedDate}`,
    message:
      `You're scheduled to serve with ${params.teamName} ${ministryLabel} on ${formattedDate}. Confirm here.`,
    link,
    actions,
  };
}

export function getSupportTeamPushTag(params: {
  ministryType: "production" | "video";
  campusId: string;
  scheduleDate: string;
}): string {
  if (params.ministryType === "production" && isWeekend(params.scheduleDate)) {
    return `schedule-date-${params.ministryType}-${params.campusId}-${getWeekendKey(params.scheduleDate)}`;
  }
  return `schedule-date-${params.ministryType}-${params.campusId}-${params.scheduleDate}`;
}
