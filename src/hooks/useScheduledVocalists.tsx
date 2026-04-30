import { useMemo } from "react";
import { useScheduledTeamForDate } from "@/hooks/useScheduledTeamForDate";
import { useTeamRosterForDate } from "@/hooks/useTeamRosterForDate";
import { normalizeWeekendWorshipMinistryType } from "@/lib/constants";

export interface ScheduledVocalist {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** The vocal slot/position they are serving in (e.g. lead_vocals). */
  position: string;
  /** True if they are covering a swapped slot (i.e., swapped in). */
  isSwappedIn?: boolean;
}

const isVocalPosition = (pos: string) => {
  const lower = pos.toLowerCase();
  return lower.includes("vocal") || lower === "vocals";
};

export function useScheduledVocalists(
  targetDate: Date | null,
  ministryType: string,
  campusId: string | null
) {
  const rosterMinistryScope =
    normalizeWeekendWorshipMinistryType(ministryType) === "weekend" ? "weekend_team" : ministryType;

  const { data: scheduledTeam, isLoading: teamLoading } = useScheduledTeamForDate(
    targetDate,
    campusId,
    rosterMinistryScope,
  );

  const { data: roster = [], isLoading: rosterLoading } = useTeamRosterForDate(
    targetDate,
    scheduledTeam?.teamId,
    rosterMinistryScope,
    campusId,
  );

  const data = useMemo<ScheduledVocalist[]>(() => {
    const vocalistsMap = new Map<string, ScheduledVocalist>();

    for (const member of roster) {
      if (!member.userId) continue;

      const vocalPositions = member.positions.filter((position) => isVocalPosition(position));
      if (vocalPositions.length === 0) continue;

      const primaryPosition = vocalPositions[0] || member.positions[0] || "vocalist";

      if (!vocalistsMap.has(member.userId)) {
        vocalistsMap.set(member.userId, {
          userId: member.userId,
          name: member.memberName,
          avatarUrl: member.avatarUrl,
          position: primaryPosition,
          isSwappedIn: member.isSwapped,
        });
        continue;
      }

      const existing = vocalistsMap.get(member.userId)!;
      if (!isVocalPosition(existing.position) && isVocalPosition(primaryPosition)) {
        existing.position = primaryPosition;
      }
      existing.isSwappedIn = existing.isSwappedIn || member.isSwapped;
      existing.avatarUrl = existing.avatarUrl || member.avatarUrl;
    }

    return Array.from(vocalistsMap.values());
  }, [roster]);

  return {
    data,
    isLoading: teamLoading || rosterLoading,
  };
}
