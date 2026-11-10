import assert from "node:assert/strict";
import test from "node:test";
import {
  flowCanBeReplacedByTemplate,
  flowMatchesTemplateShape,
  missingTemplateRows,
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

test("a flow that kept template order gets back only the deleted rows", () => {
  const template = [
    { item_type: "header", title: "PRE-SERVICE", sequence_order: 0 },
    { item_type: "item", title: "iPod Music", sequence_order: 1 },
    { item_type: "item", title: "Pre-Roll Video", sequence_order: 2 },
    { item_type: "header", title: "ANNCOUNCEMENTS", sequence_order: 3 },
    { item_type: "song_placeholder", title: "Song 1", sequence_order: 8 },
    { item_type: "song_placeholder", title: "Song 2", sequence_order: 9 },
    { item_type: "song_placeholder", title: "Song 4", sequence_order: 11 },
  ];
  const flow = [
    { sequence_order: 0 },
    { sequence_order: 2 },
    { sequence_order: 8 },
    { sequence_order: 11 },
  ];
  assert.deepEqual(
    missingTemplateRows(flow, template).map((item) => item.title),
    ["iPod Music", "ANNCOUNCEMENTS", "Song 2"],
  );
  assert.deepEqual(
    missingTemplateRows([{ sequence_order: 0 }, { sequence_order: 99 }], template),
    [],
  );
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
