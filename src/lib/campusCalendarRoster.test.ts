import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCampusCalendarRosterGate,
  isCalendarTeamScheduleVisible,
  isPublishedTeamBuilderAssignment,
  pickVisibleCampusScheduleEntry,
  selectPublishedScheduleEntries,
  unpublishedTeamBuilderKey,
} from "./campusCalendarRoster.ts";

const periods = [
  { id: "shelby-t3", name: "T3 2026" },
  { id: "shelby-t2", name: "T2 2026" },
];

test("a campus schedule row still shows when that week's roster is empty", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [],
    hides: [],
  });
  const entries = selectPublishedScheduleEntries(
    [
      {
        team_id: "team-4",
        campus_id: "shelbyville",
        schedule_date: "2026-11-22",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 4" },
      },
      {
        team_id: "team-4",
        campus_id: null,
        schedule_date: "2026-11-21",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 4" },
      },
    ],
    gate,
  );

  assert.deepEqual(entries.map((entry) => entry.schedule_date), ["2026-11-22"]);
});

test("an empty Team Builder period does not show copied or shared calendar teams", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    false,
  );
  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        rotation_period: "T3 2026",
        ministry_type: "video",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    false,
  );
});

test("a campus with no Team Builder does not inherit a shared team", () => {
  const gate = buildCampusCalendarRosterGate({
    periods: [],
    assignments: [],
    hides: [],
  });
  const shared = {
    team_id: "team-4",
    campus_id: null,
    schedule_date: "2026-11-22",
    rotation_period: "T3 2026",
    ministry_type: "weekend",
    worship_teams: { name: "Team 4" },
  };

  assert.equal(isCalendarTeamScheduleVisible(shared, gate), false);
  assert.deepEqual(selectPublishedScheduleEntries([shared], gate), []);
});

test("a standing team shows on every date, and a one-date fill-in stays on that date", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "team-2",
        teamName: "Team 2",
        userId: "person-1",
        memberName: "Avery",
      },
      {
        rotationPeriodId: "shelby-t3",
        teamId: "team-1",
        teamName: "Team 1",
        userId: "person-2",
        memberName: "John",
        scheduleDate: "2026-09-06",
      },
    ],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-2",
        schedule_date: "2026-11-08",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 2" },
      },
      gate,
    ),
    true,
  );
  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        schedule_date: "2026-09-06",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    true,
  );
  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        schedule_date: "2026-11-01",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    false,
  );
});

test("the same team name still shows when the schedule uses a different team id", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "roster-5th",
        teamName: "5th Sunday",
        userId: "person-1",
        memberName: "Avery",
      },
    ],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "schedule-5th",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "5th Sunday" },
      },
      gate,
    ),
    true,
  );
});

test("a hidden team stays off the calendar even when it has people", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "simple",
        teamName: "Simple Worship",
        userId: "person-1",
        memberName: "Avery",
      },
    ],
    hides: [{ rotationPeriodId: "shelby-t3", teamId: "simple" }],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "simple",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Simple Worship" },
      },
      gate,
    ),
    false,
  );
});

test("blank slots and other periods do not invent a T3 roster", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "team-1",
        teamName: "Team 1",
        userId: null,
        memberName: "__TEAM_BUILDER_BLANK_SLOT__",
      },
      {
        rotationPeriodId: "shelby-t2",
        teamId: "team-1",
        teamName: "Team 1",
        userId: "person-1",
        memberName: "Avery",
      },
    ],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    false,
  );
  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        rotation_period: "T2 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    true,
  );
});

test("a weekend fill on one day shows that team on the other day", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "team-1",
        teamName: "Team 1",
        userId: "person-1",
        memberName: "Avery",
        scheduleDate: "2026-11-08",
      },
    ],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        schedule_date: "2026-11-07",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    true,
  );
  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "team-1",
        schedule_date: "2026-11-07",
        rotation_period: "T3 2026",
        ministry_type: "video",
        worship_teams: { name: "Team 1" },
      },
      gate,
    ),
    false,
  );
});

test("an unpublished draft does not count, and a published ministry still does", () => {
  const unpublished = new Set([unpublishedTeamBuilderKey("shelby-t3", "weekend")]);

  assert.equal(
    isPublishedTeamBuilderAssignment("shelby-t3", ["weekend"], unpublished),
    false,
  );
  assert.equal(
    isPublishedTeamBuilderAssignment("shelby-t3", ["sunday_am"], unpublished),
    false,
  );
  assert.equal(
    isPublishedTeamBuilderAssignment("shelby-t3", ["video"], unpublished),
    true,
  );
  assert.equal(
    isPublishedTeamBuilderAssignment("shelby-t3", ["weekend"], new Set()),
    true,
  );
});

test("set builder uses the published weekend team, including the other weekend day", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [
      {
        rotationPeriodId: "shelby-t3",
        teamId: "team-2",
        teamName: "Team 2",
        userId: "person-1",
        memberName: "Avery",
        scheduleDate: "2026-11-08",
      },
    ],
    hides: [],
  });

  const picked = pickVisibleCampusScheduleEntry(
    [
      {
        team_id: "team-1",
        schedule_date: "2026-11-07",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        campus_id: "shelby",
        created_at: "2026-11-01T00:00:00Z",
        worship_teams: { name: "Team 1" },
      },
      {
        team_id: "team-2",
        schedule_date: "2026-11-08",
        rotation_period: "T3 2026",
        ministry_type: "weekend",
        campus_id: "shelby",
        created_at: "2026-11-02T00:00:00Z",
        worship_teams: { name: "Team 2" },
      },
    ],
    {
      campusId: "shelby",
      ministryType: "weekend",
      preferredDate: "2026-11-07",
      gate,
    },
  );

  assert.equal(picked?.team_id, "team-2");
});

test("network-wide camp schedules stay on the calendar without a campus roster", () => {
  const gate = buildCampusCalendarRosterGate({
    periods,
    assignments: [],
    hides: [],
  });

  assert.equal(
    isCalendarTeamScheduleVisible(
      {
        team_id: "camp-team",
        rotation_period: "T3 2026",
        ministry_type: "student_camp",
        worship_teams: { name: "Camp" },
      },
      gate,
    ),
    true,
  );
});
