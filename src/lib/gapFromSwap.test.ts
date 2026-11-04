import assert from "node:assert/strict";
import test from "node:test";
import { gapMinistryForSwap, gapSlotForPosition, gapSlotFromAssignments, swapCanBecomeGap } from "./gapFromSwap.ts";

test("an exact slot label maps to that chair", () => {
  assert.equal(gapSlotForPosition("EG 2"), "eg_2");
  assert.equal(gapSlotForPosition("vocalist_3"), "vocalist_3");
  assert.equal(gapSlotForPosition("drums"), "drums");
});

test("a position family falls back to the first chair in that family", () => {
  assert.equal(gapSlotForPosition("electric_guitar"), "eg_1");
  assert.equal(gapSlotForPosition("vocalist"), "vocalist_1");
});

test("a scheduled chair wins over the family default", () => {
  assert.equal(
    gapSlotFromAssignments("electric_guitar", [
      { position: "electric_guitar", position_slot: "eg_2" },
      { position: "electric_guitar", position_slot: "eg_1" },
    ]),
    "eg_2",
  );
});

test("a date override listed first wins over the base roster", () => {
  assert.equal(
    gapSlotFromAssignments("vocalist", [
      { position: "vocalist", position_slot: "vocalist_4" },
      { position: "vocalist", position_slot: "vocalist_1" },
    ]),
    "vocalist_4",
  );
});

test("weekend worship stays weekend worship for a band slot", () => {
  assert.equal(gapMinistryForSwap("weekend", "drums"), "weekend_team");
  assert.equal(gapMinistryForSwap(null, "drums"), "weekend_team");
});

test("a production chair uses the production ministry when the swap has none", () => {
  assert.equal(gapMinistryForSwap(null, "foh"), "production");
  assert.equal(gapMinistryForSwap("hs_production", "FOH"), "hs_production");
});

test("a session ministry keeps its base ministry", () => {
  assert.equal(gapMinistryForSwap("student_camp_evening", "drums"), "student_camp");
});

test("only an upcoming swap with no one covering it can become a gap", () => {
  const today = "2026-11-04";
  assert.equal(swapCanBecomeGap({ status: "pending", original_date: "2026-11-08" }, today), true);
  assert.equal(swapCanBecomeGap({ status: "declined", original_date: "2026-11-08" }, today), true);
  assert.equal(swapCanBecomeGap({ status: "accepted", original_date: "2026-11-08" }, today), false);
  assert.equal(swapCanBecomeGap({ status: "cancelled", original_date: "2026-11-08" }, today), false);
  assert.equal(swapCanBecomeGap({ status: "pending", original_date: "2026-11-01" }, today), false);
});
