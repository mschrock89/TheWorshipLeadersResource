import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAudioRoutingDefault,
  assignSmpteInput,
  captureAudioRoutingDefault,
  parseAudioRoutingDefault,
  patchInput,
  PLAYBACK_SMPTE_ROUTE_ID,
  PROPRESENTER_SMPTE_ROUTE_ID,
  routingRows,
  sessionRoutingIdentities,
  type RoutingStore,
  type RoutingTarget,
} from "./audioRouting.ts";

const targets: RoutingTarget[] = [
  { id: "wl", positionSlot: "vocalist_1" },
  { id: "drums", positionSlot: "drums" },
  { id: "pastor", positionSlot: "teacher" },
];

function emptyStore(): RoutingStore {
  return { byChannelId: {}, bySlot: {} };
}

test("maps each opened input number to one talkback", () => {
  let store = patchInput(emptyStore(), targets, "board", 0, "wl");
  store = patchInput(store, targets, "board", 2, "drums");
  const rows = routingRows(4, targets, store, "board");
  assert.deepEqual(
    rows.map((row) => [row.inputNumber, row.talkbackId]),
    [
      [1, "wl"],
      [2, null],
      [3, "drums"],
      [4, null],
    ],
  );
  assert.equal(store.bySlot.drums.channelIndex, 2);
});

test("moves a talkback when it is patched to a new input", () => {
  let store = patchInput(emptyStore(), targets, "board", 0, "wl");
  store = patchInput(store, targets, "board", 3, "wl");
  const rows = routingRows(4, targets, store, "board");
  assert.equal(rows[0].talkbackId, null);
  assert.equal(rows[3].talkbackId, "wl");
  assert.equal(store.byChannelId.wl.channelIndex, 3);
});

test("selects separate ProPresenter and Playback SMPTE inputs", () => {
  const withSmpte = [
    ...targets,
    { id: PROPRESENTER_SMPTE_ROUTE_ID, positionSlot: null },
    { id: PLAYBACK_SMPTE_ROUTE_ID, positionSlot: null },
  ];
  let store = patchInput(emptyStore(), withSmpte, "board", 0, "wl");
  store = assignSmpteInput(store, targets, "board", 1, "propresenter");
  store = assignSmpteInput(store, targets, "board", 2, "playback");
  let rows = routingRows(4, withSmpte, store, "board");
  assert.equal(rows[0].talkbackId, "wl");
  assert.equal(rows[1].talkbackId, PROPRESENTER_SMPTE_ROUTE_ID);
  assert.equal(rows[2].talkbackId, PLAYBACK_SMPTE_ROUTE_ID);

  store = assignSmpteInput(store, targets, "board", 1, "playback");
  rows = routingRows(4, withSmpte, store, "board");
  assert.equal(rows[1].talkbackId, PLAYBACK_SMPTE_ROUTE_ID);
  assert.equal(store.byChannelId[PROPRESENTER_SMPTE_ROUTE_ID], undefined);

  store = assignSmpteInput(store, targets, "board", null, "playback");
  assert.equal(store.byChannelId[PLAYBACK_SMPTE_ROUTE_ID], undefined);
});

test("clears an input without removing the other patches", () => {
  let store = patchInput(emptyStore(), targets, "board", 0, "wl");
  store = patchInput(store, targets, "board", 1, "pastor");
  store = patchInput(store, targets, "board", 0, null);
  const rows = routingRows(2, targets, store, "board");
  assert.equal(rows[0].talkbackId, null);
  assert.equal(rows[1].talkbackId, "pastor");
  assert.equal(store.bySlot.vocalist_1, undefined);
});

test("saves a routing default and starts the next session from it", () => {
  const previous = sessionRoutingIdentities([
    { id: "old-wl", position_slot: "vocalist_1", label: "Worship Leader" },
    { id: "old-drums", position_slot: "drums", label: "Drums" },
    { id: "old-choir", position_slot: null, label: "Choir" },
  ]);
  let store = patchInput(emptyStore(), previous, "board", 0, "old-wl");
  store = patchInput(store, previous, "board", 4, "old-drums");
  store = patchInput(store, previous, "board", 7, "old-choir");
  store = assignSmpteInput(store, previous, "board", 11, "playback");
  store = assignSmpteInput(store, previous, "board", 12, "propresenter");

  const saved = captureAudioRoutingDefault(store, previous, "board", 48, "2026-10-10T12:00:00.000Z");
  const next = sessionRoutingIdentities([
    { id: "new-wl", position_slot: "vocalist_1", label: "WL" },
    { id: "new-drums", position_slot: "drums", label: "Drums" },
    { id: "new-choir", position_slot: null, label: " choir " },
  ]);
  const started = applyAudioRoutingDefault(saved, next);
  const rows = routingRows(16, next, started, "board");

  assert.equal(saved.deviceId, "board");
  assert.equal(saved.channelCount, 48);
  assert.equal(rows[0].talkbackId, "new-wl");
  assert.equal(rows[4].talkbackId, "new-drums");
  assert.equal(rows[7].talkbackId, "new-choir");
  assert.equal(rows[11].talkbackId, PLAYBACK_SMPTE_ROUTE_ID);
  assert.equal(rows[12].talkbackId, PROPRESENTER_SMPTE_ROUTE_ID);
  assert.equal(started.bySlot.vocalist_1.channelIndex, 0);
});

test("ignores a routing default that is missing its interface", () => {
  assert.equal(parseAudioRoutingDefault({ savedAt: "today", assignments: [] }), null);
  assert.equal(parseAudioRoutingDefault({ deviceId: "board", assignments: [{ key: "slot:drums", channelIndex: 1.5 }] }), null);
  const parsed = parseAudioRoutingDefault({
    deviceId: "board",
    savedAt: "today",
    channelCount: "nope",
    assignments: [
      { key: "slot:drums", channelIndex: 2 },
      { key: "", channelIndex: 1 },
    ],
  });
  assert.deepEqual(parsed, {
    deviceId: "board",
    channelCount: null,
    savedAt: "today",
    assignments: [{ key: "slot:drums", channelIndex: 2 }],
  });
});
