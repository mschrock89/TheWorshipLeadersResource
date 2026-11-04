import { format } from "date-fns";
import { POSITION_LABELS } from "@/lib/constants";
import { canonicalSwapPosition } from "@/lib/swapPositions";
import { getWeekendPairDate } from "@/lib/utils";

// Keep in sync with formatGapPosition in supabase/functions/_shared/gapRequests.ts.
// Gap requests go to a whole position family, so label the family ("Electric Guitar", not "EG 1").
const FAMILY_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  electric_guitar: "Electric Guitar",
  acoustic_guitar: "Acoustic Guitar",
};

export function formatGapPosition(position: string): string {
  const family = canonicalSwapPosition(position);
  return (
    FAMILY_LABELS[family] ||
    POSITION_LABELS[family] ||
    family.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function formatGapDate(date: string, pattern = "EEE, MMM d"): string {
  return format(new Date(`${date}T00:00:00`), pattern);
}

/** Every date the gap covers: the date, plus its weekend pair day when requested. */
export function gapRequestDates(request: { schedule_date: string; covers_weekend_pair: boolean }): string[] {
  const pair = request.covers_weekend_pair ? getWeekendPairDate(request.schedule_date) : null;
  return pair ? [request.schedule_date, pair].sort() : [request.schedule_date];
}

export function formatGapDates(dates: string[], pattern = "EEE, MMM d"): string {
  return dates.map((date) => formatGapDate(date, pattern)).join(" & ");
}
