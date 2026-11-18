import assert from "node:assert/strict";
import test from "node:test";
import { buildMyTeamViewAssignments } from "./teamBuilderViewAssignments.ts";

const standing = {
  id: "standing-1",
  team_id: "team-1",
  user_id: "person-1",
  member_name: "Avery",
  position: "vocals",
  position_slot: "lead_vocals",
  display_order: 0,
  rotation_period_id: "t3",
  ministry_types: ["weekend"],
  service_day: null,
};

test("date fills show on My Team when there is no standing roster", () => {
  const assignments = buildMyTeamViewAssignments(
    [],
    [
      {
        id: "fill-sat",
        team_id: "team-1",
        user_id: "person-2",
        member_name: "Rory Ellis",
        position: "electric_guitar",
        position_slot: "eg_1",
        rotation_period_id: "t3",
        schedule_date: "2026-09-26",
        ministry_types: ["weekend"],
      },
      {
        id: "fill-sun",
        team_id: "team-1",
        user_id: "person-2",
        member_name: "Rory Ellis",
        position: "electric_guitar",
        position_slot: "eg_1",
        rotation_period_id: "t3",
        schedule_date: "2026-09-27",
        ministry_types: ["weekend"],
      },
    ],
  );

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].member_name, "Rory Ellis");
  assert.deepEqual(assignments[0].schedule_dates, ["2026-09-26", "2026-09-27"]);
});

test("a date fill does not duplicate the standing person on that slot", () => {
  const assignments = buildMyTeamViewAssignments(
    [standing],
    [
      {
        id: "fill-1",
        team_id: "team-1",
        user_id: "person-1",
        member_name: "Avery",
        position: "vocals",
        position_slot: "lead_vocals",
        rotation_period_id: "t3",
        schedule_date: "2026-09-06",
        ministry_types: ["weekend"],
      },
    ],
  );

  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].id, "standing-1");
  assert.equal(assignments[0].schedule_dates, undefined);
});

test("blank slots are not people on My Team", () => {
  const assignments = buildMyTeamViewAssignments(
    [],
    [
      {
        id: "blank",
        team_id: "team-1",
        user_id: null,
        member_name: "__TEAM_BUILDER_BLANK_SLOT__",
        position: "vocals",
        position_slot: "lead_vocals",
        rotation_period_id: "t3",
        schedule_date: "2026-09-06",
        ministry_types: ["weekend"],
      },
    ],
  );

  assert.deepEqual(assignments, []);
});
