import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateForDB, getWeekendKey, getWeekendPairDate, parseLocalDate } from "@/lib/utils";

export interface TeachingWeekSummary {
  id: string;
  campus_id: string;
  ministry_type: string;
  weekend_date: string;
  updated_at?: string;
  book: string;
  chapter: number;
  chapter_reference?: string | null;
  schedule_pdf_path: string | null;
  ai_summary: string | null;
  themes_manual: string[] | null;
  themes_suggested: string[] | null;
}

const WEEKEND_MINISTRY_ALIASES = ["weekend", "weekend_team", "sunday_am"];

export function getTeachingMinistryAliases(ministryType?: string | null): string[] {
  if (!ministryType) return [];
  if (WEEKEND_MINISTRY_ALIASES.includes(ministryType)) {
    return WEEKEND_MINISTRY_ALIASES;
  }
  return [ministryType];
}

function isWeekendStyleTeachingMinistry(ministryType?: string | null): boolean {
  return !!ministryType && WEEKEND_MINISTRY_ALIASES.includes(ministryType);
}

export function normalizeTeachingWeekDateForMinistry(
  weekendDate?: string | null,
  ministryType?: string | null
): string | null {
  if (!weekendDate) return null;
  return isWeekendStyleTeachingMinistry(ministryType) ? getWeekendKey(weekendDate) : weekendDate;
}

function expandTeachingWeekDatesForDisplay(
  week: TeachingWeekSummary,
  ministryType?: string | null
): string[] {
  if (!isWeekendStyleTeachingMinistry(ministryType)) {
    return [week.weekend_date];
  }

  const pairDate = getWeekendPairDate(week.weekend_date);
  return pairDate ? [week.weekend_date, pairDate] : [week.weekend_date];
}

function rankTeachingWeekMatch(targetMinistryType: string | null | undefined, week: TeachingWeekSummary): number {
  if (!targetMinistryType) return 0;
  if (week.ministry_type === targetMinistryType) return 0;
  if (WEEKEND_MINISTRY_ALIASES.includes(targetMinistryType) && WEEKEND_MINISTRY_ALIASES.includes(week.ministry_type)) {
    return 1;
  }
  return 2;
}

function selectBestTeachingWeek(
  weeks: TeachingWeekSummary[],
  targetMinistryType?: string | null
): TeachingWeekSummary | null {
  if (weeks.length === 0) return null;
  return [...weeks].sort((a, b) => {
    const rankDiff = rankTeachingWeekMatch(targetMinistryType, a) - rankTeachingWeekMatch(targetMinistryType, b);
    if (rankDiff !== 0) return rankDiff;
    const updatedAtDiff = (b.updated_at || "").localeCompare(a.updated_at || "");
    if (updatedAtDiff !== 0) return updatedAtDiff;
    return a.weekend_date.localeCompare(b.weekend_date);
  })[0] ?? null;
}

export function useTeachingWeekForDate(
  campusId?: string | null,
  ministryType?: string | null,
  weekendDate?: string | null
) {
  const ministryAliases = useMemo(() => getTeachingMinistryAliases(ministryType), [ministryType]);
  const lookupDate = useMemo(
    () => normalizeTeachingWeekDateForMinistry(weekendDate, ministryType),
    [weekendDate, ministryType]
  );

  return useQuery({
    queryKey: ["teaching-week", campusId, ministryAliases.join(","), lookupDate],
    enabled: !!campusId && !!lookupDate && ministryAliases.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("teaching_weeks")
        .select("*")
        .eq("campus_id", campusId)
        .eq("weekend_date", lookupDate)
        .in("ministry_type", ministryAliases)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return selectBestTeachingWeek((data || []) as TeachingWeekSummary[], ministryType);
    },
  });
}

export function useTeachingWeeksInRange(
  campusId?: string | null,
  startDate?: string | null,
  endDate?: string | null,
  ministryType?: string | null
) {
  const ministryAliases = useMemo(() => getTeachingMinistryAliases(ministryType), [ministryType]);
  const normalizedStartDate = useMemo(() => {
    if (!startDate) return null;
    if (!isWeekendStyleTeachingMinistry(ministryType)) return startDate;

    const date = parseLocalDate(startDate);
    date.setDate(date.getDate() - 1);
    return formatDateForDB(date);
  }, [startDate, ministryType]);
  const normalizedEndDate = useMemo(() => {
    if (!endDate) return null;
    if (!isWeekendStyleTeachingMinistry(ministryType)) return endDate;

    const date = parseLocalDate(endDate);
    date.setDate(date.getDate() + 1);
    return formatDateForDB(date);
  }, [endDate, ministryType]);

  return useQuery({
    queryKey: ["teaching-weeks-range", campusId, normalizedStartDate, normalizedEndDate, ministryAliases.join(",")],
    enabled: !!campusId && !!normalizedStartDate && !!normalizedEndDate,
    queryFn: async () => {
      let query = (supabase as any)
        .from("teaching_weeks")
        .select("*")
        .eq("campus_id", campusId)
        .gte("weekend_date", normalizedStartDate)
        .lte("weekend_date", normalizedEndDate)
        .order("updated_at", { ascending: false })
        .order("weekend_date", { ascending: true });

      if (ministryAliases.length > 0) {
        query = query.in("ministry_type", ministryAliases);
      }

      const { data, error } = await query;
      if (error) throw error;

      const weeks = (data || []) as TeachingWeekSummary[];
      const weeksByDate = new Map<string, TeachingWeekSummary[]>();

      for (const week of weeks) {
        const existing = weeksByDate.get(week.weekend_date) || [];
        existing.push(week);
        weeksByDate.set(week.weekend_date, existing);
      }

      return Array.from(weeksByDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, dateWeeks]) => selectBestTeachingWeek(dateWeeks, ministryType))
        .filter((week): week is TeachingWeekSummary => Boolean(week));
    },
  });
}

export function getTeachingWeekDisplayDates(
  week: TeachingWeekSummary,
  ministryType?: string | null
): string[] {
  return expandTeachingWeekDatesForDisplay(week, ministryType);
}

export function formatTeachingReference(week: Pick<TeachingWeekSummary, "book" | "chapter" | "chapter_reference">): string {
  return week.chapter_reference?.trim() || `${week.book} ${week.chapter}`;
}
