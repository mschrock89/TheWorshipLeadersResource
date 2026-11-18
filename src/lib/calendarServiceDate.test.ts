import assert from "node:assert/strict";
import test from "node:test";
import { closestCalendarServiceDate } from "./calendarServiceDate.ts";
import { formatDateForDB } from "./dateUtils.ts";

const today = new Date(2026, 10, 18);

test("the nearest audition date is selected, including one that already happened", () => {
  const selected = closestCalendarServiceDate(today, ["2026-11-16", "2026-12-02"]);
  assert.equal(formatDateForDB(selected), "2026-11-16");
});

test("a future service wins when it is nearer than an older one", () => {
  const selected = closestCalendarServiceDate(today, ["2026-10-01", "2026-11-20"]);
  assert.equal(formatDateForDB(selected), "2026-11-20");
});

test("today is selected when the ministry has no service dates", () => {
  const selected = closestCalendarServiceDate(today, []);
  assert.equal(formatDateForDB(selected), "2026-11-18");
});

test("a future date wins when it is the same distance as a past date", () => {
  const selected = closestCalendarServiceDate(today, ["2026-11-17", "2026-11-19"]);
  assert.equal(formatDateForDB(selected), "2026-11-19");
});
