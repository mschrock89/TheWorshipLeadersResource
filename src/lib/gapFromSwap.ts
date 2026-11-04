import {
  getTeamBuilderSlotCategories,
  MINISTRY_TYPES,
  POSITION_SLOTS,
  STUDENT_TEAM_BUILDER_MINISTRY_TYPE,
  normalizeSessionSetMinistryType,
} from "./constants.ts";
import { churchCalendarDate } from "./swapNotice.ts";
import { canonicalSwapPosition, swapPositionsMatch } from "./swapPositions.ts";

const VISIBLE_MINISTRIES = new Set<string>(
  MINISTRY_TYPES.filter((ministry) => !("hidden" in ministry && ministry.hidden)).map((ministry) => ministry.value),
);

export interface GapAssignmentRow {
  position?: string | null;
  position_slot?: string | null;
}

function positionToken(position: string): string {
  return position.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function knownSlot(slot: string | null | undefined): slot is string {
  return Boolean(slot && POSITION_SLOTS.some((entry) => entry.slot === slot));
}

/** Best Team Builder slot for a swap position when the roster chair is unknown. */
export function gapSlotForPosition(position: string): string {
  const token = positionToken(position);
  const exact = POSITION_SLOTS.find((slot) => slot.slot === token);
  if (exact) return exact.slot;

  const family = canonicalSwapPosition(position);
  const matches = POSITION_SLOTS.filter(
    (slot) => canonicalSwapPosition(slot.slot) === family || canonicalSwapPosition(slot.position) === family,
  );
  return matches[0]?.slot || "";
}

/**
 * Prefer the chair this person is actually scheduled in. Date overrides should
 * be listed before the base roster so a one-off slot wins.
 */
export function gapSlotFromAssignments(position: string, rows: GapAssignmentRow[]): string {
  const token = positionToken(position);
  const matching = rows.filter((row) => {
    const slot = row.position_slot || "";
    const assigned = row.position || "";
    return (
      (slot && (slot === token || swapPositionsMatch(slot, position))) ||
      (assigned && swapPositionsMatch(assigned, position))
    );
  });

  const exact = matching.find((row) => row.position_slot === token && knownSlot(row.position_slot));
  if (exact?.position_slot) return exact.position_slot;

  const slotted = matching.find((row) => knownSlot(row.position_slot));
  if (slotted?.position_slot) return slotted.position_slot;

  return gapSlotForPosition(position);
}

function visibleMinistry(ministry: string | null | undefined): string {
  const raw = (ministry || "").trim();
  if (!raw) return "";
  const base = normalizeSessionSetMinistryType(raw) || raw;
  if (base === "weekend" || base === "sunday_am") return "weekend_team";
  if (VISIBLE_MINISTRIES.has(base)) return base;
  if (VISIBLE_MINISTRIES.has(raw)) return raw;
  return "";
}

function ministryIncludesSlot(ministry: string, slot: string): boolean {
  const category = POSITION_SLOTS.find((entry) => entry.slot === slot)?.category;
  if (!category) return false;
  return getTeamBuilderSlotCategories(ministry).includes(category);
}

function ministryForCategory(category: string | undefined): string {
  if (category === "Production") return "production";
  if (category === "Video") return "video";
  if (category === "Speaker") return "speaker";
  if (category === "Creative") return "creative";
  if (category === "Students") return STUDENT_TEAM_BUILDER_MINISTRY_TYPE;
  if (category === "Pastors") return "student_camp";
  return "weekend_team";
}

/** A future swap that still has no one covering it can be turned into a gap request. */
export function swapCanBecomeGap(
  request: { status: string; original_date: string },
  today = churchCalendarDate(),
): boolean {
  return (request.status === "pending" || request.status === "declined") && request.original_date >= today;
}

/** Ministry the gap dialog can select, keeping the swap's ministry when that slot belongs there. */
export function gapMinistryForSwap(ministry: string | null | undefined, position: string): string {
  const preferred = visibleMinistry(ministry);
  const slot = gapSlotForPosition(position);
  if (!slot) return preferred || "weekend_team";
  if (preferred && ministryIncludesSlot(preferred, slot)) return preferred;

  const category = POSITION_SLOTS.find((entry) => entry.slot === slot)?.category;
  return ministryForCategory(category);
}
