import assert from "node:assert/strict";
import test from "node:test";
import { resolveEffectiveTeamSchedulesForCampuses } from "./effectiveTeamSchedules.ts";

test("campus-specific schedules override legacy shared schedules", () => {
  const schedules = [
    {
      team_id: "team-3",
      campus_id: null,
      ministry_type: "video",
      time_of_day: null,
      resource_app_key: "worship",
      created_at: "2026-04-12T13:51:47.696Z",
    },
    {
      team_id: "team-1",
      campus_id: "central",
      ministry_type: "video",
      time_of_day: null,
      resource_app_key: "worship",
      created_at: "2026-06-14T23:19:36.297Z",
    },
  ];

  const effective = resolveEffectiveTeamSchedulesForCampuses(schedules, ["central", "shelbyville"]);

  assert.deepEqual(
    effective.map(({ campus_id, team_id }) => ({ campus_id, team_id })),
    [
      { campus_id: "central", team_id: "team-1" },
      { campus_id: "shelbyville", team_id: "team-3" },
    ],
  );
});

test("newest schedule wins when two rows have the same scope", () => {
  const effective = resolveEffectiveTeamSchedulesForCampuses(
    [
      {
        team_id: "old-team",
        campus_id: null,
        ministry_type: "video",
        created_at: "2026-04-01T00:00:00Z",
      },
      {
        team_id: "new-team",
        campus_id: null,
        ministry_type: "video",
        created_at: "2026-05-01T00:00:00Z",
      },
    ],
    ["central"],
  );

  assert.equal(effective.length, 1);
  assert.equal(effective[0].team_id, "new-team");
});
