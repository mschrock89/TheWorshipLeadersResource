import assert from "node:assert/strict";
import test from "node:test";
import { getServiceFlowMinistryType } from "./customServiceMinistry.ts";

test("a weekend prayer-and-worship night uses the Worship Night service flow", () => {
  assert.equal(
    getServiceFlowMinistryType("weekend", "A Night of Prayer and Worship"),
    "worship_night",
  );
});

test("a weekend service named Prayer Night uses the Prayer Night service flow", () => {
  assert.equal(getServiceFlowMinistryType("weekend", "Prayer Night"), "prayer_night");
});

test("an ordinary weekend service keeps the weekend service flow", () => {
  assert.equal(getServiceFlowMinistryType("weekend", "Saturday Night"), "weekend");
});
