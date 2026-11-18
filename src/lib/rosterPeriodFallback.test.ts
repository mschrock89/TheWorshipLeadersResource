import assert from "node:assert/strict";
import test from "node:test";
import {
  compareRosterFallbackPeriods,
  shouldBorrowRosterFromAnotherPeriod,
} from "./rosterPeriodFallback.ts";

test("an empty current trimester does not borrow an older active roster", () => {
  assert.equal(shouldBorrowRosterFromAnotherPeriod(1, 0), false);
  assert.equal(shouldBorrowRosterFromAnotherPeriod(0, 0), true);
  assert.equal(shouldBorrowRosterFromAnotherPeriod(1, 4), false);
});

test("the trimester that contains the date beats a stale active flag", () => {
  const staleActive = {
    isActive: true,
    containsDate: false,
    distance: 100,
    startTime: 1,
  };
  const current = {
    isActive: false,
    containsDate: true,
    distance: 10,
    startTime: 2,
  };

  assert.ok(compareRosterFallbackPeriods(current, staleActive) < 0);
});
