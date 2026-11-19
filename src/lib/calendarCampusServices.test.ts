import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarCampusServiceWeekdays,
  listCalendarCampusServices,
} from "./calendarCampusServices.ts";
import type { MinistryServiceScheduleRow } from "./campusMinistrySchedule.ts";

const campus = {
  id: "campus-1",
  has_saturday_service: true,
  has_sunday_service: true,
  saturday_service_time: ["17:00"],
  sunday_service_time: ["09:00", "11:00"],
};

const views = ["weekend_team", "encounter", "eon_weekend", "student_camp", "prayer_night"];

const schedules: MinistryServiceScheduleRow[] = [
  {
    campus_id: campus.id,
    ministry_type: "encounter",
    day_of_week: 3,
    service_times: ["18:30"],
  },
  {
    campus_id: campus.id,
    ministry_type: "eon_weekend",
    day_of_week: 6,
    service_times: ["16:00"],
  },
];

test("a Saturday shows each weekend service, and Wednesday shows Encounter", () => {
  const saturday = listCalendarCampusServices({
    date: new Date(2026, 10, 21),
    campusId: campus.id,
    campus,
    viewMinistries: views,
    schedules,
    scheduleEntries: [
      { ministry_type: "weekend", time_of_day: null },
      { ministry_type: "production", time_of_day: null },
      { ministry_type: "eon_weekend", time_of_day: null },
    ],
  });
  assert.deepEqual(
    saturday.map((service) => service.label),
    ["Weekend Worship", "MS Worship Weekend"],
  );
  assert.deepEqual(saturday[0]?.times, ["17:00"]);
  assert.equal(saturday[0]?.rosterMinistry, "weekend_team");

  const wednesday = listCalendarCampusServices({
    date: new Date(2026, 10, 18),
    campusId: campus.id,
    campus,
    viewMinistries: views,
    schedules,
    scheduleEntries: [{ ministry_type: "encounter", time_of_day: null }],
  });
  assert.deepEqual(
    wednesday.map((service) => service.key),
    ["encounter"],
  );
  assert.deepEqual(wednesday[0]?.times, ["18:30"]);
});

test("student camp sessions on the same day stay separate", () => {
  const services = listCalendarCampusServices({
    date: new Date(2026, 6, 8),
    campusId: campus.id,
    campus,
    viewMinistries: views,
    schedules: [],
    scheduleEntries: [
      { ministry_type: "student_camp", time_of_day: "evening" },
      { ministry_type: "student_camp", time_of_day: "morning" },
    ],
  });
  assert.deepEqual(
    services.map((service) => service.songMinistry),
    ["student_camp_morning", "student_camp_evening"],
  );
});

test("video and speakers stay on Weekend Worship instead of repeating as their own services", () => {
  const services = listCalendarCampusServices({
    date: new Date(2026, 10, 21),
    campusId: campus.id,
    campus,
    viewMinistries: [...views, "production", "video", "speaker"],
    schedules,
    scheduleEntries: [
      { ministry_type: "weekend", time_of_day: null },
      { ministry_type: "production", time_of_day: null },
      { ministry_type: "video", time_of_day: null },
      { ministry_type: "speaker", time_of_day: null },
      { ministry_type: "eon_weekend", time_of_day: null },
    ],
  });
  assert.deepEqual(
    services.map((service) => service.label),
    ["Weekend Worship", "MS Worship Weekend"],
  );
});

test("a ministry with no service that day is left off", () => {
  const services = listCalendarCampusServices({
    date: new Date(2026, 10, 19),
    campusId: campus.id,
    campus,
    viewMinistries: views,
    schedules,
    scheduleEntries: [],
  });
  assert.deepEqual(services, []);
});

test("service weekdays combine weekend days and saved midweek days", () => {
  assert.deepEqual(
    calendarCampusServiceWeekdays({
      campusId: campus.id,
      campus,
      viewMinistries: views,
      schedules,
    }),
    [0, 3, 6],
  );
});
