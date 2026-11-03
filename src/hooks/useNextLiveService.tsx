import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCampuses, useUserCampuses } from "@/hooks/useCampuses";
import { useCampusSelectionOptional } from "@/components/layout/CampusSelectionContext";
import { useCampusMinistrySchedules } from "@/hooks/useCampusMinistrySchedules";
import { useServiceTimeOverrides } from "@/hooks/useServiceTimeOverrides";
import { useMyTeamAssignments } from "@/hooks/useMyTeamAssignments";
import { listScheduledServiceTimes } from "@/components/service-flow/serviceFlowClock";
import { recurringServiceTimesForDate } from "@/lib/campusMinistrySchedule";
import { POSITION_CATEGORIES } from "@/lib/constants";
import { campusHasServiceOnDate, formatDateForDB } from "@/lib/utils";
import {
  PRODUCTION_LIVE_MINISTRIES,
  buildLiveModeHref,
  liveServiceMinistry,
  pickNextLiveService,
} from "@/lib/liveMode";

const LOOKAHEAD_DAYS = 14;
const AUDIO_POSITIONS = new Set<string>(POSITION_CATEGORIES.audio);
const PRODUCTION_MINISTRIES = new Set<string>(PRODUCTION_LIVE_MINISTRIES);

type Candidate = {
  date: string;
  campusId: string;
  ministryType: string;
  times: string[];
};

/**
 * The Live link for this user's next service. Audio volunteers get their next
 * scheduled production date. Admins and production managers also get the next
 * weekend service at their campus, whichever comes first.
 */
export function useNextLiveService() {
  const { user, isAdmin, isProductionManager } = useAuth();
  const campusContext = useCampusSelectionOptional();
  const { data: userCampuses = [] } = useUserCampuses(user?.id);
  const { data: campuses = [] } = useCampuses();
  const { data: ministrySchedules = [] } = useCampusMinistrySchedules();
  const { scheduledDates, isLoading: scheduleLoading } = useMyTeamAssignments();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const today = formatDateForDB(now);
  const lookaheadEnd = useMemo(() => {
    const end = new Date(now);
    end.setDate(end.getDate() + LOOKAHEAD_DAYS);
    return formatDateForDB(end);
  }, [now]);
  const { data: overrides = [] } = useServiceTimeOverrides({ startDate: today, endDate: lookaheadEnd });

  const next = useMemo(() => {
    const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
    const timesFor = (date: string, campusId: string, ministryType: string) =>
      listScheduledServiceTimes({
        serviceDate: date,
        ministryType,
        campusId,
        campus: campusById.get(campusId),
        overrides,
        recurringServiceTimes: recurringServiceTimesForDate(ministrySchedules, campusId, ministryType, date),
      });

    const candidates: Candidate[] = [];

    for (const entry of scheduledDates) {
      if (!entry.campusId || entry.scheduleDate < today) continue;
      if (!PRODUCTION_MINISTRIES.has(entry.ministryType) && !AUDIO_POSITIONS.has(entry.position)) continue;
      const ministryType = liveServiceMinistry(entry.ministryType) || "weekend";
      candidates.push({
        date: entry.scheduleDate,
        campusId: entry.campusId,
        ministryType,
        times: timesFor(entry.scheduleDate, entry.campusId, ministryType),
      });
    }

    if (isAdmin || isProductionManager) {
      const selectedCampus =
        campusContext?.selectedCampusId && campusContext.selectedCampusId !== "network-wide"
          ? campusContext.selectedCampusId
          : null;
      const campusId = selectedCampus || userCampuses[0]?.campus_id || campuses[0]?.id || null;
      if (campusId) {
        const cursor = new Date(now);
        for (let day = 0; day <= LOOKAHEAD_DAYS; day += 1) {
          const date = formatDateForDB(cursor);
          cursor.setDate(cursor.getDate() + 1);
          const hasOverride = overrides.some(
            (override) => override.service_date === date && override.campus_id === campusId,
          );
          if (!hasOverride && !campusHasServiceOnDate(campusById.get(campusId), date)) continue;
          const times = timesFor(date, campusId, "weekend");
          if (times.length > 0) candidates.push({ date, campusId, ministryType: "weekend", times });
        }
      }
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return pickNextLiveService(candidates, today, nowMinutes);
  }, [
    campusContext?.selectedCampusId,
    campuses,
    isAdmin,
    isProductionManager,
    ministrySchedules,
    now,
    overrides,
    scheduledDates,
    today,
    userCampuses,
  ]);

  const href = next
    ? buildLiveModeHref({ date: next.date, campusId: next.campusId, ministryType: next.ministryType })
    : "/live";

  return { href, next, isLoading: scheduleLoading };
}
