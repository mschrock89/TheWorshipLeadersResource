import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync("/Users/mitchellschrock/Desktop/worshipleadersresource-main/.env", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const weekendTypes = new Set(["weekend", "weekend_team", "sunday_am"]);

const { data: campus, error: campusError } = await supabase
  .from("campuses")
  .select("id, name")
  .eq("name", "Murfreesboro Central")
  .single();

if (campusError) throw campusError;

const { data: periods, error: periodsError } = await supabase
  .from("rotation_periods")
  .select("id, name, year, trimester, campus_id")
  .eq("campus_id", campus.id)
  .order("year", { ascending: true })
  .order("trimester", { ascending: true });

if (periodsError) throw periodsError;

const current = periods.find((period) => period.name === "T2 2026");
if (!current) throw new Error("Could not find T2 2026");

const previous = periods
  .filter(
    (period) =>
      period.year < current.year ||
      (period.year === current.year && period.trimester < current.trimester),
  )
  .at(-1);

if (!previous) throw new Error("Could not find previous period");

const { data: positionAssignments, error: positionAssignmentsError } = await supabase
  .from("user_campus_ministry_positions")
  .select("user_id, ministry_type, position")
  .eq("campus_id", campus.id);

if (positionAssignmentsError) throw positionAssignmentsError;

const eligibleUserIds = [
  ...new Set(
    (positionAssignments ?? [])
      .filter((assignment) => weekendTypes.has(assignment.ministry_type || "weekend"))
      .map((assignment) => assignment.user_id),
  ),
];

const { data: profiles, error: profilesError } = await supabase
  .from("profiles")
  .select("id, full_name")
  .in("id", eligibleUserIds);

if (profilesError) throw profilesError;

const { data: currentBreaks, error: currentBreaksError } = await supabase
  .from("break_requests")
  .select("user_id, ministry_type, status")
  .eq("rotation_period_id", current.id)
  .eq("status", "approved");

if (currentBreaksError) throw currentBreaksError;

const approvedCurrentBreakUserIds = new Set(
  (currentBreaks ?? [])
    .filter((request) => !request.ministry_type || weekendTypes.has(request.ministry_type))
    .map((request) => request.user_id),
);

const availableUsers = (profiles ?? []).filter((profile) => !approvedCurrentBreakUserIds.has(profile.id));

const { data: previousMembers, error: previousMembersError } = await supabase
  .from("team_members")
  .select("user_id, ministry_types")
  .eq("rotation_period_id", previous.id);

if (previousMembersError) throw previousMembersError;

const previousRosterUserIds = new Set(
  (previousMembers ?? [])
    .filter((member) => {
      const ministryTypes = member.ministry_types?.length ? member.ministry_types : ["weekend"];
      return ministryTypes.some((type) => weekendTypes.has(type));
    })
    .map((member) => member.user_id)
    .filter(Boolean),
);

const mustServe = availableUsers
  .filter((profile) => !previousRosterUserIds.has(profile.id))
  .sort((a, b) => a.full_name.localeCompare(b.full_name));

console.log(
  JSON.stringify(
    {
      campus,
      current,
      previous,
      eligibleCount: eligibleUserIds.length,
      availableCount: availableUsers.length,
      mustServeCount: mustServe.length,
      mustServe,
    },
    null,
    2,
  ),
);
