import assert from "node:assert/strict";
import test from "node:test";
import { bottomScreenInset, isAndroidTablet } from "./screenSafeArea.ts";

const galaxyTab =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

test("treats a Galaxy Tab user agent as an Android tablet", () => {
  assert.equal(isAndroidTablet(galaxyTab), true);
  assert.equal(isAndroidTablet("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile"), false);
  assert.equal(isAndroidTablet("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), false);
});

test("keeps a reported safe area and fills in a missing one on Android tablets", () => {
  assert.equal(bottomScreenInset(0, galaxyTab), 56);
  assert.equal(bottomScreenInset(80, galaxyTab), 80);
  assert.equal(bottomScreenInset(0, "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile"), 0);
  assert.equal(bottomScreenInset(34, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), 34);
});
