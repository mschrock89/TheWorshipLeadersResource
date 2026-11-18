import { isBlankTeamBuilderAssignment } from "./teamBuilderBlankSlot.ts";
import { getServiceDayForDate } from "./weekendPositionSplit.ts";
import { getWeekendPairDate } from "./utils.ts";

export interface TeamLineupFill {
  scheduleDate: string;
  positionSlot?: string | null;
  userId?: string | null;
  memberName?: string | null;
}

function weekendKey(date: string) {
  if (getServiceDayForDate(date) === "sunday") return getWeekendPairDate(date) || date;
  return date;
}

function personToken(fill: TeamLineupFill) {
  if (fill.userId) return fill.userId;
  return (fill.memberName || "").trim().toLowerCase();
}

function lineupSignature(fills: TeamLineupFill[]) {
  const sunday = fills.filter((fill) => getServiceDayForDate(fill.scheduleDate) === "sunday");
  const source = sunday.length > 0 ? sunday : fills;
  return source
    .map((fill) => `${fill.positionSlot || ""}|${personToken(fill)}`)
    .sort()
    .join("||");
}

/**
 * Shelbyville saved each team once, on the first weekend, instead of as a
 * standing roster. That lineup is who plays every later date for the team.
 * A week with its own fill still wins. Different lineups on different weekends
 * are not guessed onto an empty date.
 */
export function repeatedTeamLineup<T extends TeamLineupFill>(fills: T[]): T[] | null {
  const people = fills.filter((fill) => !isBlankTeamBuilderAssignment({
    user_id: fill.userId,
    member_name: fill.memberName,
  }));
  if (people.length === 0) return null;

  const byWeekend = new Map<string, T[]>();
  for (const fill of people) {
    const key = weekendKey(fill.scheduleDate);
    const group = byWeekend.get(key);
    if (group) group.push(fill);
    else byWeekend.set(key, [fill]);
  }

  const weekends = [...byWeekend.values()];
  const signatures = new Set(weekends.map((weekend) => lineupSignature(weekend)));
  if (signatures.size !== 1) return null;

  const sunday = weekends[0].filter((fill) => getServiceDayForDate(fill.scheduleDate) === "sunday");
  return sunday.length > 0 ? sunday : weekends[0];
}
