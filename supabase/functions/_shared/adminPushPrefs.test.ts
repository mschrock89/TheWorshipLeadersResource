import assert from "node:assert/strict";
import test from "node:test";
import { adminPushChannelForType, allowsAdminPush } from "./adminPushPrefs.ts";

const murfreesboro = "campus-murfreesboro";
const shelbyville = "campus-shelbyville";

test("setlist confirmations, leader swaps, and approval map to selectable channels", () => {
  assert.equal(adminPushChannelForType("setlist-confirmed"), "setlist-confirmations");
  assert.equal(adminPushChannelForType("swap-confirmed"), "swaps");
  assert.equal(adminPushChannelForType("swap-unanswered-gap"), "swaps");
  assert.equal(adminPushChannelForType("pending-approval"), "setlist-approval");
  assert.equal(adminPushChannelForType("feed-post"), "feed-posts");
  assert.equal(adminPushChannelForType("schedule-reminder"), null);
  assert.equal(adminPushChannelForType("swap-request"), null);
});

test("an admin with no saved choices still receives leadership pushes", () => {
  assert.equal(
    allowsAdminPush({
      explicitOnly: false,
      prefs: [],
      channel: "setlist-confirmations",
      campusIds: [murfreesboro],
    }),
    true,
  );
});

test("unchecking one campus blocks only that campus", () => {
  const prefs = [{ campusId: murfreesboro, channel: "swaps", enabled: false }];
  assert.equal(
    allowsAdminPush({ explicitOnly: false, prefs, channel: "swaps", campusIds: [murfreesboro] }),
    false,
  );
  assert.equal(
    allowsAdminPush({ explicitOnly: false, prefs, channel: "swaps", campusIds: [shelbyville] }),
    true,
  );
  assert.equal(
    allowsAdminPush({ explicitOnly: false, prefs, channel: "feed-posts", campusIds: [murfreesboro] }),
    true,
  );
});

test("an explicit admin only receives the channels checked for that campus", () => {
  const prefs = [
    { campusId: murfreesboro, channel: "setlist-approval", enabled: true },
    { campusId: murfreesboro, channel: "feed-posts", enabled: true },
    { campusId: shelbyville, channel: "setlist-approval", enabled: true },
    { campusId: shelbyville, channel: "feed-posts", enabled: true },
  ];

  assert.equal(
    allowsAdminPush({
      explicitOnly: true,
      prefs,
      channel: "setlist-approval",
      campusIds: [murfreesboro],
    }),
    true,
  );
  assert.equal(
    allowsAdminPush({
      explicitOnly: true,
      prefs,
      channel: "setlist-confirmations",
      campusIds: [murfreesboro],
    }),
    false,
  );
  assert.equal(
    allowsAdminPush({ explicitOnly: true, prefs, channel: "swaps", campusIds: [shelbyville] }),
    false,
  );
  assert.equal(
    allowsAdminPush({ explicitOnly: true, prefs, channel: "feed-posts", campusIds: [] }),
    true,
  );
  assert.equal(
    allowsAdminPush({ explicitOnly: true, prefs, channel: "break-requests", campusIds: [] }),
    false,
  );
});
