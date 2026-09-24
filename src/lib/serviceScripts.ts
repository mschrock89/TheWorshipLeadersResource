import { formatDateForDB, parseLocalDate } from "./dateUtils.ts";

export const SERVICE_SCRIPT_KINDS = ["announcement", "closing_prayer"] as const;

export type ServiceScriptKind = (typeof SERVICE_SCRIPT_KINDS)[number];

export type ServiceScriptStatus = "draft" | "sent";

export const SERVICE_SCRIPT_KIND_LABELS: Record<ServiceScriptKind, string> = {
  announcement: "Announcements",
  closing_prayer: "Closing Prayer",
};

const MANAGE_ROLES = new Set([
  "admin",
  "campus_admin",
  "network_worship_pastor",
  "network_worship_leader",
  "campus_worship_pastor",
  "campus_pastor",
  "student_worship_pastor",
  "student_pastor",
  "network_student_pastor",
  "childrens_pastor",
]);

const ANNOUNCEMENT_TOKENS = new Set([
  "announcement",
  "announcements",
  "annoucement",
  "annoucements",
  "anncouncement",
  "anncouncements",
]);

const CLOSING_PRAYER_TOKENS = new Set([
  "closing_prayer",
  "closer",
  "closingprayer",
]);

export interface ServiceScriptLike {
  script_kind: string;
  month_start: string;
  weekend_date: string | null;
  body: string;
  status: string;
  ministry_type?: string | null;
  campus_id?: string | null;
}

export interface ScheduledScriptSlot {
  scheduleDate: string;
  campusId: string | null;
  campusName: string | null;
  ministryType: string;
  position: string;
  teamName: string;
}

export interface ScriptAssignmentGroup {
  key: string;
  campusId: string;
  campusName: string | null;
  ministryType: string;
  kind: ServiceScriptKind;
  weekendKey: string;
  scheduleDate: string;
  teamNames: string[];
}

export function canManageServiceScripts(roleNames: string[]) {
  return roleNames.some((role) => MANAGE_ROLES.has(role));
}

export function normalizePositionToken(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function scriptKindForPosition(
  position?: string | null,
  positionSlot?: string | null,
): ServiceScriptKind | null {
  const tokens = [positionSlot, position].map(normalizePositionToken).filter(Boolean);
  if (tokens.some((token) => ANNOUNCEMENT_TOKENS.has(token))) return "announcement";
  if (tokens.some((token) => CLOSING_PRAYER_TOKENS.has(token))) return "closing_prayer";
  return null;
}

export function isWeekendDate(dateStr: string) {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

/** Saturday that identifies a Sat/Sun weekend. Other dates stay as themselves. */
export function weekendKeyForDate(dateStr: string) {
  const date = parseLocalDate(dateStr);
  if (date.getDay() !== 0) return dateStr;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() - 1);
  return formatDateForDB(saturday);
}

export function monthStartForDate(dateStr: string) {
  const date = parseLocalDate(dateStr);
  return formatDateForDB(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function currentMonthStart(now = new Date()) {
  return formatDateForDB(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function shiftMonthStart(monthStart: string, delta: number) {
  const date = parseLocalDate(monthStart);
  return formatDateForDB(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

export function weekendStartsInMonth(monthStart: string) {
  const start = parseLocalDate(monthStart);
  const cursor = new Date(start);
  const daysUntilSaturday = (6 - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + daysUntilSaturday);

  const saturdays: string[] = [];
  while (cursor.getMonth() === start.getMonth() && cursor.getFullYear() === start.getFullYear()) {
    saturdays.push(formatDateForDB(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return saturdays;
}

export function formatScriptMonthLabel(monthStart: string) {
  return parseLocalDate(monthStart).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatScriptWeekendLabel(saturday: string) {
  const start = parseLocalDate(saturday);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (start.getMonth() === end.getMonth()) {
    return `${startLabel}–${end.getDate()}`;
  }
  return `${startLabel}–${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function defaultScriptMinistry(resourceAppKey: string) {
  if (resourceAppKey === "students_hs") return "encounter";
  if (resourceAppKey === "students_ms") return "eon";
  return "speaker";
}

export function resolveEffectiveScript<T extends ServiceScriptLike>(
  scripts: T[],
  kind: ServiceScriptKind,
  scheduleDate: string,
  ministryType?: string | null,
  campusId?: string | null,
): { script: T | null; source: "week" | "month" | null } {
  const weekendKey = isWeekendDate(scheduleDate) ? weekendKeyForDate(scheduleDate) : scheduleDate;
  const monthStart = monthStartForDate(isWeekendDate(scheduleDate) ? weekendKey : scheduleDate);
  const relevant = scripts.filter((script) => {
    if (script.script_kind !== kind || script.status !== "sent" || !script.body.trim()) return false;
    if (ministryType && script.ministry_type && script.ministry_type !== ministryType) return false;
    if (campusId && script.campus_id && script.campus_id !== campusId) return false;
    return true;
  });

  if (isWeekendDate(scheduleDate)) {
    const weekly = relevant.find((script) => script.weekend_date === weekendKey);
    if (weekly) return { script: weekly, source: "week" };
  }

  const monthly = relevant.find((script) => !script.weekend_date && script.month_start === monthStart);
  if (monthly) return { script: monthly, source: "month" };
  return { script: null, source: null };
}

export function groupScriptAssignments(dates: ScheduledScriptSlot[]): ScriptAssignmentGroup[] {
  const groups = new Map<string, ScriptAssignmentGroup>();

  for (const date of dates) {
    const kind = scriptKindForPosition(date.position);
    if (!kind || !date.campusId) continue;

    const weekendKey = isWeekendDate(date.scheduleDate)
      ? weekendKeyForDate(date.scheduleDate)
      : date.scheduleDate;
    const key = `${date.campusId}:${date.ministryType}:${kind}:${weekendKey}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        campusId: date.campusId,
        campusName: date.campusName,
        ministryType: date.ministryType,
        kind,
        weekendKey,
        scheduleDate: date.scheduleDate,
        teamNames: date.teamName ? [date.teamName] : [],
      });
      continue;
    }

    if (date.scheduleDate < existing.scheduleDate) {
      existing.scheduleDate = date.scheduleDate;
    }
    if (date.teamName && !existing.teamNames.includes(date.teamName)) {
      existing.teamNames.push(date.teamName);
    }
  }

  return [...groups.values()].sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
}
