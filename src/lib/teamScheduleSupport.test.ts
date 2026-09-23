import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentMatchesSupportScheduleMinistry,
  defaultMinistryTypesForAssignment,
  inferAssignmentMinistryTypes,
} from "./teamScheduleSupport.ts";

test("speaker slots infer speaker ministry when tags are missing", () => {
  assert.deepEqual(inferAssignmentMinistryTypes([], "Teacher", "teacher"), ["speaker"]);
  assert.deepEqual(inferAssignmentMinistryTypes(null, "Closing Prayer", "closing_prayer"), ["speaker"]);
  assert.deepEqual(inferAssignmentMinistryTypes(["speaker", "weekend"], "Announcements", "announcement"), [
    "speaker",
  ]);
  assert.deepEqual(inferAssignmentMinistryTypes(["weekend"], "announcement", "announcement"), ["speaker"]);
  assert.deepEqual(inferAssignmentMinistryTypes([], "vocalist", "vocalist_1"), []);
});

test("leftover weekend tags on an announcement slot do not light up Weekend Worship dates", () => {
  const leftoverTags = inferAssignmentMinistryTypes(["weekend", "speaker"], "Announcements", "announcement");
  assert.equal(assignmentMatchesSupportScheduleMinistry(leftoverTags, "speaker"), true);
  assert.equal(assignmentMatchesSupportScheduleMinistry(leftoverTags, "weekend"), false);
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

test("speaker slots persist as Speakers even when leftover Weekend tags exist", () => {
  assert.deepEqual(defaultMinistryTypesForAssignment(["weekend"], "Announcements", "announcement"), ["speaker"]);
  assert.deepEqual(defaultMinistryTypesForAssignment([], "Teacher", "teacher"), ["speaker"]);
  assert.deepEqual(defaultMinistryTypesForAssignment(null, "Closing Prayer", "closing_prayer"), ["speaker"]);
  assert.deepEqual(defaultMinistryTypesForAssignment(["weekend"], "vocalist", "vocalist_1"), ["weekend"]);
  assert.deepEqual(defaultMinistryTypesForAssignment([], "drums", "drums"), ["weekend"]);
});
