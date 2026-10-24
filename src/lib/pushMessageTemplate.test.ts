import assert from "node:assert/strict";
import test from "node:test";
import { describeWhen, extractTemplateKeys, missingFillers, splitPushTemplate } from "./pushMessageTemplate.ts";

test("fillers in a message are found and the missing ones are called out", () => {
  const body = "You're on {{positions}} for {{teams}} {{day_word}}.";
  assert.deepEqual(extractTemplateKeys(body), ["positions", "teams", "day_word"]);
  assert.deepEqual(missingFillers([body, "See you {{day_word_title}}"], ["positions", "teams", "date"]), ["date"]);
});

test("link-only fillers are not treated as missing from the sentence", () => {
  assert.deepEqual(missingFillers(["Hello"], ["set_id", "original_url"]), []);
});

test("a template splits into words and fillers", () => {
  assert.deepEqual(splitPushTemplate("Hello {{name}}!"), [
    { type: "text", value: "Hello " },
    { type: "filler", key: "name" },
    { type: "text", value: "!" },
  ]);
});

test("schedule timing is written in plain language", () => {
  assert.equal(
    describeWhen("schedule-reminder", "Cron: Saturday 8:00 AM America/Chicago"),
    "Saturday morning at 8:00 AM",
  );
  assert.equal(describeWhen("event", "Creating a calendar event"), "Creating a calendar event");
});
