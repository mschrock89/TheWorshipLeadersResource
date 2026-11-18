import assert from "node:assert/strict";
import test from "node:test";
import { isWorshipTeamVisibleForScope } from "./constants.ts";

const campusA = "campus-a";
const campusB = "campus-b";

test("a custom team stays in the campus and ministry it was created for", () => {
  const fallKickoff = {
    name: "Fall Kickoff",
    campus_id: campusA,
    ministry_type: "encounter",
  };

  assert.equal(isWorshipTeamVisibleForScope(fallKickoff, campusA, "encounter"), true);
  assert.equal(isWorshipTeamVisibleForScope(fallKickoff, campusA, "weekend"), false);
  assert.equal(isWorshipTeamVisibleForScope(fallKickoff, campusA, "weekend_team"), false);
  assert.equal(isWorshipTeamVisibleForScope(fallKickoff, campusB, "encounter"), false);
});

test("weekend aliases still see a weekend custom team at that campus", () => {
  const kickoff = {
    name: "Fall Kickoff",
    campus_id: campusA,
    ministry_type: "weekend",
  };

  assert.equal(isWorshipTeamVisibleForScope(kickoff, campusA, "weekend_team"), true);
  assert.equal(isWorshipTeamVisibleForScope(kickoff, campusA, "encounter"), false);
});

test("shared rotation teams still follow the ministry list at every campus", () => {
  const teamOne = { name: "Team 1", campus_id: null, ministry_type: null };

  assert.equal(isWorshipTeamVisibleForScope(teamOne, campusA, "weekend"), true);
  assert.equal(isWorshipTeamVisibleForScope(teamOne, campusB, "encounter"), true);
  assert.equal(isWorshipTeamVisibleForScope(teamOne, campusA, "evident"), true);
});

test("an unscoped custom team is not shown in every ministry", () => {
  const looseTeam = { name: "Fall Kickoff", campus_id: null, ministry_type: null };

  assert.equal(isWorshipTeamVisibleForScope(looseTeam, campusA, "encounter"), false);
  assert.equal(isWorshipTeamVisibleForScope(looseTeam, campusA, "weekend"), false);
});
