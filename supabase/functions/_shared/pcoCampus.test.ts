import assert from "node:assert/strict";
import test from "node:test";
import { campusIdFromServiceTypeName } from "./pcoCampus.ts";

const campuses = [
  { id: "central", name: "Murfreesboro Central" },
  { id: "cannon", name: "Cannon County" },
  { id: "shelbyville", name: "Shelbyville" },
  { id: "north", name: "Murfreesboro North" },
  { id: "tullahoma", name: "Tullahoma" },
];

test("weekend service types land on the campus named in the title", () => {
  assert.equal(
    campusIdFromServiceTypeName("Murfreesboro Central", campuses, "fallback"),
    "central",
  );
  assert.equal(
    campusIdFromServiceTypeName("Cannon County Worship", campuses, "fallback"),
    "cannon",
  );
  assert.equal(
    campusIdFromServiceTypeName("Shelbyville Worship", campuses, "fallback"),
    "shelbyville",
  );
  assert.equal(
    campusIdFromServiceTypeName("Cannon County Kids Camp", campuses, "fallback"),
    "cannon",
  );
});

test("student abbreviations resolve like the full campus name", () => {
  assert.equal(campusIdFromServiceTypeName("Encounter (CC)", campuses, "fallback"), "cannon");
  assert.equal(campusIdFromServiceTypeName("HS Worship CC", campuses, "fallback"), "cannon");
  assert.equal(campusIdFromServiceTypeName("EON Shelbyville", campuses, "fallback"), "shelbyville");
  assert.equal(campusIdFromServiceTypeName("MS Worship (Shelbyville)", campuses, "fallback"), "shelbyville");
  assert.equal(campusIdFromServiceTypeName("Encounter (Boro)", campuses, "fallback"), "central");
  assert.equal(campusIdFromServiceTypeName("EON Boro", campuses, "fallback"), "central");
});

test("network nights stay unscoped and unknown types use the connection campus", () => {
  assert.equal(campusIdFromServiceTypeName("Prayer Night", campuses, "fallback"), null);
  assert.equal(campusIdFromServiceTypeName("Worship Night", campuses, "fallback"), null);
  assert.equal(campusIdFromServiceTypeName("Weekend Worship", campuses, "fallback"), "fallback");
});
