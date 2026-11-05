import assert from "node:assert/strict";
import test from "node:test";
import {
  adminPushCampusLimit,
  adminReceivesCampusPush,
  campusLookupFromPushTag,
  campusNameFromPushMetadata,
  readPushCampusIds,
} from "./adminPushCampusScope.ts";

const shelbyville = "campus-shelbyville";
const murfreesboro = "campus-murfreesboro";

test("a campus admin only matches the campuses they administer", () => {
  const roles = [{ role: "campus_admin", admin_campus_id: shelbyville }];
  assert.deepEqual(adminPushCampusLimit(roles, [murfreesboro]), [shelbyville]);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [shelbyville]), true);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), false);
});

test("an org admin is not campus-limited because the profile menu decides", () => {
  const roles = [
    { role: "admin", admin_campus_id: null },
    { role: "campus_admin", admin_campus_id: shelbyville },
  ];
  assert.equal(adminPushCampusLimit(roles, [murfreesboro]), null);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), true);
  assert.equal(adminReceivesCampusPush(roles, [shelbyville], [shelbyville]), true);
});

test("an org admin with no campus admin assignment is still not campus-limited", () => {
  const roles = [{ role: "admin", admin_campus_id: null }];
  assert.equal(adminPushCampusLimit(roles, [murfreesboro]), null);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), true);
});

test("a network pastor who is not an admin still follows campus assignment", () => {
  const roles = [{ role: "network_worship_pastor", admin_campus_id: null }];
  assert.equal(adminReceivesCampusPush(roles, [shelbyville], [shelbyville]), true);
  assert.equal(adminReceivesCampusPush(roles, [shelbyville], [murfreesboro]), false);
  assert.equal(adminPushCampusLimit(roles, []), null);
});

test("someone who is not an admin is not campus-limited", () => {
  const roles = [{ role: "volunteer", admin_campus_id: null }];
  assert.equal(adminReceivesCampusPush(roles, [shelbyville], [murfreesboro]), true);
});

test("campus ids are read from metadata", () => {
  assert.deepEqual(
    readPushCampusIds({ campusId: shelbyville, campusIds: [murfreesboro, shelbyville] }),
    [shelbyville, murfreesboro],
  );
});

test("older pushes can be matched to a campus by name or tag", () => {
  assert.equal(
    campusNameFromPushMetadata({ vars: { campus: "Murfreesboro Central" } }),
    "Murfreesboro Central",
  );
  assert.equal(campusNameFromPushMetadata({ vars: { campus: "your campus" } }), null);
  assert.deepEqual(
    campusLookupFromPushTag("break-request-40728afa-7dc4-4664-8ad0-7d5f1640ec8a"),
    { source: "break_request", id: "40728afa-7dc4-4664-8ad0-7d5f1640ec8a" },
  );
  assert.deepEqual(
    campusLookupFromPushTag("setlist-confirm-cfa98201-8477-4a39-8231-18bf4c607287-c3314bf9-5b89-47e7-945d-42547f5ea8be"),
    { source: "draft_set", id: "cfa98201-8477-4a39-8231-18bf4c607287" },
  );
  assert.equal(campusLookupFromPushTag("chat-message-cfa98201-8477-4a39-8231-18bf4c607287"), null);
});
