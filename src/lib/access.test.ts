import assert from "node:assert/strict";
import test from "node:test";
import { getRosterVisibilityScope } from "./access.ts";

test("production volunteers see the whole team roster", () => {
  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["weekend"],
      teamAssignments: [{ ministryTypes: ["weekend"], position: "sound_tech", positionSlot: "foh" }],
    }),
    "all",
  );

  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["production"],
      teamAssignments: [],
    }),
    "all",
  );

  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["weekend"],
      teamAssignments: [{ ministryTypes: ["production"], position: null, positionSlot: null }],
    }),
    "all",
  );

  for (const position of ["lighting", "mon", "media", "broadcast", "producer", "propresenter"]) {
    assert.equal(
      getRosterVisibilityScope({
        canManageTeam: false,
        ministryTypes: ["weekend"],
        teamAssignments: [{ ministryTypes: ["weekend"], position, positionSlot: position }],
      }),
      "all",
      position,
    );
  }
});

test("video volunteers still only see the support roster", () => {
  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["weekend"],
      teamAssignments: [{ ministryTypes: ["video"], position: "director", positionSlot: "director" }],
    }),
    "support",
  );

  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["video"],
      teamAssignments: [],
    }),
    "support",
  );
});

test("weekend worship volunteers still only see the worship roster", () => {
  assert.equal(
    getRosterVisibilityScope({
      canManageTeam: false,
      ministryTypes: ["production"],
      teamAssignments: [{ ministryTypes: ["weekend"], position: "drums", positionSlot: "drums" }],
    }),
    "worship",
  );
});
