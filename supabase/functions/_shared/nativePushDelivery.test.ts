import assert from "node:assert/strict";
import test from "node:test";
import { omitAppleWebPushWhenNativeExists } from "./nativePushDelivery.ts";

test("a native iOS subscription replaces the Apple web push for that person", () => {
  const kept = omitAppleWebPushWhenNativeExists([
    { user_id: "mitch", platform: "ios", endpoint: "apns:abc" },
    { user_id: "mitch", platform: "web", endpoint: "https://web.push.apple.com/token" },
    { user_id: "emma", platform: "web", endpoint: "https://web.push.apple.com/emma" },
    { user_id: "mitch", platform: "web", endpoint: "https://fcm.googleapis.com/fcm/send/desktop" },
  ]);

  assert.deepEqual(kept.map((row) => row.endpoint), [
    "apns:abc",
    "https://web.push.apple.com/emma",
    "https://fcm.googleapis.com/fcm/send/desktop",
  ]);
});
