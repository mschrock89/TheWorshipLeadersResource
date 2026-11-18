import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarLinkedMinistries,
  customServiceMinistriesForFilter,
  isSeparateProductionMinistry,
  worshipSetlistMinistry,
} from "./linkedProduction.ts";

test("Weekend Worship calendar includes its own production, video, and speakers", () => {
  assert.deepEqual(calendarLinkedMinistries("weekend_team"), [
    "weekend",
    "weekend_team",
    "sunday_am",
    "production",
    "video",
    "speaker",
  ]);
  assert.deepEqual(customServiceMinistriesForFilter("weekend_team"), [
    "weekend",
    "production",
    "video",
  ]);
});

test("MS/HS Worship calendar includes MS/HS Production and not weekend production", () => {
  assert.deepEqual(calendarLinkedMinistries("ms_hs"), ["ms_hs", "ms_hs_production"]);
  assert.deepEqual(calendarLinkedMinistries("ms_hs_production"), ["ms_hs", "ms_hs_production"]);
  assert.equal(calendarLinkedMinistries("ms_hs")?.includes("production"), false);
  assert.equal(worshipSetlistMinistry("ms_hs_production"), "ms_hs");
  assert.equal(worshipSetlistMinistry("ms_hs"), "ms_hs");
});

test("HS Production stays on HS Worship and uses the HS setlist", () => {
  assert.deepEqual(calendarLinkedMinistries("encounter"), ["encounter", "hs_production"]);
  assert.deepEqual(calendarLinkedMinistries("hs_production"), ["encounter", "hs_production"]);
  assert.equal(worshipSetlistMinistry("hs_production"), "encounter");
  assert.equal(isSeparateProductionMinistry("hs_production"), true);
  assert.equal(isSeparateProductionMinistry("ms_hs"), false);
});

test("Weekend production still reads the weekend setlist", () => {
  assert.equal(worshipSetlistMinistry("production"), "weekend");
  assert.equal(worshipSetlistMinistry("video"), "weekend");
  assert.equal(calendarLinkedMinistries("kids_camp"), null);
});
