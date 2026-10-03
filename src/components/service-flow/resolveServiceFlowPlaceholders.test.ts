import assert from "node:assert/strict";
import test from "node:test";
import type { RosterMember } from "../../hooks/useTeamRosterForDate.tsx";
import {
  buildResolvedServiceFlowTitles,
  buildScheduledRoleNames,
  resolveServiceFlowPlaceholderTitle,
} from "./resolveServiceFlowPlaceholders.ts";

function rosterMember(overrides: Partial<RosterMember> & Pick<RosterMember, "memberName" | "positions">): RosterMember {
  return {
    id: overrides.memberName,
    positionSlots: overrides.positions,
    userId: overrides.memberName,
    avatarUrl: null,
    phone: null,
    isSwapped: false,
    hasPendingSwap: false,
    ministryTypes: ["speaker"],
    serviceDay: null,
    ...overrides,
  };
}

const swappedAnnouncer = rosterMember({
  memberName: "Sam Lee",
  positions: ["announcement"],
  positionSlots: ["announcement"],
  isSwapped: true,
  originalMemberName: "Jane Doe",
});

test("live service flow uses the swapped announcements person", () => {
  const roleNames = buildScheduledRoleNames([swappedAnnouncer]);
  const items = [
    { id: "header", item_type: "header" as const, title: "Announcements", song: null },
    { id: "slot", item_type: "item" as const, title: "Name Place Holder", song: null },
    { id: "saved", item_type: "item" as const, title: "Jane Doe", song: null },
    { id: "custom", item_type: "item" as const, title: "Baptism Sunday", song: null },
  ];

  const titles = buildResolvedServiceFlowTitles(items, roleNames, {
    announcerName: "Jane Doe",
  });

  assert.equal(titles.get("slot"), "Sam Lee");
  assert.equal(titles.get("saved"), "Sam Lee");
  assert.equal(titles.get("custom"), "Baptism Sunday");
});

test("a saved announcements name outside that section stays put", () => {
  const roleNames = buildScheduledRoleNames([swappedAnnouncer]);
  const resolved = resolveServiceFlowPlaceholderTitle({
    item: { title: "Jane Doe", song: null },
    sectionTitle: "Worship",
    roleNames,
    announcerName: "Jane Doe",
  });

  assert.equal(resolved, "Jane Doe");
});
