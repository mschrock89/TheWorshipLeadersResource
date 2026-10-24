import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentsAreSamePerson,
  filterDatesForServiceDay,
  getServiceDayForDate,
  overrideAppliesToRosterDate,
} from "./weekendPositionSplit.ts";

test("weekend service day follows the calendar date", () => {
  assert.equal(getServiceDayForDate("2026-11-07"), "saturday");
  assert.equal(getServiceDayForDate("2026-11-08"), "sunday");
  assert.equal(getServiceDayForDate("2026-11-06"), null);
});

test("a Saturday override does not fill Sunday", () => {
  assert.equal(overrideAppliesToRosterDate("2026-11-07", "2026-11-07"), true);
  assert.equal(overrideAppliesToRosterDate("2026-11-07", "2026-11-08"), false);
  assert.equal(overrideAppliesToRosterDate("2026-11-08", "2026-11-07"), false);
});

test("a Friday override can still cover a weekend day with no day split", () => {
  assert.equal(overrideAppliesToRosterDate("2026-11-06", "2026-11-07"), true);
  assert.equal(overrideAppliesToRosterDate("2026-11-06", "2026-11-08"), true);
});

test("service day filter keeps only the requested day", () => {
  assert.deepEqual(
    filterDatesForServiceDay(["2026-11-07", "2026-11-08"], "sunday"),
    ["2026-11-08"],
  );
  assert.deepEqual(
    filterDatesForServiceDay(["2026-11-07", "2026-11-08"], null),
    ["2026-11-07", "2026-11-08"],
  );
});

test("matching weekend assignees stay one split", () => {
  assert.equal(
    assignmentsAreSamePerson(
      { user_id: "brent", member_name: "Brent R" },
      { user_id: "brent", member_name: "Brent R" },
    ),
    true,
  );
  assert.equal(
    assignmentsAreSamePerson(
      { user_id: "brent", member_name: "Brent R" },
      { user_id: "nathan", member_name: "Nathan T" },
    ),
    false,
  );
  assert.equal(
    assignmentsAreSamePerson(
      { user_id: null, member_name: "__TEAM_BUILDER_BLANK_SLOT__" },
      { user_id: null, member_name: "__TEAM_BUILDER_BLANK_SLOT__" },
    ),
    true,
  );
});
