import assert from "node:assert/strict";
import test from "node:test";
import {
  assignChannelColor,
  emptyChannelColorStore,
  resolveChannelTone,
} from "./channelColors.ts";

test("uses palette order until a channel color is chosen", () => {
  const store = emptyChannelColorStore();
  assert.equal(resolveChannelTone(store, "wl", "vocalist_1", 0).id, "sky");
  assert.equal(resolveChannelTone(store, "drums", "drums", 2).id, "emerald");
  assert.equal(resolveChannelTone(store, "extra", null, 8).id, "sky");
});

test("keeps a chosen color with the position when the channel id changes", () => {
  const store = assignChannelColor(emptyChannelColorStore(), "old-wl", "vocalist_1", "rose");
  assert.equal(resolveChannelTone(store, "new-wl", "vocalist_1", 0).id, "rose");
});

test("prefers the color saved for this channel over the position", () => {
  const store = assignChannelColor(
    { byChannelId: {}, bySlot: { vocalist_1: "rose" } },
    "wl",
    null,
    "orange",
  );
  assert.equal(resolveChannelTone(store, "wl", "vocalist_1", 0).id, "orange");
});

test("ignores an unknown saved color", () => {
  const store = { byChannelId: { wl: "nope" }, bySlot: {} };
  assert.equal(resolveChannelTone(store, "wl", null, 1).id, "amber");
});
