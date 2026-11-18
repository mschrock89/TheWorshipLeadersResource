import assert from "node:assert/strict";
import test from "node:test";
import { repeatedTeamLineup } from "./teamBuilderLineup.ts";

const september = [
  { scheduleDate: "2026-09-26", positionSlot: "drums", userId: "travis", memberName: "Travis Walker" },
  { scheduleDate: "2026-09-26", positionSlot: "bass", userId: "pablo", memberName: "Pablo Molina" },
  { scheduleDate: "2026-09-27", positionSlot: "drums", userId: "travis", memberName: "Travis Walker" },
  { scheduleDate: "2026-09-27", positionSlot: "bass", userId: "pablo", memberName: "Pablo Molina" },
];

test("one weekend lineup is the team for later dates", () => {
  const lineup = repeatedTeamLineup(september);
  assert.deepEqual(
    lineup?.map((fill) => fill.scheduleDate),
    ["2026-09-27", "2026-09-27"],
  );
});

test("different weekends are not copied onto an empty date", () => {
  const lineup = repeatedTeamLineup([
    ...september,
    { scheduleDate: "2026-11-22", positionSlot: "drums", userId: "andy", memberName: "Andy Shafer" },
  ]);
  assert.equal(lineup, null);
});
