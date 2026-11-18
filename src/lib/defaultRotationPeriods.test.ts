import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultRotationPeriods } from "./defaultRotationPeriods.ts";

test("a new campus gets this year and next, with the current trimester active", () => {
  const periods = buildDefaultRotationPeriods("mcminnville", new Date(2026, 10, 18));
  assert.deepEqual(
    periods.map((period) => [period.name, period.start_date, period.end_date, period.is_active]),
    [
      ["T1 2026", "2026-01-01", "2026-04-30", false],
      ["T2 2026", "2026-05-01", "2026-08-31", false],
      ["T3 2026", "2026-09-01", "2026-12-31", true],
      ["T1 2027", "2027-01-01", "2027-04-30", false],
      ["T2 2027", "2027-05-01", "2027-08-31", false],
      ["T3 2027", "2027-09-01", "2027-12-31", false],
    ],
  );
  assert.equal(periods.filter((period) => period.is_active).length, 1);
  assert.ok(periods.every((period) => period.campus_id === "mcminnville"));
});
