import assert from "node:assert/strict";
import test from "node:test";
import {
  getViewMinistryFilterOptions,
  getViewMinistryLabel,
  normalizeViewMinistrySelection,
  pairedProductionMinistry,
  productionLivesOnWorshipTeam,
} from "./constants.ts";

test("view ministry menu folds production crews into the worship they serve", () => {
  const labels = getViewMinistryFilterOptions(null).map((ministry) => ministry.label);
  assert.deepEqual(labels.slice(0, 6), [
    "Weekend Worship",
    "MS Worship",
    "MS Worship Weekend",
    "HS Worship",
    "MS/HS Worship/Production",
    "Evident/Production",
  ]);
  assert.equal(labels.includes("Production"), false);
  assert.equal(labels.includes("HS Production"), false);
  assert.equal(labels.includes("MS/HS Production"), false);
  assert.equal(labels.includes("HS Worship"), true);
  assert.equal(labels.includes("MS Worship"), true);
  assert.equal(labels.includes("MS/HS Worship/Production"), true);
  assert.equal(labels.includes("Evident/Production"), true);
  assert.equal(labels.at(-2), "Worship Night");
  assert.equal(labels.at(-1), "Kids Camp");
});

test("stored production selections open the matching worship view", () => {
  assert.equal(normalizeViewMinistrySelection("production"), "weekend_team");
  assert.equal(normalizeViewMinistrySelection("hs_production"), "encounter");
  assert.equal(normalizeViewMinistrySelection("ms_hs_production"), "ms_hs");
  assert.equal(normalizeViewMinistrySelection("eon"), "eon");
  assert.equal(pairedProductionMinistry("encounter"), "hs_production");
  assert.equal(pairedProductionMinistry("ms_hs"), "ms_hs_production");
  assert.equal(pairedProductionMinistry("weekend_team"), "production");
  assert.equal(pairedProductionMinistry("eon"), null);
  assert.equal(productionLivesOnWorshipTeam("eon"), true);
  assert.equal(productionLivesOnWorshipTeam("evident"), true);
  assert.equal(productionLivesOnWorshipTeam("encounter"), false);
  assert.equal(getViewMinistryLabel("ms_hs"), "MS/HS Worship/Production");
  assert.equal(getViewMinistryLabel("evident"), "Evident/Production");
  assert.equal(getViewMinistryLabel("hs_production"), "HS Worship");
});
