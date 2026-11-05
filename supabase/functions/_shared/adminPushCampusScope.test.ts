import assert from "node:assert/strict";
import test from "node:test";
import {
  adminPushCampusLimit,
  adminReceivesCampusPush,
  readPushCampusIds,
} from "./adminPushCampusScope.ts";

const shelbyville = "campus-shelbyville";
const murfreesboro = "campus-murfreesboro";

test("a campus admin only matches the campuses they administer", () => {
  const roles = [{ role: "campus_admin", admin_campus_id: shelbyville }, { role: "admin", admin_campus_id: null }];
  assert.deepEqual(adminPushCampusLimit(roles, [murfreesboro]), [shelbyville]);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [shelbyville]), true);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), false);
});

test("an org admin only hears about campuses they are a campus admin for", () => {
  const roles = [
    { role: "admin", admin_campus_id: null },
    { role: "campus_admin", admin_campus_id: shelbyville },
  ];
  assert.deepEqual(adminPushCampusLimit(roles, [murfreesboro]), [shelbyville]);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [shelbyville]), true);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), false);
});

test("an org admin with no campus admin assignment gets no campus admin pushes", () => {
  const roles = [{ role: "admin", admin_campus_id: null }];
  assert.deepEqual(adminPushCampusLimit(roles, [murfreesboro]), []);
  assert.equal(adminReceivesCampusPush(roles, [murfreesboro], [murfreesboro]), false);
  assert.equal(adminReceivesCampusPush(roles, [], [murfreesboro]), false);
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
