import assert from "node:assert/strict";
import test from "node:test";
import { applyPushTemplates, canApplyPushTemplate, renderPushTemplate } from "./pushTemplate.ts";

test("an edited template replaces the caller copy when every filler is present", () => {
  const applied = applyPushTemplates({
    title: "🎵 You're Serving Today!",
    message: "You're on Electric for Team A today. See you at church!",
    url: "/calendar",
    titleTemplate: "See you {{day_word_title}}",
    bodyTemplate: "You're serving on {{positions}} with {{teams}} {{day_word}}.",
    urlTemplate: "/calendar",
    vars: {
      day_word_title: "Today",
      positions: "Electric Guitar",
      teams: "Team A",
      day_word: "today",
    },
    contentFromDb: true,
  });

  assert.equal(applied.title, "See you Today");
  assert.equal(applied.message, "You're serving on Electric Guitar with Team A today.");
  assert.equal(applied.url, "/calendar");
});

test("a filler the sender did not provide keeps that field's original wording", () => {
  assert.equal(
    canApplyPushTemplate("You're on {{positions}} for {{teams}}", { positions: "Drums" }),
    false,
  );

  const applied = applyPushTemplates({
    title: "Original title",
    message: "Original message",
    url: "/calendar",
    titleTemplate: "{{day_word_title}}",
    bodyTemplate: "You're on {{positions}}",
    urlTemplate: "/calendar?date={{date}}",
    vars: { positions: "Drums" },
    contentFromDb: true,
  });

  assert.equal(applied.title, "Original title");
  assert.equal(applied.message, "You're on Drums");
  assert.equal(applied.url, "/calendar");
});

test("templates stay unused until an admin saves them as the live message", () => {
  const applied = applyPushTemplates({
    title: "Original title",
    message: "Original message",
    titleTemplate: "New title",
    bodyTemplate: "New message",
    vars: {},
    contentFromDb: false,
  });

  assert.equal(applied.title, "Original title");
  assert.equal(applied.message, "Original message");
});

test("optional blank fillers collapse extra spaces", () => {
  assert.equal(
    renderPushTemplate("{{title}} on {{date}}{{time}}", {
      title: "Team Night",
      date: "Jul 12",
      time: "",
    }),
    "Team Night on Jul 12",
  );
});
