import assert from "node:assert/strict";
import test from "node:test";
import {
  buildServiceFlowClockTimes,
  formatClockTime,
  resolveScheduledServiceStartTime,
} from "./serviceFlowClock.ts";

test("item clocks run forward from the entered start time", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 300 },
      { id: "song", item_type: "song", title: "Song", duration_seconds: 240 },
      { id: "message", item_type: "item", title: "Message", duration_seconds: 1800 },
    ],
    "09:00",
  );

  assert.equal(clocks.get("welcome"), "9:00 AM");
  assert.equal(clocks.get("song"), "9:05 AM");
  assert.equal(clocks.get("message"), "9:09 AM");
});

test("announcements stay on the start time and earlier lines count backward", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "countdown", item_type: "item", title: "Countdown", duration_seconds: 300 },
      { id: "header", item_type: "header", title: "Announcements", duration_seconds: null },
      { id: "host", item_type: "item", title: "Name Place Holder", duration_seconds: 180 },
      { id: "song", item_type: "song", title: "Song", duration_seconds: 240 },
    ],
    "09:00",
  );

  assert.equal(clocks.get("countdown"), "8:55 AM");
  assert.equal(clocks.has("header"), false);
  assert.equal(clocks.get("host"), "9:00 AM");
  assert.equal(clocks.get("song"), "9:03 AM");
});

test("an empty start time leaves the clock off", () => {
  const clocks = buildServiceFlowClockTimes(
    [{ id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 60 }],
    "",
  );
  assert.equal(clocks.size, 0);
});

test("formatClockTime rolls past midnight", () => {
  assert.equal(formatClockTime(-60), "11:59 PM");
  assert.equal(formatClockTime(13 * 3600 + 5 * 60), "1:05 PM");
});

test("a saved flow start time is preferred, then the day's override, then the campus default", () => {
  const campus = {
    saturday_service_time: ["16:00:00"],
    sunday_service_time: ["09:00:00", "11:00:00"],
  };

  assert.equal(
    resolveScheduledServiceStartTime({
      customServiceStartTime: "18:30:00",
      serviceDate: "2026-09-27",
      ministryType: "weekend",
      campusId: "campus-1",
      campus,
      overrides: [
        {
          campus_id: "campus-1",
          ministry_type: "weekend",
          service_date: "2026-09-27",
          service_times: ["10:15"],
        },
      ],
    }),
    "18:30",
  );

  assert.equal(
    resolveScheduledServiceStartTime({
      serviceDate: "2026-09-27",
      ministryType: "weekend",
      campusId: "campus-1",
      campus,
      overrides: [
        {
          campus_id: "campus-1",
          ministry_type: "weekend",
          service_date: "2026-09-27",
          service_times: ["10:15"],
        },
      ],
    }),
    "10:15",
  );

  assert.equal(
    resolveScheduledServiceStartTime({
      serviceDate: "2026-09-27",
      ministryType: "weekend",
      campusId: "campus-1",
      campus,
    }),
    "09:00",
  );
});
