import assert from "node:assert/strict";
import test from "node:test";
import { isSongGloballyNew, isSongInNewRotation } from "./songRotation.ts";

const usageWindowStart = "2024-10-01";

test("a long-running song with only a few recent plays is not new", () => {
  const inChristAlone = {
    usage_count: 51,
    upcoming_uses: 0,
    first_used: "2014-03-02",
    last_used: "2025-12-10",
    usages: [{ plan_date: "2025-11-22" }, { plan_date: "2025-09-13" }],
  };

  assert.equal(isSongGloballyNew(inChristAlone), false);
  assert.equal(
    isSongInNewRotation({
      totalUses: 2,
      isInRegularRotation: false,
      firstUsed: inChristAlone.first_used,
      usageWindowStart,
    }),
    false,
  );
});

test("a song with no service history is globally new", () => {
  assert.equal(
    isSongGloballyNew({
      usage_count: 0,
      upcoming_uses: 0,
      first_used: null,
      last_used: null,
      usages: [],
    }),
    true,
  );
});

test("older history still counts when the recent usage rows are empty", () => {
  assert.equal(
    isSongGloballyNew({
      usage_count: 5,
      upcoming_uses: 0,
      first_used: "2021-06-20",
      last_used: "2024-05-12",
      usages: [],
    }),
    false,
  );
});

test("a song introduced inside the usage window with fewer than 4 plays is new", () => {
  assert.equal(
    isSongInNewRotation({
      totalUses: 2,
      isInRegularRotation: false,
      firstUsed: "2026-06-14",
      usageWindowStart,
    }),
    true,
  );
});

test("four or more plays, or regular rotation, leaves the new-song phase", () => {
  assert.equal(
    isSongInNewRotation({
      totalUses: 4,
      isInRegularRotation: true,
      firstUsed: "2026-01-04",
      usageWindowStart,
    }),
    false,
  );
});
