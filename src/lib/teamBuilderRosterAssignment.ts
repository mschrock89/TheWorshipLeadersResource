/**
 * Weekend Worship can seat someone on a saturday/sunday-only row as a day fill
 * without putting them on the trimester team. Those rows should not count as
 * "on the roster" for On Break / Auto-Build rotation.
 *
 * Video and MS Worship Weekend use service_day as the primary roster (split
 * team cards), so their saturday/sunday rows must count as assigned.
 */
export function isWeekendDayFillMinistry(ministryType: string | undefined) {
  return ministryType === "weekend" || ministryType === "weekend_team";
}

export function countsAsTrimesterRosterAssignment(
  member: { service_day?: string | null },
  ministryType: string | undefined,
) {
  if (isWeekendDayFillMinistry(ministryType) && member.service_day) {
    return false;
  }

  return true;
}
