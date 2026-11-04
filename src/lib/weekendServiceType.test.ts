import assert from "node:assert/strict";
import test from "node:test";
import { isWeekendServiceTypeName } from "./weekendServiceType.ts";

const campuses = ["Cannon County", "Murfreesboro Central", "Shelbyville", "Tullahoma"];

test("campus weekend services count, and elementary or student services do not", () => {
  assert.equal(isWeekendServiceTypeName("Cannon County Worship", campuses), true);
  assert.equal(isWeekendServiceTypeName("Murfreesboro Central", campuses), true);
  assert.equal(isWeekendServiceTypeName("Shelbyville Worship", campuses), true);
  assert.equal(isWeekendServiceTypeName("Weekend Worship", campuses), true);
  assert.equal(isWeekendServiceTypeName("Cannon County ES Wednesday Night", campuses), false);
  assert.equal(isWeekendServiceTypeName("Cannon County Kids Camp", campuses), false);
  assert.equal(isWeekendServiceTypeName("Encounter (CC)", campuses), false);
  assert.equal(isWeekendServiceTypeName("ES Sundays Shelbyville", campuses), false);
});
