import assert from "node:assert/strict";
import test from "node:test";
import {
  applySwapsToScheduleDates,
  applySwapsToUserIds,
  resolveChainedHolder,
  selectEffectiveSwapMemberRows,
} from "./effectiveSwapSchedule.ts";

const luke = "luke";
const simms = "simms";
const bruno = "bruno";

const lukeSimmsSwap = {
  requesterId: luke,
  acceptedById: simms,
  originalDate: "2026-10-17",
  swapDate: "2026-10-10",
  requestType: "swap",
  createdAt: "2026-08-31T19:36:01.718Z",
};

function expandWeekend(date: string): string[] {
  if (date === "2026-10-10") return ["2026-10-10", "2026-10-11"];
  if (date === "2026-10-17") return ["2026-10-17", "2026-10-18"];
  if (date === "2026-10-31") return ["2026-10-31", "2026-11-01"];
  return [date];
}

test("a later swap uses the date someone holds now, not their original rotation date", () => {
  const oct17 = applySwapsToUserIds([luke], ["2026-10-17", "2026-10-18"], [lukeSimmsSwap]);
  const oct10 = applySwapsToUserIds([simms], ["2026-10-10", "2026-10-11"], [lukeSimmsSwap]);

  assert.deepEqual(oct17, [simms]);
  assert.deepEqual(oct10, [luke]);
});

test("Luke's offered dates are the weekend he received from Simms", () => {
  const dates = applySwapsToScheduleDates(
    ["2026-10-17", "2026-10-18"],
    [lukeSimmsSwap],
    luke,
    expandWeekend,
  );

  assert.deepEqual(dates, ["2026-10-10", "2026-10-11"]);
});

test("a third swap can give away the date received in the first swap", () => {
  const lukeBrunoSwap = {
    requesterId: luke,
    acceptedById: bruno,
    originalDate: "2026-10-10",
    swapDate: "2026-10-31",
    requestType: "swap",
    createdAt: "2026-09-29T00:44:16.773Z",
  };

  const oct10 = applySwapsToUserIds(
    [simms],
    ["2026-10-10", "2026-10-11"],
    [lukeSimmsSwap, lukeBrunoSwap],
  );
  const oct31 = applySwapsToUserIds(
    [bruno],
    ["2026-10-31", "2026-11-01"],
    [lukeSimmsSwap, lukeBrunoSwap],
  );
  const lukeDates = applySwapsToScheduleDates(
    ["2026-10-17", "2026-10-18"],
    [lukeSimmsSwap, lukeBrunoSwap],
    luke,
    expandWeekend,
  );

  assert.deepEqual(oct10, [bruno]);
  assert.deepEqual(oct31, [luke]);
  assert.deepEqual(lukeDates, ["2026-10-31", "2026-11-01"]);
});

const brunoLukeSwap = {
  requesterId: bruno,
  acceptedById: luke,
  originalDate: "2026-10-31",
  swapDate: "2026-10-10",
  requestType: "swap",
  createdAt: "2026-09-30T02:53:54.533Z",
};

test("a date Luke received from Simms can be given to Bruno on a later swap", () => {
  const oct10 = ["2026-10-10", "2026-10-11"];
  const oct17 = ["2026-10-17", "2026-10-18"];
  const oct31 = ["2026-10-31", "2026-11-01"];

  assert.equal(resolveChainedHolder(luke, oct10, [lukeSimmsSwap, brunoLukeSwap]), bruno);
  assert.equal(resolveChainedHolder(simms, oct17, [lukeSimmsSwap, brunoLukeSwap]), simms);
  assert.equal(resolveChainedHolder(luke, oct31, [lukeSimmsSwap, brunoLukeSwap]), luke);
});

test("a later fill-in of the received date replaces the person who just took it", () => {
  const brunoGivesAwayOct10 = {
    requesterId: bruno,
    acceptedById: "alex",
    originalDate: "2026-10-10",
    swapDate: null,
    requestType: "fill_in",
    createdAt: "2026-10-01T00:00:00.000Z",
  };

  assert.equal(
    resolveChainedHolder(luke, ["2026-10-10", "2026-10-11"], [
      lukeSimmsSwap,
      brunoLukeSwap,
      brunoGivesAwayOct10,
    ]),
    "alex",
  );
});

test("another position's swap on the same weekend does not move the current holder", () => {
  const bassSwap = {
    requesterId: "mark",
    acceptedById: "other",
    originalDate: "2026-10-17",
    swapDate: "2026-10-10",
    requestType: "swap",
    createdAt: "2026-10-05T14:48:29.418Z",
  };

  assert.equal(
    resolveChainedHolder(luke, ["2026-10-10", "2026-10-11"], [lukeSimmsSwap, brunoLukeSwap, bassSwap]),
    bruno,
  );
});

test("a worship-night row on the swapped team does not hide the weekend drummer", () => {
  const weekend = (member: { ministryTypes: string[] }) => member.ministryTypes.includes("weekend");
  const { kept, missingUserIds } = selectEffectiveSwapMemberRows(
    [
      { userId: simms, ministryTypes: ["weekend"], team: "Team 2" },
      { userId: luke, ministryTypes: ["worship_night"], team: "Team 2" },
    ],
    applySwapsToUserIds([simms, luke], ["2026-10-10", "2026-10-11"], [lukeSimmsSwap]),
    weekend,
  );

  assert.deepEqual(kept, []);
  assert.deepEqual(missingUserIds, [luke]);
});
