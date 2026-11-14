import assert from "node:assert/strict";
import test from "node:test";
import { isOpenSongSlot, planServiceFlowSongPlacement, type FlowSongRow } from "./serviceFlowSongSlots.ts";

function row(overrides: Partial<FlowSongRow> & Pick<FlowSongRow, "id" | "item_type" | "title" | "sequence_order">): FlowSongRow {
  return {
    song_id: null,
    song_key: null,
    ...overrides,
  };
}

test("template song placeholders are open slots", () => {
  assert.equal(isOpenSongSlot({ item_type: "item", title: "Song Placeholder" }), true);
  assert.equal(isOpenSongSlot({ item_type: "item", title: "Song 2" }), true);
  assert.equal(isOpenSongSlot({ item_type: "item", title: "Song" }), true);
  assert.equal(isOpenSongSlot({ item_type: "item", title: "Welcome" }), false);
  assert.equal(isOpenSongSlot({ item_type: "header", title: "Song Placeholder" }), false);
  assert.equal(isOpenSongSlot({ item_type: "song", title: "Build My Life" }), false);
});

test("live service flow places setlist titles into song placeholder rows", () => {
  const plan = planServiceFlowSongPlacement(
    [
      row({ id: "welcome", item_type: "item", title: "Welcome", sequence_order: 0 }),
      row({ id: "slot-1", item_type: "item", title: "Song Placeholder", sequence_order: 1 }),
      row({ id: "slot-2", item_type: "item", title: "Song 2", sequence_order: 2 }),
      row({ id: "message", item_type: "item", title: "Message", sequence_order: 3 }),
    ],
    [
      { id: "song-a", title: "Build My Life", key: "A" },
      { id: "song-b", title: "Goodness of God", key: "G" },
    ],
  );

  assert.deepEqual(plan.updates, [
    {
      id: "slot-1",
      song_id: "song-a",
      title: "Build My Life",
      song_key: "A",
      clearDuration: false,
    },
    {
      id: "slot-2",
      song_id: "song-b",
      title: "Goodness of God",
      song_key: "G",
      clearDuration: false,
    },
  ]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.shifts, []);
});

test("a swapped song updates that worship row and a placeholder takes the next song", () => {
  const plan = planServiceFlowSongPlacement(
    [
      row({
        id: "first",
        item_type: "song",
        title: "Great Is Thy Faithfulness",
        sequence_order: 1,
        song_id: "old",
      }),
      row({ id: "slot", item_type: "item", title: "Song Placeholder", sequence_order: 2 }),
      row({ id: "close", item_type: "item", title: "Closing Prayer", sequence_order: 3 }),
    ],
    [
      { id: "new", title: "How Great Thou Art", key: "D" },
      { id: "extra", title: "Build My Life", key: "A" },
    ],
  );

  assert.equal(plan.updates[0]?.id, "first");
  assert.equal(plan.updates[0]?.title, "How Great Thou Art");
  assert.equal(plan.updates[0]?.clearDuration, true);
  assert.equal(plan.updates[1]?.id, "slot");
  assert.equal(plan.updates[1]?.title, "Build My Life");
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.shifts, []);
});

test("a renamed song line stays put while that song is still in the slot", () => {
  const plan = planServiceFlowSongPlacement(
    [
      row({
        id: "opener",
        item_type: "song",
        title: "Opener",
        sequence_order: 1,
        song_id: "song-a",
        song_key: "A",
      }),
    ],
    [{ id: "song-a", title: "Build My Life", key: "A" }],
  );

  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.inserts, []);
});

test("songs that do not fit a slot are appended after the last song", () => {
  const plan = planServiceFlowSongPlacement(
    [
      row({ id: "song", item_type: "song", title: "Build My Life", sequence_order: 1, song_id: "song-a" }),
      row({ id: "message", item_type: "item", title: "Message", sequence_order: 2 }),
    ],
    [
      { id: "song-a", title: "Build My Life" },
      { id: "song-b", title: "Goodness of God", key: "G" },
    ],
  );

  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.shifts, [{ id: "message", sequence_order: 3 }]);
  assert.deepEqual(plan.inserts, [
    { title: "Goodness of God", song_id: "song-b", song_key: "G", sequence_order: 2 },
  ]);
});
