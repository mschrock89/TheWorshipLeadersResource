export interface AcceptedRosterSwap {
  requesterId: string;
  acceptedById: string;
  originalDate: string;
  swapDate: string | null;
  requestType?: string | null;
  createdAt?: string | null;
}

function isDirectSwap(swap: AcceptedRosterSwap): boolean {
  return Boolean(swap.swapDate) || swap.requestType === "swap";
}

function byCreatedAt(a: AcceptedRosterSwap, b: AcceptedRosterSwap): number {
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

/**
 * Who holds a position on these dates after accepted swaps.
 * Later swaps win, so a date someone received can be given away again.
 */
export function applySwapsToUserIds(
  baseUserIds: Array<string | null | undefined>,
  dates: string[],
  swaps: AcceptedRosterSwap[],
): string[] {
  const dateSet = new Set(dates);
  const holders = new Set(baseUserIds.filter((id): id is string => Boolean(id)));

  for (const swap of [...swaps].sort(byCreatedAt)) {
    if (!swap.requesterId || !swap.acceptedById) continue;

    if (dateSet.has(swap.originalDate)) {
      holders.delete(swap.requesterId);
      holders.add(swap.acceptedById);
    }

    if (isDirectSwap(swap) && swap.swapDate && dateSet.has(swap.swapDate)) {
      holders.delete(swap.acceptedById);
      holders.add(swap.requesterId);
    }
  }

  return [...holders];
}

/**
 * Dates a person currently holds. Swapped-away dates drop off, and dates
 * they received are included even though they are not on the base rotation.
 */
export function applySwapsToScheduleDates(
  baseDates: string[],
  swaps: AcceptedRosterSwap[],
  userId: string,
  expandDate: (date: string) => string[] = (date) => [date],
): string[] {
  const dates = new Set(baseDates);

  for (const swap of [...swaps].sort(byCreatedAt)) {
    if (!swap.requesterId || !swap.acceptedById) continue;
    const direct = isDirectSwap(swap);

    if (swap.requesterId === userId) {
      expandDate(swap.originalDate).forEach((date) => dates.delete(date));
      if (direct && swap.swapDate) {
        expandDate(swap.swapDate).forEach((date) => dates.add(date));
      }
    } else if (swap.acceptedById === userId) {
      expandDate(swap.originalDate).forEach((date) => dates.add(date));
      if (direct && swap.swapDate) {
        expandDate(swap.swapDate).forEach((date) => dates.delete(date));
      }
    }
  }

  return [...dates].sort();
}

/**
 * Who holds a date after the person already placed there gives it away again.
 * Starts from the current holder (often someone swapped in) and only moves
 * when that person is the one leaving, so other swaps on the same date stay put.
 */
export function resolveChainedHolder(
  holderId: string,
  dates: string[],
  swaps: AcceptedRosterSwap[],
): string {
  const dateSet = new Set(dates);
  let holder = holderId;

  for (const swap of [...swaps].sort(byCreatedAt)) {
    if (!swap.requesterId || !swap.acceptedById || !holder) continue;

    if (dateSet.has(swap.originalDate) && swap.requesterId === holder) {
      holder = swap.acceptedById;
      continue;
    }

    if (isDirectSwap(swap) && swap.swapDate && dateSet.has(swap.swapDate) && swap.acceptedById === holder) {
      holder = swap.requesterId;
    }
  }

  return holder;
}

/**
 * Keep one roster row per person who holds the date. A row for a different
 * ministry does not count: that person still needs their matching assignment.
 */
export function selectEffectiveSwapMemberRows<T extends { userId: string | null }>(
  members: T[],
  effectiveUserIds: Array<string | null | undefined>,
  matchesMinistry: (member: T) => boolean,
  excludeUserId?: string | null,
): { kept: T[]; missingUserIds: string[] } {
  const rowsByUser = new Map<string, T[]>();
  for (const member of members) {
    if (!member.userId) continue;
    const rows = rowsByUser.get(member.userId) || [];
    rows.push(member);
    rowsByUser.set(member.userId, rows);
  }

  const kept: T[] = [];
  const missingUserIds: string[] = [];
  const seen = new Set<string>();

  for (const userId of effectiveUserIds) {
    if (!userId || userId === excludeUserId || seen.has(userId)) continue;
    seen.add(userId);
    const matching = (rowsByUser.get(userId) || []).find(matchesMinistry);
    if (matching) {
      kept.push(matching);
    } else {
      missingUserIds.push(userId);
    }
  }

  return { kept, missingUserIds };
}
