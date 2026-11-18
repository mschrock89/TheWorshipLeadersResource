import assert from "node:assert/strict";
import test from "node:test";
import { anchorWeekendPlanDate } from "./campusWeekendPlanDate.ts";

const shelbyville = { has_saturday_service: false, has_sunday_service: true };
const central = { has_saturday_service: true, has_sunday_service: true };

test("Shelbyville Set Builder uses Sunday, including when the picker lands on Saturday", () => {
  const saturday = new Date(2026, 10, 21);
  const sunday = anchorWeekendPlanDate(saturday, shelbyville);
  assert.equal(sunday.getFullYear(), 2026);
  assert.equal(sunday.getMonth(), 10);
  assert.equal(sunday.getDate(), 22);

  const wednesday = new Date(2026, 10, 18);
  const nextService = anchorWeekendPlanDate(wednesday, shelbyville);
  assert.equal(nextService.getDate(), 22);
});

test("a campus that meets both days still plans the weekend from Saturday", () => {
  const sunday = new Date(2026, 10, 22);
  const saturday = anchorWeekendPlanDate(sunday, central);
  assert.equal(saturday.getDate(), 21);
});
