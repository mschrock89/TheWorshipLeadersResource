import assert from "node:assert/strict";
import test from "node:test";
import { patchInput, routingRows, type RoutingStore, type RoutingTarget } from "./audioRouting.ts";

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

test("clears an input without removing the other patches", () => {
  let store = patchInput(emptyStore(), targets, "board", 0, "wl");
  store = patchInput(store, targets, "board", 1, "pastor");
  store = patchInput(store, targets, "board", 0, null);
  const rows = routingRows(2, targets, store, "board");
  assert.equal(rows[0].talkbackId, null);
  assert.equal(rows[1].talkbackId, "pastor");
  assert.equal(store.bySlot.vocalist_1, undefined);
});
