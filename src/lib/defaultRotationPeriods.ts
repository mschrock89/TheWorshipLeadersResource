export interface DefaultRotationPeriod {
  campus_id: string;
  name: string;
  year: number;
  trimester: 1 | 2 | 3;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const TRIMESTERS: Array<{
  trimester: 1 | 2 | 3;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}> = [
  { trimester: 1, startMonth: 1, startDay: 1, endMonth: 4, endDay: 30 },
  { trimester: 2, startMonth: 5, startDay: 1, endMonth: 8, endDay: 31 },
  { trimester: 3, startMonth: 9, startDay: 1, endMonth: 12, endDay: 31 },
];

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** This year and next, matching the trimesters already on the other campuses. */
export function defaultRotationPeriodYears(today = new Date()) {
  const year = today.getFullYear();
  return [year, year + 1];
}

/**
 * T1 is January–April, T2 is May–August, and T3 is September–December.
 * The trimester that contains today is the active one.
 */
export function buildDefaultRotationPeriods(campusId: string, today = new Date()): DefaultRotationPeriod[] {
  const todayStr = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return defaultRotationPeriodYears(today).flatMap((year) =>
    TRIMESTERS.map((trimester) => {
      const start_date = isoDate(year, trimester.startMonth, trimester.startDay);
      const end_date = isoDate(year, trimester.endMonth, trimester.endDay);
      return {
        campus_id: campusId,
        name: `T${trimester.trimester} ${year}`,
        year,
        trimester: trimester.trimester,
        start_date,
        end_date,
        is_active: todayStr >= start_date && todayStr <= end_date,
      };
    }),
  );
}
