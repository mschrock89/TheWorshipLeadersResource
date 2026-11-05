import assert from "node:assert/strict";
import test from "node:test";
import { campusOffersMinistry, campusSetupError, buildCampusMinistryDrafts } from "./campusSetup.ts";

test("a campus with no ministry list still offers every ministry", () => {
  assert.equal(campusOffersMinistry(null, "encounter"), true);
  assert.equal(campusOffersMinistry(undefined, "weekend_team"), true);
});

test("weekend worship and its aliases follow the weekend ministry", () => {
  const enabled = new Set(["weekend", "encounter"]);
  assert.equal(campusOffersMinistry(enabled, "weekend"), true);
  assert.equal(campusOffersMinistry(enabled, "weekend_team"), true);
  assert.equal(campusOffersMinistry(enabled, "production"), false);
  assert.equal(campusOffersMinistry(enabled, "encounter"), true);
});

test("network-wide ministries and feed scopes are not gated by a campus", () => {
  const enabled = new Set(["weekend"]);
  assert.equal(campusOffersMinistry(enabled, "student_camp"), true);
  assert.equal(campusOffersMinistry(enabled, "student_camp_evening"), true);
  assert.equal(campusOffersMinistry(enabled, "campus_wide"), true);
  assert.equal(campusOffersMinistry(enabled, "network_wide"), true);
  assert.equal(campusOffersMinistry(enabled, "life_groups"), true);
});

test("a new campus starts with weekend services on Sunday", () => {
  const drafts = buildCampusMinistryDrafts({
    campus: null,
    schedules: [],
    enabledMinistries: null,
    isNew: true,
  });
  const weekend = drafts.find((draft) => draft.ministryType === "weekend");
  const production = drafts.find((draft) => draft.ministryType === "production");
  assert.equal(weekend?.enabled, true);
  assert.equal(weekend?.days.find((day) => day.day === 0)?.enabled, true);
  assert.equal(production?.enabled, false);
  assert.equal(production?.followWeekend, true);
  assert.equal(drafts.some((draft) => draft.ministryType === "student_camp"), false);
});

test("campus setup requires a unique name, a ministry, and service days", () => {
  const drafts = buildCampusMinistryDrafts({
    campus: null,
    schedules: [],
    enabledMinistries: null,
    isNew: true,
  });
  const names = [{ id: "central", name: "Murfreesboro Central" }];
  assert.equal(
    campusSetupError({
      name: "  murfreesboro central ",
      ministries: drafts,
      attendanceEnabled: false,
      latitude: "",
      longitude: "",
      radius: "150",
      existingNames: names,
      campusId: null,
    }),
    "A campus with that name already exists.",
  );
  const withoutDays = drafts.map((draft) =>
    draft.ministryType === "weekend"
      ? { ...draft, days: draft.days.map((day) => ({ ...day, enabled: false })) }
      : draft,
  );
  assert.match(
    campusSetupError({
      name: "Spring Hill",
      ministries: withoutDays,
      attendanceEnabled: false,
      latitude: "",
      longitude: "",
      radius: "150",
      existingNames: names,
      campusId: null,
    }) || "",
    /Weekend Services/,
  );
});
