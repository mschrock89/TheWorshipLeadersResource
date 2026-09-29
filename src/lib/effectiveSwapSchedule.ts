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
