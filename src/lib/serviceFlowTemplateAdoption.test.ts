import assert from "node:assert/strict";
import test from "node:test";
import {
  flowCanBeReplacedByTemplate,
  flowMatchesTemplateShape,
} from "./serviceFlowTemplateAdoption.ts";

const weekendTemplate = [
  { item_type: "header", title: "PRE-SERVICE", default_duration_seconds: null },
  { item_type: "item", title: "Pre-Roll", default_duration_seconds: 270 },
  { item_type: "song_placeholder", title: "Song", default_duration_seconds: 300 },
  { item_type: "header", title: "MESSAGE", default_duration_seconds: null },
];

test("an untouched generated flow can be replaced by a newly saved template", () => {
  const flow = [
    { item_type: "header", title: "PRE-SERVICE", duration_seconds: null },
    { item_type: "item", title: "Pre-Roll", duration_seconds: 270 },
    { item_type: "song", title: "Build My Life", duration_seconds: 312 },
    { item_type: "header", title: "MESSAGE", duration_seconds: null },
    { item_type: "song", title: "Goodness of God", duration_seconds: 280 },
  ];
  assert.equal(flowMatchesTemplateShape(flow, weekendTemplate), true);
  assert.equal(flowCanBeReplacedByTemplate(flow, weekendTemplate), true);
});

test("a renamed or retimed row is kept", () => {
  const renamed = [
    { item_type: "header", title: "WELCOME", duration_seconds: null },
    { item_type: "item", title: "Pre-Roll", duration_seconds: 270 },
    { item_type: "song", title: "Build My Life", duration_seconds: 312 },
    { item_type: "header", title: "MESSAGE", duration_seconds: null },
  ];
  const retimed = [
    { item_type: "header", title: "PRE-SERVICE", duration_seconds: null },
    { item_type: "item", title: "Pre-Roll", duration_seconds: 180 },
    { item_type: "song", title: "Build My Life", duration_seconds: 312 },
    { item_type: "header", title: "MESSAGE", duration_seconds: null },
  ];
  assert.equal(flowCanBeReplacedByTemplate(renamed, weekendTemplate), false);
  assert.equal(flowCanBeReplacedByTemplate(retimed, weekendTemplate), false);
});

test("song-only flows adopt a template, edited rundowns with headers do not", () => {
  const songs = [
    { item_type: "song", title: "Build My Life", duration_seconds: 300 },
    { item_type: "song", title: "Goodness of God", duration_seconds: 280 },
  ];
  assert.equal(flowCanBeReplacedByTemplate(songs, null), true);
  assert.equal(flowCanBeReplacedByTemplate(songs, []), true);
  assert.equal(flowCanBeReplacedByTemplate([], weekendTemplate), true);
  assert.equal(
    flowCanBeReplacedByTemplate(
      [{ item_type: "header", title: "CUSTOM", duration_seconds: null }, ...songs],
      null,
    ),
    false,
  );
});
