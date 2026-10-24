import assert from "node:assert/strict";
import test from "node:test";
import {
  buildServiceFlowClockTimes,
  findPreRollItem,
  formatClockTime,
  itemMarksServiceStart,
  preRollFireSeconds,
  preRollLeadSeconds,
  listScheduledServiceTimes,
  liveClockAnchorApplies,
  measureServiceFlowSpan,
  notesWithServiceStart,
  notesWithoutServiceStart,
  resolveLiveServiceStartTime,
  selectServiceTimeForLocalClock,
  serviceStartBoundaryItem,
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

test("the first item under Start is the service start and pre-service lines count backward", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "pre", item_type: "header", title: "Pre-Service", duration_seconds: null },
      { id: "countdown", item_type: "item", title: "Countdown", duration_seconds: 300 },
      { id: "opener", item_type: "item", title: "Opener", duration_seconds: 180 },
      { id: "start", item_type: "header", title: "Start", duration_seconds: null },
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 120 },
      { id: "song", item_type: "song", title: "Song", duration_seconds: 240 },
    ],
    "09:00",
  );

  assert.equal(clocks.has("pre"), false);
  assert.equal(clocks.has("start"), false);
  assert.equal(clocks.get("countdown"), "8:52 AM");
  assert.equal(clocks.get("opener"), "8:57 AM");
  assert.equal(clocks.get("welcome"), "9:00 AM");
  assert.equal(clocks.get("song"), "9:02 AM");
});

test("an announcements line before the Start header stays in pre-service", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "pre", item_type: "header", title: "Pre-Service", duration_seconds: null },
      { id: "host", item_type: "item", title: "Announcements", duration_seconds: 60 },
      { id: "start", item_type: "header", title: "Start", duration_seconds: null },
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 120 },
    ],
    "18:30",
  );

  assert.equal(clocks.get("host"), "6:29 PM");
  assert.equal(clocks.get("welcome"), "6:30 PM");
});

test("a marked line ends at the service start, so earlier lines stay before it", () => {
  const items = [
    { id: "ipod", item_type: "item", title: "iPod Music", duration_seconds: 10 * 60 },
    { id: "preroll", item_type: "item", title: "Pre-Roll", duration_seconds: 3 * 60, notes: "SERVICE START" },
    { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 2 * 60 },
  ];
  const clocks = buildServiceFlowClockTimes(items, "16:00");

  assert.equal(clocks.get("ipod"), "3:47 PM");
  assert.equal(clocks.get("preroll"), "3:57 PM");
  assert.equal(clocks.get("welcome"), "4:00 PM");
  assert.equal(serviceStartBoundaryItem(items)?.id, "preroll");
  assert.equal(measureServiceFlowSpan(items).preServiceSeconds, 13 * 60);
  assert.equal(measureServiceFlowSpan(items).serviceDurationSeconds, 2 * 60);
});

test("pre-roll starts at :54, the beginning of service", () => {
  const items = [
    { id: "ipod", item_type: "item", title: "iPod Music", duration_seconds: 10 * 60 },
    { id: "preroll", item_type: "item", title: "Pre-Roll Video", duration_seconds: 5 * 60, notes: "SERVICE START" },
    { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 2 * 60 },
  ];
  const clocks = buildServiceFlowClockTimes(items, "09:00", { preRollFireMinute: 54 });

  assert.equal(findPreRollItem(items)?.id, "preroll");
  assert.equal(clocks.get("ipod"), "8:44 AM");
  assert.equal(clocks.get("preroll"), "8:54 AM");
  assert.equal(clocks.get("welcome"), "8:59 AM");
  assert.equal(preRollFireSeconds(9 * 3600), 8 * 3600 + 54 * 60);
  assert.equal(preRollFireSeconds(11 * 3600), 10 * 3600 + 54 * 60);
  assert.equal(preRollLeadSeconds(9 * 3600), 6 * 60);
});

test("a six-minute pre-roll already lands on :54 for an on-the-hour service", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "ipod", item_type: "item", title: "iPod Music", duration_seconds: 10 * 60 },
      { id: "preroll", item_type: "item", title: "Pre-Roll", duration_seconds: 6 * 60, notes: "SERVICE START" },
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 2 * 60 },
    ],
    "09:00",
    { preRollFireMinute: 54 },
  );

  assert.equal(clocks.get("ipod"), "8:44 AM");
  assert.equal(clocks.get("preroll"), "8:54 AM");
  assert.equal(clocks.get("welcome"), "9:00 AM");
});

test("a live pre-roll cue keeps the actual time instead of snapping back to :54", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "ipod", item_type: "item", title: "iPod Music", duration_seconds: 10 * 60 },
      { id: "preroll", item_type: "item", title: "Pre-Roll", duration_seconds: 5 * 60, notes: "SERVICE START" },
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 2 * 60 },
    ],
    "09:00",
    { preRollFireMinute: 54, boundaryStartedAtSeconds: 8 * 3600 + 56 * 60 },
  );

  assert.equal(clocks.get("preroll"), "8:56 AM");
  assert.equal(clocks.get("welcome"), "9:01 AM");
});

test("the pre-roll MIDI time shifts every clock so that line still ends at the service start", () => {
  const clocks = buildServiceFlowClockTimes(
    [
      { id: "ipod", item_type: "item", title: "iPod Music", duration_seconds: 10 * 60 },
      { id: "preroll", item_type: "item", title: "Pre-Roll", duration_seconds: 3 * 60, notes: "MIDI C4\nSERVICE START" },
      { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 2 * 60 },
    ],
    "16:00",
    { boundaryStartedAtSeconds: 15 * 3600 + 58 * 60 },
  );

  assert.equal(clocks.get("ipod"), "3:48 PM");
  assert.equal(clocks.get("preroll"), "3:58 PM");
  assert.equal(clocks.get("welcome"), "4:01 PM");
});

test("the service start mark stays out of visible notes and off other lines", () => {
  assert.equal(itemMarksServiceStart({ notes: "Hold\nSERVICE START" }), true);
  assert.equal(notesWithoutServiceStart("Hold\nSERVICE START\nMIDI C4"), "Hold\nMIDI C4");
  assert.equal(notesWithServiceStart("Hold\nMIDI C4", true), "Hold\nMIDI C4\nSERVICE START");
  assert.equal(notesWithServiceStart("Hold\nSERVICE START", false), "Hold");
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

  assert.deepEqual(
    listScheduledServiceTimes({
      serviceDate: "2026-09-27",
      ministryType: "weekend",
      campusId: "campus-1",
      campus,
    }),
    ["09:00", "11:00"],
  );

  assert.deepEqual(
    listScheduledServiceTimes({
      serviceDate: "2026-09-30",
      ministryType: "encounter",
      campusId: "campus-1",
      campus,
      recurringServiceTimes: ["18:30"],
    }),
    ["18:30"],
  );
});

test("the live clock follows the service that local time is in", () => {
  const times = ["09:00", "11:00"];
  const span = measureServiceFlowSpan([
    { id: "pre", item_type: "header", title: "Pre-Service", duration_seconds: null },
    { id: "countdown", item_type: "item", title: "Countdown", duration_seconds: 10 * 60 },
    { id: "start", item_type: "header", title: "Start", duration_seconds: null },
    { id: "welcome", item_type: "item", title: "Welcome", duration_seconds: 70 * 60 },
  ]);

  assert.equal(span.preServiceSeconds, 10 * 60);
  assert.equal(span.serviceDurationSeconds, 70 * 60);
  assert.equal(selectServiceTimeForLocalClock(times, 8 * 3600, span), "09:00");
  assert.equal(selectServiceTimeForLocalClock(times, 9 * 3600 + 30 * 60, span), "09:00");
  assert.equal(selectServiceTimeForLocalClock(times, 10 * 3600 + 50 * 60, span), "11:00");
  assert.equal(selectServiceTimeForLocalClock(times, 13 * 3600, span), "11:00");
});

test("live follows the scheduled service for today even when the flow saved an earlier start", () => {
  const times = ["08:00", "10:00", "12:00"];
  const span = { preServiceSeconds: 0, serviceDurationSeconds: 90 * 60 };

  assert.equal(
    resolveLiveServiceStartTime({
      scheduledTimes: times,
      savedStartTime: "08:00",
      nowSeconds: 9 * 3600 + 15 * 60,
      serviceDate: "2026-10-18",
      today: "2026-10-18",
      span,
    }),
    "08:00",
  );
  assert.equal(
    resolveLiveServiceStartTime({
      scheduledTimes: times,
      savedStartTime: "08:00",
      nowSeconds: 10 * 3600 + 5 * 60,
      serviceDate: "2026-10-18",
      today: "2026-10-18",
      span,
    }),
    "10:00",
  );
  assert.equal(
    resolveLiveServiceStartTime({
      scheduledTimes: times,
      savedStartTime: "08:00",
      nowSeconds: 19 * 3600,
      serviceDate: "2026-10-18",
      today: "2026-10-18",
      span,
    }),
    "12:00",
  );
  assert.equal(
    resolveLiveServiceStartTime({
      scheduledTimes: times,
      savedStartTime: "08:00",
      nowSeconds: 19 * 3600,
      serviceDate: "2026-10-19",
      today: "2026-10-18",
      span,
    }),
    "08:00",
  );
});

test("a pre-roll cue only shifts the service the clock is currently in", () => {
  const times = ["08:00", "10:00", "12:00"];
  assert.equal(liveClockAnchorApplies(12 * 3600 + 4 * 60, "12:00", times), true);
  assert.equal(liveClockAnchorApplies(10 * 3600, "12:00", times), false);
  assert.equal(liveClockAnchorApplies(8 * 3600 + 2 * 60, "08:00", times), true);
});
