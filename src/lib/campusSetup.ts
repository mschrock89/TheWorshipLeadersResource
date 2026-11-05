import { isNetworkWideMinistryType } from "./constants.ts";
import {
  SERVICE_SCHEDULE_MINISTRY_OPTIONS,
  buildDayScheduleDrafts,
  enabledScheduleRows,
  ministryScheduleIsInherited,
  ministryUsesCampusWeekendDefaults,
  scheduleMinistryType,
  type CampusWeekendTimes,
  type DayScheduleDraft,
  type MinistryServiceScheduleRow,
} from "./campusMinistrySchedule.ts";

export type CampusMinistryDraft = {
  ministryType: string;
  label: string;
  enabled: boolean;
  followWeekend: boolean;
  days: DayScheduleDraft[];
};

/** Ministries a physical campus can turn on. Network-wide camp ministries stay on the Network Wide campus. */
export const CAMPUS_SETUP_MINISTRY_OPTIONS = SERVICE_SCHEDULE_MINISTRY_OPTIONS.filter(
  (option) => !isNetworkWideMinistryType(option.value),
);

export function campusMinistryKey(ministryType: string | null | undefined): string {
  const scheduled = scheduleMinistryType(ministryType) || (ministryType || "").trim();
  if (scheduled === "weekend" || ministryType === "weekend_team" || ministryType === "sunday_am") {
    return "weekend";
  }
  return scheduled;
}

/** A ministry stays available when any selected campus has not saved a list, or when one of the saved lists includes it. */
export function campusGroupOffersMinistry(
  lists: Array<ReadonlySet<string> | null | undefined>,
  ministryType: string,
): boolean {
  if (lists.length === 0 || lists.some((list) => !list || list.size === 0)) return true;
  return lists.some((list) => campusOffersMinistry(list, ministryType));
}

export function campusOffersMinistry(
  enabled: ReadonlySet<string> | null | undefined,
  ministryType: string | null | undefined,
): boolean {
  if (!ministryType) return false;
  if (!enabled) return true;
  if (ministryType.startsWith("team:") || ministryType === "life_groups") return true;
  if (ministryType === "campus_wide" || ministryType === "network_wide") return true;
  if (isNetworkWideMinistryType(ministryType)) return true;
  return enabled.has(campusMinistryKey(ministryType));
}

export function buildCampusMinistryDrafts({
  campus,
  schedules,
  enabledMinistries,
  isNew,
}: {
  campus?: CampusWeekendTimes | null;
  schedules: MinistryServiceScheduleRow[];
  enabledMinistries: ReadonlySet<string> | null;
  isNew: boolean;
}): CampusMinistryDraft[] {
  return CAMPUS_SETUP_MINISTRY_OPTIONS.map((option) => {
    const days = buildDayScheduleDrafts({
      ministryType: option.value,
      campus,
      rows: schedules,
    });
    const hasSavedRows = schedules.some(
      (row) => row.ministry_type === option.value && row.service_times.length > 0,
    );
    const canFollowWeekend = option.value !== "weekend" && ministryUsesCampusWeekendDefaults(option.value);
    const weekendIsActive = Boolean(campus?.has_saturday_service || campus?.has_sunday_service !== false);
    const enabled = isNew
      ? option.value === "weekend"
      : enabledMinistries
        ? enabledMinistries.has(option.value) || hasSavedRows
        : option.value === "weekend"
          ? weekendIsActive
          : hasSavedRows;
    return {
      ministryType: option.value,
      label: option.label,
      enabled,
      followWeekend: canFollowWeekend && (isNew || ministryScheduleIsInherited(option.value, schedules)),
      days,
    };
  });
}

export function campusSetupError({
  name,
  ministries,
  attendanceEnabled,
  latitude,
  longitude,
  radius,
  existingNames,
  campusId,
}: {
  name: string;
  ministries: CampusMinistryDraft[];
  attendanceEnabled: boolean;
  latitude: string;
  longitude: string;
  radius: string;
  existingNames: Array<{ id: string; name: string }>;
  campusId: string | null;
}): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a campus name.";
  const duplicate = existingNames.some(
    (campus) => campus.id !== campusId && campus.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (duplicate) return "A campus with that name already exists.";
  const enabled = ministries.filter((ministry) => ministry.enabled);
  if (enabled.length === 0) return "Turn on at least one ministry.";
  for (const ministry of enabled) {
    if (ministry.followWeekend) continue;
    if (enabledScheduleRows(ministry.days).length === 0) {
      return `Add at least one service day for ${ministry.label}.`;
    }
  }
  if (attendanceEnabled) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const radiusMeters = Number(radius);
    if (!latitude.trim() || !longitude.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      return "Enter a latitude and longitude for attendance.";
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return "Latitude or longitude is out of range.";
    }
    if (!radius.trim() || Number.isNaN(radiusMeters) || radiusMeters < 25 || radiusMeters > 5000) {
      return "Attendance radius must be between 25 and 5000 meters.";
    }
  }
  return null;
}
