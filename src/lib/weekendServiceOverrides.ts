import { formatDateForDB, parseLocalDate } from "./utils";
import { supabase } from "@/integrations/supabase/client";

function addDays(dateStr: string, amount: number) {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + amount);
  return formatDateForDB(date);
}

export async function getRelatedWeekendServiceDates(dateStr: string, campusId?: string | null) {
  const date = parseLocalDate(dateStr);
  const dayOfWeek = date.getDay();

  let fridayDate: string | null = null;
  let saturdayDate: string | null = null;
  let sundayDate: string | null = null;

  if (dayOfWeek === 5) {
    fridayDate = dateStr;
    saturdayDate = addDays(dateStr, 1);
    sundayDate = addDays(dateStr, 2);
  } else if (dayOfWeek === 6) {
    fridayDate = addDays(dateStr, -1);
    saturdayDate = dateStr;
    sundayDate = addDays(dateStr, 1);
  } else if (dayOfWeek === 0) {
    fridayDate = addDays(dateStr, -2);
    saturdayDate = addDays(dateStr, -1);
    sundayDate = dateStr;
  } else {
    return [dateStr];
  }

  let query = supabase
    .from("service_time_overrides")
    .select("service_date")
    .eq("service_date", fridayDate);

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data) {
    if (dayOfWeek === 5) return [dateStr];
    return [dateStr, ...(dayOfWeek === 6 && sundayDate ? [sundayDate] : []), ...(dayOfWeek === 0 && saturdayDate ? [saturdayDate] : [])];
  }

  return [fridayDate, saturdayDate, sundayDate].filter(Boolean) as string[];
}
