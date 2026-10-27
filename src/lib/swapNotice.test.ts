import assert from "node:assert/strict";
import test from "node:test";
import { daysUntilSwapDate, isSwapDateTooSoon } from "./swapNotice.ts";

const today = "2026-10-26";

test("a swap date 7 days out is allowed", () => {
  assert.equal(daysUntilSwapDate("2026-11-02", today), 7);
  assert.equal(isSwapDateTooSoon("2026-11-02", new Date("2026-10-26T15:00:00Z")), false);
});

test("a swap date 6 days out is blocked", () => {
  assert.equal(daysUntilSwapDate("2026-11-01", today), 6);
  assert.equal(isSwapDateTooSoon("2026-11-01", new Date("2026-10-26T15:00:00Z")), true);
});

test("today and past dates are blocked", () => {
  assert.equal(isSwapDateTooSoon("2026-10-26", new Date("2026-10-26T15:00:00Z")), true);
  assert.equal(isSwapDateTooSoon("2026-10-20", new Date("2026-10-26T15:00:00Z")), true);
});

test("church today is America/Chicago, so late UTC evening is still the same church day", () => {
  // 2026-10-27 02:30 UTC is 2026-10-26 21:30 in Chicago.
  const now = new Date("2026-10-27T02:30:00Z");
  assert.equal(isSwapDateTooSoon("2026-11-02", now), false);
  assert.equal(isSwapDateTooSoon("2026-11-01", now), true);
});
