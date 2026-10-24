import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDayScheduleDrafts,
  configuredServiceWeekdays,
  enabledScheduleRows,
  ministryScheduleIsInherited,
  recurringServiceTimesForDate,
  weekendColumnsFromDrafts,
} from "./campusMinistrySchedule.ts";

const campus = {
  has_saturday_service: true,
  has_sunday_service: true,
  saturday_service_time: ["17:00:00"],
  sunday_service_time: ["09:00:00", "11:00:00"],
};

test("weekend drafts start from the campus Saturday and Sunday times", () => {
  const drafts = buildDayScheduleDrafts({ ministryType: "weekend", campus, rows: [] });
  const saturday = drafts.find((draft) => draft.day === 6);
  const sunday = drafts.find((draft) => draft.day === 0);
  const wednesday = drafts.find((draft) => draft.day === 3);
  assert.equal(saturday?.enabled, true);
  assert.deepEqual(saturday?.times, ["17:00"]);
  assert.equal(sunday?.enabled, true);
  assert.deepEqual(sunday?.times, ["09:00", "11:00"]);
  assert.equal(wednesday?.enabled, false);
});

test("a saved ministry schedule replaces the weekend days", () => {
  const drafts = buildDayScheduleDrafts({
    ministryType: "encounter",
    campus,
    rows: [
      {
        campus_id: "central",
        ministry_type: "encounter",
        day_of_week: 3,
        service_times: ["18:30"],
      },
    ],
  });
  assert.equal(drafts.find((draft) => draft.day === 6)?.enabled, false);
  assert.equal(drafts.find((draft) => draft.day === 3)?.enabled, true);
  assert.deepEqual(drafts.find((draft) => draft.day === 3)?.times, ["18:30"]);
  assert.equal(
    ministryScheduleIsInherited("encounter", [
      { campus_id: "central", ministry_type: "encounter", day_of_week: 3, service_times: ["18:30"] },
    ]),
    false,
  );
});

test("production follows weekend days until it has its own rows", () => {
  const rows = [
    { campus_id: "central", ministry_type: "weekend", day_of_week: 0, service_times: ["09:00"] },
  ];
  assert.equal(ministryScheduleIsInherited("production", rows), true);
  const drafts = buildDayScheduleDrafts({ ministryType: "production", campus, rows });
  assert.equal(drafts.find((draft) => draft.day === 6)?.enabled, true);
  assert.equal(drafts.find((draft) => draft.day === 0)?.enabled, true);
});

test("saving weekend drafts writes the campus Saturday and Sunday columns", () => {
  const drafts = buildDayScheduleDrafts({ ministryType: "weekend", campus, rows: [] });
  const wednesday = drafts.find((draft) => draft.day === 3)!;
  wednesday.enabled = true;
  wednesday.times = ["19:00"];
  const columns = weekendColumnsFromDrafts(drafts);
  assert.equal(columns.has_saturday_service, true);
  assert.equal(columns.has_sunday_service, true);
  assert.deepEqual(columns.saturday_service_time, ["17:00"]);
  assert.deepEqual(enabledScheduleRows(drafts).map((row) => row.day_of_week).sort(), [0, 3, 6]);
});

test("a ministry schedule supplies times only on its configured weekday", () => {
  const rows = [
    { campus_id: "central", ministry_type: "encounter", day_of_week: 3, service_times: ["18:30:00"] },
  ];
  assert.deepEqual(recurringServiceTimesForDate(rows, "central", "encounter", "2026-09-30"), ["18:30"]);
  assert.deepEqual(recurringServiceTimesForDate(rows, "central", "encounter", "2026-09-27"), []);
  assert.equal(recurringServiceTimesForDate(rows, "central", "eon", "2026-09-30"), null);
  assert.deepEqual(configuredServiceWeekdays(rows, "central", "encounter"), [3]);
  assert.equal(configuredServiceWeekdays(rows, "central", "weekend_team"), null);
});
