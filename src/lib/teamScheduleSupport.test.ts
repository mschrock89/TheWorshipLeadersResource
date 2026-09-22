import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentMatchesSupportScheduleMinistry,
  inferAssignmentMinistryTypes,
} from "./teamScheduleSupport.ts";

test("speaker slots infer speaker ministry when tags are missing", () => {
  assert.deepEqual(inferAssignmentMinistryTypes([], "Teacher", "teacher"), ["speaker"]);
  assert.deepEqual(inferAssignmentMinistryTypes(null, "Closing Prayer", "closing_prayer"), ["speaker"]);
  assert.deepEqual(inferAssignmentMinistryTypes(["speaker", "weekend"], "Teacher", "teacher"), [
    "speaker",
    "weekend",
  ]);
  assert.deepEqual(inferAssignmentMinistryTypes([], "vocalist", "vocalist_1"), []);
});

test("speaker-only assignments match speaker dates and ignore leftover weekend dates", () => {
  assert.equal(assignmentMatchesSupportScheduleMinistry(["speaker"], "speaker"), true);
  assert.equal(assignmentMatchesSupportScheduleMinistry(["speaker"], "weekend"), false);
  assert.equal(assignmentMatchesSupportScheduleMinistry(["speaker"], "weekend_team"), false);
  assert.equal(assignmentMatchesSupportScheduleMinistry(["speaker"], "sunday_am"), false);
});

test("weekend worship assignments ignore independent speaker dates", () => {
  assert.equal(assignmentMatchesSupportScheduleMinistry(["weekend"], "speaker"), false);
  assert.equal(assignmentMatchesSupportScheduleMinistry(["weekend"], "weekend"), true);
  assert.equal(assignmentMatchesSupportScheduleMinistry(["weekend_team"], "sunday_am"), true);
});

test("empty ministry tags do not inherit leftover weekend dates onto speaker rows", () => {
  assert.equal(assignmentMatchesSupportScheduleMinistry([], "speaker"), false);
  assert.equal(assignmentMatchesSupportScheduleMinistry([], "weekend"), true);
});
