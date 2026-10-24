import assert from "node:assert/strict";
import test from "node:test";
import { findCampusColumnIndex } from "./teachingCampusColumns.ts";

const headers = [
  "Weekend Dates",
  "Teaching Topic",
  "Murfreesboro",
  "Cannon County",
  "Shelbyville",
  "Tullahoma",
  "Boro North",
];

test("teaching sheet columns map Central, Cannon County, and Shelbyville to different columns", () => {
  assert.equal(findCampusColumnIndex(headers, "Murfreesboro Central"), 2);
  assert.equal(findCampusColumnIndex(headers, "Cannon County"), 3);
  assert.equal(findCampusColumnIndex(headers, "Shelbyville"), 4);
  assert.equal(findCampusColumnIndex(headers, "Tullahoma"), 5);
  assert.equal(findCampusColumnIndex(headers, "Murfreesboro North"), 6);
});

test("plain Murfreesboro does not steal the North campus column", () => {
  assert.equal(findCampusColumnIndex(["Murfreesboro"], "Murfreesboro North"), -1);
  assert.equal(findCampusColumnIndex(["Murfreesboro"], "Murfreesboro Central"), 0);
});
