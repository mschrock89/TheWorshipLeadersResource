#!/usr/bin/env node
/**
 * Creates, verifies, or removes an isolated role/position QA matrix.
 *
 * Usage:
 *   node scripts/test-profile-matrix.mjs create
 *   node scripts/test-profile-matrix.mjs verify
 *   node scripts/test-profile-matrix.mjs cleanup
 *
 * The generated password is written to a mode-0600 manifest in /tmp. Test users
 * are tagged in auth app_metadata, use example.invalid addresses, and cleanup
 * only deletes users carrying that exact tag.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = "/tmp/wlr-test-profile-manifest.json";
const TEST_TAG = "wlr-role-position-matrix-v1";
const EMAIL_PREFIX = "wlr.qa.matrix.";

const ROLES = [
  "leader",
  "member",
  "campus_pastor",
  "admin",
  "campus_worship_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
  "speaker",
  "volunteer",
  "campus_admin",
  "network_worship_leader",
  "network_worship_pastor",
  "network_student_pastor",
  "video_director",
  "production_manager",
  "creative_team_lead",
  "audition_candidate",
  "student",
  "ms_leader",
  "ms_leader_weekend",
  "hs_leader",
];

const POSITIONS = [
  "lead_vocals", "harmony_vocals", "background_vocals", "teacher", "announcement",
  "closing_prayer", "acoustic_guitar", "electric_guitar", "bass", "drums", "keys",
  "piano", "violin", "cello", "saxophone", "trumpet", "other_instrument", "sound_tech",
  "lighting", "media", "other", "broadcast", "electric_1", "electric_2", "camera_1",
  "camera_2", "camera_3", "camera_4", "director", "graphics", "producer", "switcher",
  "audio_shadow", "mon", "acoustic_1", "acoustic_2", "camera_5", "camera_6",
  "tri_pod_camera", "hand_held_camera", "vocalist", "student_cafe", "student_hype",
  "student_prayer", "student_hospitality", "student_small_group_leader", "photo_team",
  "art_team", "pastor_mc", "pastor_prayer", "pastor_speaker",
];

function loadEnv() {
  const values = {};
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
      if (match) values[match[1]] = match[2].trim();
    }
  }
  return { ...values, ...process.env };
}

function ministryForPosition(position) {
  if (["sound_tech", "lighting", "media", "broadcast", "producer", "audio_shadow", "mon"].includes(position)) return "production";
  if (position.startsWith("camera_") || ["director", "graphics", "switcher", "tri_pod_camera", "hand_held_camera"].includes(position)) return "video";
  if (["photo_team", "art_team"].includes(position)) return "creative";
  if (position.startsWith("student_")) return "students";
  if (["teacher", "announcement", "closing_prayer", "pastor_mc", "pastor_prayer", "pastor_speaker"].includes(position)) return "speaker";
  return "weekend_team";
}

function throwOnError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

async function listAllUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = throwOnError(result, "list auth users")?.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

async function buildClient() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SOURCE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createMatrix(client) {
  const campuses = throwOnError(
    await client.from("campuses").select("id,name").order("name"),
    "load campuses",
  );
  if (!campuses?.length) throw new Error("At least one campus is required.");

  const password = `${randomBytes(18).toString("base64url")}!Qa7`;
  const existingUsers = await listAllUsers(client);
  const manifest = { tag: TEST_TAG, createdAt: new Date().toISOString(), password, accounts: [] };

  for (let index = 0; index < ROLES.length; index += 1) {
    const role = ROLES[index];
    const email = `${EMAIL_PREFIX}${role.replaceAll("_", "-")}@example.invalid`;
    const campus = campuses[index % campuses.length];
    const assignedPositions = POSITIONS.filter((_, positionIndex) => positionIndex % ROLES.length === index);
    const existing = existingUsers.find((user) => user.email === email);
    let user;

    if (existing) {
      if (existing.app_metadata?.qa_profile_tag !== TEST_TAG) {
        throw new Error(`Refusing to reuse untagged account ${email}.`);
      }
      user = throwOnError(
        await client.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          app_metadata: { ...existing.app_metadata, qa_profile_tag: TEST_TAG, qa_role: role },
          user_metadata: { ...existing.user_metadata, full_name: `[QA] ${role}`, qa_profile: true },
        }),
        `update ${email}`,
      )?.user;
    } else {
      user = throwOnError(
        await client.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { qa_profile_tag: TEST_TAG, qa_role: role },
          user_metadata: { full_name: `[QA] ${role}`, qa_profile: true },
        }),
        `create ${email}`,
      )?.user;
    }

    if (!user) throw new Error(`No auth user returned for ${email}.`);

    throwOnError(await client.from("profiles").upsert({
      id: user.id,
      email,
      full_name: `[QA] ${role}`,
      default_campus_id: campus.id,
      ministry_types: [...new Set(assignedPositions.map(ministryForPosition))],
      positions: assignedPositions,
      has_completed_onboarding: true,
      must_change_password: false,
      share_contact_with_campus: false,
      share_contact_with_pastors: false,
    }), `upsert profile ${email}`);

    throwOnError(await client.from("user_roles").delete().eq("user_id", user.id), `clear roles ${email}`);
    throwOnError(await client.from("user_roles").insert({
      user_id: user.id,
      role,
      admin_campus_id: role === "campus_admin" ? campus.id : null,
    }), `assign role ${email}`);

    throwOnError(await client.from("user_campuses").delete().eq("user_id", user.id), `clear campuses ${email}`);
    const campusRows = ["admin", "network_worship_leader", "network_worship_pastor", "network_student_pastor"].includes(role)
      ? campuses.map((entry) => ({ user_id: user.id, campus_id: entry.id }))
      : [{ user_id: user.id, campus_id: campus.id }];
    throwOnError(await client.from("user_campuses").insert(campusRows), `assign campuses ${email}`);

    throwOnError(await client.from("user_ministry_campuses").delete().eq("user_id", user.id), `clear ministries ${email}`);
    throwOnError(await client.from("user_campus_ministry_positions").delete().eq("user_id", user.id), `clear positions ${email}`);
    const ministryTypes = [...new Set(assignedPositions.map(ministryForPosition))];
    if (ministryTypes.length) {
      throwOnError(await client.from("user_ministry_campuses").insert(
        ministryTypes.map((ministryType) => ({ user_id: user.id, campus_id: campus.id, ministry_type: ministryType })),
      ), `assign ministries ${email}`);
    }
    if (assignedPositions.length) {
      throwOnError(await client.from("user_campus_ministry_positions").insert(
        assignedPositions.map((position) => ({
          user_id: user.id,
          campus_id: campus.id,
          ministry_type: ministryForPosition(position),
          position,
        })),
      ), `assign positions ${email}`);
    }

    manifest.accounts.push({ id: user.id, email, role, campus: campus.name, positions: assignedPositions });
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Created ${manifest.accounts.length} tagged QA profiles covering ${POSITIONS.length} positions.`);
  console.log(`Credentials manifest: ${MANIFEST_PATH}`);
}

async function verifyMatrix(client) {
  const users = (await listAllUsers(client)).filter((user) => user.app_metadata?.qa_profile_tag === TEST_TAG);
  const ids = users.map((user) => user.id);
  const roles = ids.length ? throwOnError(await client.from("user_roles").select("user_id,role").in("user_id", ids), "verify roles") : [];
  const positions = ids.length ? throwOnError(await client.from("user_campus_ministry_positions").select("user_id,position").in("user_id", ids), "verify positions") : [];
  const coveredRoles = new Set(roles.map((row) => row.role));
  const coveredPositions = new Set(positions.map((row) => row.position));
  const missingRoles = ROLES.filter((role) => !coveredRoles.has(role));
  const missingPositions = POSITIONS.filter((position) => !coveredPositions.has(position));
  const authErrors = [];
  let authenticatedProfiles = 0;

  if (existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    const env = loadEnv();
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    for (const account of manifest.accounts || []) {
      const userClient = createClient(env.VITE_SUPABASE_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signIn = await userClient.auth.signInWithPassword({ email: account.email, password: manifest.password });
      if (signIn.error || !signIn.data.user) {
        authErrors.push(`${account.role}: sign-in failed`);
        continue;
      }
      const [ownProfile, ownRoles, ownCampuses, ownPositions] = await Promise.all([
        userClient.from("profiles").select("id").eq("id", account.id).maybeSingle(),
        userClient.from("user_roles").select("role").eq("user_id", account.id),
        userClient.from("user_campuses").select("campus_id").eq("user_id", account.id),
        userClient.from("user_campus_ministry_positions").select("position").eq("user_id", account.id),
      ]);
      const failure = [ownProfile, ownRoles, ownCampuses, ownPositions].find((result) => result.error);
      if (failure) {
        authErrors.push(`${account.role}: ${failure.error.message}`);
      } else if (!ownProfile.data || !ownRoles.data?.some((row) => row.role === account.role)) {
        authErrors.push(`${account.role}: own profile or assigned role was not visible`);
      } else if (!ownCampuses.data?.length || ownPositions.data?.length !== account.positions.length) {
        authErrors.push(`${account.role}: campus/position coverage did not match`);
      } else {
        authenticatedProfiles += 1;
      }
      await userClient.auth.signOut();
    }
  } else {
    authErrors.push(`credentials manifest missing at ${MANIFEST_PATH}`);
  }

  const valid = users.length === ROLES.length &&
    missingRoles.length === 0 &&
    missingPositions.length === 0 &&
    authenticatedProfiles === ROLES.length &&
    authErrors.length === 0;
  console.log(JSON.stringify({
    profiles: users.length,
    rolesCovered: coveredRoles.size,
    positionsCovered: coveredPositions.size,
    authenticatedProfiles,
    missingRoles,
    missingPositions,
    authErrors,
    valid,
  }, null, 2));
  if (!valid) process.exitCode = 1;
}

async function cleanupMatrix(client) {
  const users = (await listAllUsers(client)).filter((user) => user.app_metadata?.qa_profile_tag === TEST_TAG);
  for (const user of users) {
    throwOnError(await client.auth.admin.deleteUser(user.id), `delete ${user.email}`);
  }
  console.log(`Deleted ${users.length} tagged QA profiles.`);
}

const mode = process.argv[2] || "verify";
if (!["create", "verify", "cleanup"].includes(mode)) {
  throw new Error("Mode must be create, verify, or cleanup.");
}
const client = await buildClient();
if (mode === "create") await createMatrix(client);
if (mode === "verify") await verifyMatrix(client);
if (mode === "cleanup") await cleanupMatrix(client);
