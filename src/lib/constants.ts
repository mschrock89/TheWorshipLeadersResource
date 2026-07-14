export const ROLE_LABELS: Record<string, string> = {
  leader: "Legacy Leader",
  member: "Legacy Member",
  admin: "Organization Admin",
  campus_admin: "Campus Admin",
  campus_pastor: "Campus Pastor",
  network_worship_leader: "Network Worship Leader",
  network_worship_pastor: "Network Worship Pastor",
  campus_worship_pastor: "Campus Worship Pastor",
  network_student_pastor: "Network Student Pastor",
  student_pastor: "Student Pastor",
  student_worship_pastor: "Student Worship Leader",
  childrens_pastor: "Children's Pastor",
  speaker: "Speaker",
  video_director: "Video Director",
  production_manager: "Production Manager",
  creative_team_lead: "Creative Team Lead",
  audition_candidate: "Audition Candidate",
  student: "Student",
  ms_leader: "MS Leader",
  ms_leader_weekend: "MS Leader Weekend",
  hs_leader: "HS Leader",
  volunteer: "Volunteer",
};

export * from "./resourceApps";
export const STUDENT_TEAM_BUILDER_MINISTRY_TYPE = "students";
export const STUDENT_TEAM_NAMES = ["Hospitality", "Hype", "Prayer", "Cafe"] as const;
export const STUDENT_POSITION_VALUES = [
  "student_cafe",
  "student_hype",
  "student_prayer",
  "student_hospitality",
  "student_small_group_leader",
] as const;

// Roles that can be combined (leadership roles)
export const LEADERSHIP_ROLES = ['admin', 'campus_admin'] as const;

// Base roles (mutually exclusive - user gets one of these)
export const BASE_ROLES = ['network_worship_pastor', 'network_worship_leader', 'campus_pastor', 'campus_worship_pastor', 'network_student_pastor', 'student_pastor', 'student_worship_pastor', 'childrens_pastor', 'speaker', 'video_director', 'production_manager', 'creative_team_lead', 'audition_candidate', 'student', 'ms_leader', 'ms_leader_weekend', 'hs_leader', 'volunteer'] as const;

export const POSITION_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  teacher: "Teacher",
  announcement: "Announcements",
  closing_prayer: "Closing Prayer",
  closer: "Closing Prayer",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  electric_3: "EG 3",
  electric_4: "EG 4",
  bass: "Bass",
  drums: "Drums",
  drum_tech: "Drum Tech",
  keys: "Keys",
  pad: "Pad",
  piano: "Piano",
  violin: "Violin",
  cello: "Cello",
  saxophone: "Saxophone",
  trumpet: "Trumpet",
  other_instrument: "Other Instrument",
  sound_tech: "FOH",
  audio_shadow: "Audio Shadow",
  lighting: "Lighting",
  media: "Lyrics",
  mon: "MON",
  broadcast: "Broadcast",
  tri_pod_camera: "Tri-Pod Camera",
  tri_pod_camera_1: "Tri-Pod Camera 1",
  tri_pod_camera_2: "Tri-Pod Camera 2",
  tri_pod_camera_3: "Tri-Pod Camera 3",
  tri_pod_camera_4: "Tri-Pod Camera 4",
  hand_held_camera: "Hand-Held Camera",
  hand_held_camera_1: "Hand-Held Camera 1",
  hand_held_camera_2: "Hand-Held Camera 2",
  hand_held_camera_3: "Hand-Held Camera 3",
  hand_held_camera_4: "Hand-Held Camera 4",
  director: "Director",
  director_2: "Director 2",
  director_3: "Director 3",
  director_4: "Director 4",
  graphics: "Graphics",
  graphics_2: "Graphics 2",
  graphics_3: "Graphics 3",
  graphics_4: "Graphics 4",
  producer: "Producer",
  switcher: "Switcher",
  photo_team: "Photography Team",
  art_team: "Art Team",
  chat_member: "Chat Member",
  student_cafe: "Cafe",
  student_hype: "Hype",
  student_prayer: "Prayer",
  student_hospitality: "Hospitality",
  student_small_group_leader: "Small Group Leader",
  pastor_mc: "M/C",
  pastor_prayer: "Prayer",
  pastor_speaker: "Speaker",
  switcher_2: "Switcher 2",
  switcher_3: "Switcher 3",
  switcher_4: "Switcher 4",
  other: "Other",
};

export const POSITION_LABELS_SHORT: Record<string, string> = {
  vocalist: "Vox",
  teacher: "Teach",
  announcement: "Ann",
  closing_prayer: "Prayer",
  closer: "Prayer",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  electric_3: "EG 3",
  electric_4: "EG 4",
  bass: "Bass",
  drums: "Drums",
  drum_tech: "Drum Tech",
  keys: "Keys",
  pad: "Pad",
  piano: "Piano",
  violin: "Violin",
  cello: "Cello",
  saxophone: "Sax",
  trumpet: "Trumpet",
  other_instrument: "Other",
  sound_tech: "FOH",
  audio_shadow: "Shadow",
  lighting: "Lighting",
  media: "Lyrics",
  mon: "MON",
  broadcast: "Broadcast",
  tri_pod_camera: "Tri-Pod Cam",
  tri_pod_camera_1: "Tri-Pod Cam 1",
  tri_pod_camera_2: "Tri-Pod Cam 2",
  tri_pod_camera_3: "Tri-Pod Cam 3",
  tri_pod_camera_4: "Tri-Pod Cam 4",
  hand_held_camera: "Hand-Held Cam",
  hand_held_camera_1: "Hand-Held Cam 1",
  hand_held_camera_2: "Hand-Held Cam 2",
  hand_held_camera_3: "Hand-Held Cam 3",
  hand_held_camera_4: "Hand-Held Cam 4",
  director: "Director",
  director_2: "Director 2",
  director_3: "Director 3",
  director_4: "Director 4",
  graphics: "Graphics",
  graphics_2: "Graphics 2",
  graphics_3: "Graphics 3",
  graphics_4: "Graphics 4",
  producer: "Producer",
  switcher: "Switcher",
  photo_team: "Photography Team",
  art_team: "Art Team",
  student_cafe: "Cafe",
  student_hype: "Hype",
  student_prayer: "Prayer",
  student_hospitality: "Hospitality",
  student_small_group_leader: "Small Group",
  pastor_mc: "M/C",
  pastor_prayer: "Prayer",
  pastor_speaker: "Speaker",
  switcher_2: "Switcher 2",
  switcher_3: "Switcher 3",
  switcher_4: "Switcher 4",
  other: "Other",
};

export const POSITION_CATEGORIES = {
  vocals: ["vocalist"],
  speaker: ["teacher", "announcement", "closing_prayer"],
  instruments: ["acoustic_1", "acoustic_2", "electric_1", "electric_2", "electric_3", "bass", "drums", "keys", "pad"],
  audio: ["sound_tech", "mon", "broadcast", "audio_shadow", "lighting", "media", "producer"],
  video: ["tri_pod_camera", "hand_held_camera", "director", "graphics", "switcher", "other"],
  creative: ["photo_team", "art_team"],
  students: [...STUDENT_POSITION_VALUES],
  pastors: ["pastor_mc", "pastor_prayer", "pastor_speaker"],
};

// Team Builder position slots - these map to position_slot column in team_members table
export const POSITION_SLOTS: {
  slot: string;
  label: string;
  category: string;
  position: string;
}[] = [
  { slot: "vocalist_1", label: "Vocalist 1", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_2", label: "Vocalist 2", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_3", label: "Vocalist 3", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_4", label: "Vocalist 4", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_5", label: "Vocalist 5", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_6", label: "Vocalist 6", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_7", label: "Vocalist 7", category: "Vocalists", position: "vocalist" },
  { slot: "vocalist_8", label: "Vocalist 8", category: "Vocalists", position: "vocalist" },
  { slot: "teacher", label: "Teacher", category: "Speaker", position: "teacher" },
  { slot: "announcement", label: "Announcements", category: "Speaker", position: "announcement" },
  { slot: "closing_prayer", label: "Closing Prayer", category: "Speaker", position: "closing_prayer" },
  { slot: "drums", label: "Drums", category: "Band", position: "drums" },
  { slot: "bass", label: "Bass", category: "Band", position: "bass" },
  { slot: "keys", label: "Keys", category: "Band", position: "keys" },
  { slot: "pad", label: "Pad", category: "Band", position: "pad" },
  { slot: "eg_1", label: "EG 1", category: "Band", position: "electric_guitar" },
  { slot: "eg_2", label: "EG 2", category: "Band", position: "electric_guitar" },
  { slot: "eg_3", label: "EG 3", category: "Band", position: "electric_guitar" },
  { slot: "eg_4", label: "EG 4", category: "Band", position: "electric_guitar" },
  { slot: "ag_1", label: "AG 1", category: "Band", position: "acoustic_guitar" },
  { slot: "ag_2", label: "AG 2", category: "Band", position: "acoustic_guitar" },
  // Production slots
  { slot: "foh", label: "FOH", category: "Production", position: "sound_tech" },
  { slot: "mon", label: "MON", category: "Production", position: "mon" },
  { slot: "broadcast", label: "Broadcast", category: "Production", position: "broadcast" },
  { slot: "audio_shadow", label: "Audio Shadow", category: "Production", position: "audio_shadow" },
  { slot: "lighting", label: "Lighting", category: "Production", position: "lighting" },
  { slot: "propresenter", label: "Lyrics", category: "Production", position: "media" },
  { slot: "producer", label: "Producer", category: "Production", position: "producer" },
  // Video slots
  { slot: "tri_pod_camera_1", label: "Tri-Pod Camera 1", category: "Video", position: "tri_pod_camera" },
  { slot: "tri_pod_camera_2", label: "Tri-Pod Camera 2", category: "Video", position: "tri_pod_camera" },
  { slot: "tri_pod_camera_3", label: "Tri-Pod Camera 3", category: "Video", position: "tri_pod_camera" },
  { slot: "tri_pod_camera_4", label: "Tri-Pod Camera 4", category: "Video", position: "tri_pod_camera" },
  { slot: "hand_held_camera_1", label: "Hand-Held Camera 1", category: "Video", position: "hand_held_camera" },
  { slot: "hand_held_camera_2", label: "Hand-Held Camera 2", category: "Video", position: "hand_held_camera" },
  { slot: "hand_held_camera_3", label: "Hand-Held Camera 3", category: "Video", position: "hand_held_camera" },
  { slot: "hand_held_camera_4", label: "Hand-Held Camera 4", category: "Video", position: "hand_held_camera" },
  { slot: "director", label: "Director", category: "Video", position: "director" },
  { slot: "director_2", label: "Director 2", category: "Video", position: "director" },
  { slot: "director_3", label: "Director 3", category: "Video", position: "director" },
  { slot: "director_4", label: "Director 4", category: "Video", position: "director" },
  { slot: "graphics", label: "Graphics", category: "Video", position: "graphics" },
  { slot: "graphics_2", label: "Graphics 2", category: "Video", position: "graphics" },
  { slot: "graphics_3", label: "Graphics 3", category: "Video", position: "graphics" },
  { slot: "graphics_4", label: "Graphics 4", category: "Video", position: "graphics" },
  { slot: "switcher", label: "Switcher", category: "Video", position: "switcher" },
  { slot: "switcher_2", label: "Switcher 2", category: "Video", position: "switcher" },
  { slot: "switcher_3", label: "Switcher 3", category: "Video", position: "switcher" },
  { slot: "switcher_4", label: "Switcher 4", category: "Video", position: "switcher" },
  // Creative slots
  { slot: "photo_team", label: "Photography Team", category: "Creative", position: "photo_team" },
  { slot: "art_team", label: "Art Team", category: "Creative", position: "art_team" },
  // Student Resource slots
  { slot: "student_cafe", label: "Cafe", category: "Students", position: "student_cafe" },
  { slot: "student_hype", label: "Hype", category: "Students", position: "student_hype" },
  { slot: "student_prayer", label: "Prayer", category: "Students", position: "student_prayer" },
  { slot: "student_hospitality", label: "Hospitality", category: "Students", position: "student_hospitality" },
  { slot: "student_small_group_leader", label: "Small Group Leader", category: "Students", position: "student_small_group_leader" },
  // Pastors slots (Student Camp leadership: M/C, Prayer, Speaker)
  { slot: "pastor_mc", label: "M/C", category: "Pastors", position: "pastor_mc" },
  { slot: "pastor_prayer", label: "Prayer", category: "Pastors", position: "pastor_prayer" },
  { slot: "pastor_speaker", label: "Speaker", category: "Pastors", position: "pastor_speaker" },
];

// Video positions (and their slot variants). Video teams differ between Saturday
// and Sunday, so video swaps/covers must stay date-specific rather than weekend-grouped.
const VIDEO_POSITION_VALUES = new Set<string>([
  ...POSITION_CATEGORIES.video.map((position) => position.toLowerCase()),
  ...POSITION_SLOTS.filter((slot) => slot.category === "Video").flatMap((slot) => [
    slot.slot.toLowerCase(),
    slot.position.toLowerCase(),
  ]),
]);

export function isVideoPosition(position: string | null | undefined): boolean {
  if (!position) return false;
  return VIDEO_POSITION_VALUES.has(position.trim().toLowerCase());
}

export const MINISTRY_TYPES = [
  { value: "weekend_team", label: "Weekend Worship", shortLabel: "WKDT", color: "bg-blue-600" },
  { value: "weekend", label: "Weekend Worship", shortLabel: "WKD", color: "bg-blue-500", hidden: true },
  { value: "worship_night", label: "Worship Night", shortLabel: "WN", color: "bg-indigo-600" },
  { value: "kids_camp", label: "Kids Camp", shortLabel: "KC", color: "bg-orange-500" },
  { value: "kids_camp_morning", label: "Kids Camp Morning", shortLabel: "KCM", color: "bg-orange-500", hidden: true },
  { value: "kids_camp_afternoon", label: "Kids Camp Afternoon", shortLabel: "KCA", color: "bg-orange-500", hidden: true },
  { value: "student_camp", label: "Student Camp", shortLabel: "SC", color: "bg-teal-600" },
  { value: "student_camp_morning", label: "Student Camp Morning", shortLabel: "SCM", color: "bg-teal-600", hidden: true },
  { value: "student_camp_evening", label: "Student Camp Evening", shortLabel: "SCE", color: "bg-teal-600", hidden: true },
  { value: "prayer_night", label: "Prayer Night", shortLabel: "PRAY", color: "bg-cyan-600" },
  { value: "encounter", label: "HS Worship", shortLabel: "HS", color: "bg-accent" },
  { value: "eon", label: "MS Worship", shortLabel: "MS", color: "bg-purple-500" },
  { value: "eon_weekend", label: "MS Worship Weekend", shortLabel: "MSW", color: "bg-violet-500" },
  { value: "evident", label: "Evident", shortLabel: "EV", color: "bg-zinc-900 ring-1 ring-zinc-500" },
  { value: "er", label: "ER", shortLabel: "ER", color: "bg-red-500" },
  { value: "audition", label: "Audition", shortLabel: "AUD", color: "bg-sky-600" },
  { value: "speaker", label: "Speaker", shortLabel: "SPK", color: "bg-amber-600" },
  { value: "production", label: "Production", shortLabel: "PROD", color: "bg-emerald-500" },
  { value: "video", label: "Video", shortLabel: "VID", color: "bg-rose-500" },
  { value: "creative", label: "Creative", shortLabel: "CRE", color: "bg-fuchsia-500" },
  { value: STUDENT_TEAM_BUILDER_MINISTRY_TYPE, label: "Students", shortLabel: "STU", color: "bg-blue-600" },
] as const;

export const SET_PLANNER_MINISTRY_OPTIONS = [
  { value: "weekend", label: "Weekend Services" },
  { value: "worship_night", label: "Worship Night" },
  { value: "kids_camp", label: "Kids Camp" },
  { value: "student_camp", label: "Student Camp" },
  { value: "prayer_night", label: "Prayer Night" },
  { value: "encounter", label: "HS Worship" },
  { value: "eon", label: "MS Worship" },
  { value: "eon_weekend", label: "MS Worship Weekend" },
  { value: "evident", label: "Evident Life" },
] as const;

// Which slot categories are available for each ministry type
// Production and Video only show when those specific ministries are selected
export const MINISTRY_SLOT_CATEGORIES: Record<string, string[]> = {
  weekend_team: ["Vocalists", "Speaker", "Band"],
  weekend: ["Vocalists", "Speaker", "Band"],
  worship_night: ["Vocalists", "Band"],
  kids_camp: ["Vocalists", "Band"],
  // Student Camp teams carry their own production crew (FOH, MON, Lyrics) instead of a
  // separately scheduled Production team. getTeamTemplateSlotConfigs limits the visible
  // production slots for this ministry to those three.
  student_camp: ["Pastors", "Vocalists", "Band", "Production"],
  prayer_night: [],
  encounter: ["Vocalists", "Band", "Production"],
  eon: ["Vocalists", "Band", "Production"],
  eon_weekend: ["Vocalists", "Band"],
  evident: ["Vocalists", "Band"],
  er: ["Vocalists", "Band"],
  speaker: ["Speaker"],
  production: ["Production"],
  video: ["Video"],
  creative: ["Creative"],
  students: ["Students"],
  all: ["Vocalists", "Speaker", "Pastors", "Band", "Production", "Video", "Creative", "Students"],
};

function normalizeMinistryTypeKey(ministryType: string | null | undefined) {
  return (ministryType || "all").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getTeamBuilderSlotCategories(ministryType: string | null | undefined) {
  // Session sets (Kids Camp / Student Camp morning/afternoon/evening) share their base
  // ministry's slot categories.
  const baseMinistryType = normalizeSessionSetMinistryType(ministryType) ?? ministryType;
  const normalizedMinistryType = normalizeMinistryTypeKey(baseMinistryType);

  return MINISTRY_SLOT_CATEGORIES[normalizedMinistryType] || MINISTRY_SLOT_CATEGORIES.all;
}

// Which teams are visible for each ministry type
// Maps ministry values to team name patterns - configure team count per ministry
export const MINISTRY_TEAM_FILTER: Record<string, string[] | null> = {
  weekend_team: ["Team 1", "Team 2", "Team 3", "Team 4", "Simple Worship", "5th Sunday"], // Weekend Worship teams plus special weekend options
  weekend: ["Team 1", "Team 2", "Team 3", "Team 4", "Simple Worship", "5th Sunday"], // Weekend Worship teams plus special weekend options
  worship_night: ["Team 1", "Team 2", "Team 3", "Team 4"], // Worship Night follows the same 4-team campus rotation
  kids_camp: ["Team 1", "Team 2", "Team 3", "Team 4"], // Kids Camp follows the standard 4-team campus rotation
  student_camp: ["Team 1", "Team 2", "Team 3", "Team 4"], // Student Camp follows the standard 4-team campus rotation
  prayer_night: [], // Custom-services only; no standard team rotation filter
  encounter: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for HS Worship
  eon: ["Team 1", "Team 2", "Team 3", "Team 4"], // MS Worship uses the full 4-team rotation
  eon_weekend: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for MS Worship Weekend
  evident: ["Team 1", "Team 2"], // 2 teams for Evident (smaller ministry)
  er: ["Team 1", "Team 2"], // 2 teams for ER (smaller ministry)
  speaker: ["Team 1", "Team 2", "Team 3", "Team 4", "5th Sunday"], // Speaker rotations follow campus team structure and include the special 5th Sunday team
  production: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Production
  video: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Video
  creative: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Creative
  students: [...STUDENT_TEAM_NAMES],
  all: null, // null means show all teams
};

const TEAM_NUMBER_PATTERN = /\b(?:team\s*|t)([1-9]\d*)\b/i;

export function getTeamRotationNumber(teamName: string): number | null {
  const match = teamName.match(TEAM_NUMBER_PATTERN);
  if (!match) return null;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// Built-in teams whose per-ministry visibility is intentionally controlled by
// MINISTRY_TEAM_FILTER. Any team NOT in this set is treated as a user-created
// custom team and is shown under every ministry filter (it was never tied to a
// specific rotation, so hiding it behind a filter would make it "disappear").
const BUILTIN_TEAM_NAMES = new Set(
  [
    ...Object.values(MINISTRY_TEAM_FILTER).flatMap((list) => list ?? []),
    "Combined",
  ].map((name) => name.toLowerCase()),
);

export function isTeamVisibleForMinistry(teamName: string, ministryType: string): boolean {
  const allowedTeams = MINISTRY_TEAM_FILTER[ministryType];
  if (!allowedTeams) return true;
  if (allowedTeams.length === 0) return false;

  if (allowedTeams.includes(teamName)) {
    return true;
  }

  const teamNumber = getTeamRotationNumber(teamName);
  if (teamNumber == null) {
    // Custom teams (anything that isn't a recognized built-in) stay visible so a
    // newly created team shows up no matter which ministry filter is active.
    return !BUILTIN_TEAM_NAMES.has(teamName.toLowerCase());
  }

  return allowedTeams.some((allowedTeamName) => getTeamRotationNumber(allowedTeamName) === teamNumber);
}

const WEEKEND_TEAM_MINISTRY_TYPES = new Set(["weekend", "weekend_team", "sunday_am", "speaker"]);
const CREATIVE_MINISTRY_TYPES = new Set(["creative", "photo_team"]);
export const KIDS_CAMP_SET_MINISTRY_TYPES = ["kids_camp", "kids_camp_morning", "kids_camp_afternoon"] as const;
const KIDS_CAMP_SET_MINISTRY_TYPE_SET = new Set<string>(KIDS_CAMP_SET_MINISTRY_TYPES);

export function isKidsCampSetMinistryType(ministryType: string | null | undefined): boolean {
  return !!ministryType && KIDS_CAMP_SET_MINISTRY_TYPE_SET.has(ministryType);
}

// "Session set" services run multiple worship sets on the same day (Kids Camp
// Morning/Afternoon, Student Camp Morning/Evening, ...). They may be linked to a
// custom service for date/service-flow scoping, but their roster, publish flow, and
// confirmations all come from the Team Builder schedule under the BASE ministry type.
// To add another multi-session service, add its base here and create the matching
// MINISTRY_TYPES / MINISTRY_SLOT_CATEGORIES / MINISTRY_TEAM_FILTER entries above.
export const SESSION_SET_BASE_MINISTRY_TYPES = ["kids_camp", "student_camp"] as const;
const SESSION_SET_SUFFIXES = ["_morning", "_afternoon", "_evening"] as const;
const SESSION_SET_MINISTRY_TYPE_SET = new Set<string>(
  SESSION_SET_BASE_MINISTRY_TYPES.flatMap((base) => [
    base,
    ...SESSION_SET_SUFFIXES.map((suffix) => `${base}${suffix}`),
  ]),
);

export function isSessionSetMinistryType(ministryType: string | null | undefined): boolean {
  return !!ministryType && SESSION_SET_MINISTRY_TYPE_SET.has(ministryType);
}

// Collapse a session variant (e.g. "student_camp_evening") to its base
// ("student_camp"). Non-session ministry types are returned unchanged.
export function normalizeSessionSetMinistryType(
  ministryType: string | null | undefined,
): string | null | undefined {
  if (!isSessionSetMinistryType(ministryType)) return ministryType;
  return getMinistrySession(ministryType).baseMinistryType || ministryType;
}

// All ministry types (base + session variants) that share a base with the given type.
// Used for queries that must consider every session of one service together.
export function getSessionSetVariants(ministryType: string | null | undefined): string[] {
  const base = normalizeSessionSetMinistryType(ministryType);
  if (!base || !SESSION_SET_BASE_MINISTRY_TYPES.includes(base as (typeof SESSION_SET_BASE_MINISTRY_TYPES)[number])) {
    return ministryType ? [ministryType] : [];
  }
  return [base, ...SESSION_SET_SUFFIXES.map((suffix) => `${base}${suffix}`)];
}

// Ministries that are Network Wide instead of scoped to a single campus. Their
// saved sets, custom services, service-time overrides, camp instances, calendar
// events, and team schedule are shared across every campus and stored with a NULL
// campus_id (the app-wide "network wide" convention). Reads/writes for these
// ministries must target campus_id IS NULL rather than a concrete campus.
export const NETWORK_WIDE_MINISTRY_TYPES = new Set<string>([
  "student_camp",
  "student_camp_morning",
  "student_camp_evening",
]);

export function isNetworkWideMinistryType(ministryType: string | null | undefined): boolean {
  return !!ministryType && NETWORK_WIDE_MINISTRY_TYPES.has(ministryType);
}

// Camp-family ministries (Student Camp, Kids Camp, and their session variants). These
// are the ministries offered under the "Network Wide" pseudo-campus in Campus
// Assignments, and Team Builder resolves their eligibility to that campus so a person's
// camp assignment is shared across the network rather than tied to a physical campus.
export const CAMP_FAMILY_MINISTRY_TYPES = new Set<string>([
  ...SESSION_SET_BASE_MINISTRY_TYPES.flatMap((base) => [
    base,
    ...SESSION_SET_SUFFIXES.map((suffix) => `${base}${suffix}`),
  ]),
]);

export function isCampFamilyMinistry(ministryType: string | null | undefined): boolean {
  return !!ministryType && CAMP_FAMILY_MINISTRY_TYPES.has(ministryType);
}

// Resolve the campus_id that reads/writes for a ministry should target: NULL for
// network-wide ministries (Student Camp), otherwise the provided campus.
export function resolveMinistryCampusId(
  ministryType: string | null | undefined,
  campusId: string | null | undefined,
): string | null {
  return isNetworkWideMinistryType(ministryType) ? null : campusId ?? null;
}

// Multi-session day services (e.g. Kids Camp Morning/Afternoon, Student Camp
// Morning/Evening) encode the session as a suffix on the ministry type. Detecting
// the suffix lets the app combine same-day sessions of one service into a single view.
export const MINISTRY_SESSION_DEFS = [
  { suffix: "_morning", label: "Morning", order: 0 },
  { suffix: "_afternoon", label: "Afternoon", order: 1 },
  { suffix: "_evening", label: "Evening", order: 2 },
] as const;

export interface MinistrySessionInfo {
  baseMinistryType: string;
  sessionLabel: string | null;
  sessionOrder: number;
}

export function getMinistrySession(
  ministryType: string | null | undefined,
): MinistrySessionInfo {
  if (ministryType) {
    for (const def of MINISTRY_SESSION_DEFS) {
      if (ministryType.endsWith(def.suffix)) {
        return {
          baseMinistryType: ministryType.slice(0, -def.suffix.length),
          sessionLabel: def.label,
          sessionOrder: def.order,
        };
      }
    }
  }
  return { baseMinistryType: ministryType ?? "", sessionLabel: null, sessionOrder: -1 };
}

export function normalizeWeekendWorshipMinistryType(
  ministryType: string | null | undefined,
): string | null | undefined {
  if (!ministryType) {
    return ministryType;
  }

  return WEEKEND_TEAM_MINISTRY_TYPES.has(ministryType) ? "weekend" : ministryType;
}

export function getMinistryLabel(ministryType: string | null | undefined): string {
  if (ministryType && CREATIVE_MINISTRY_TYPES.has(ministryType)) {
    return "Creative";
  }

  const normalizedType = normalizeWeekendWorshipMinistryType(ministryType);
  return MINISTRY_TYPES.find((ministry) => ministry.value === normalizedType)?.label || normalizedType || "All";
}

export function resolveTeamBuilderSlotMinistryType(
  ministryFilter: string | null | undefined,
  slot: string | null | undefined,
): string | undefined {
  if (!ministryFilter || ministryFilter === "all") {
    return undefined;
  }

  if (ministryFilter === "speaker") {
    return "weekend";
  }

  if (ministryFilter !== "weekend_team") {
    return ministryFilter;
  }

  const slotConfig = POSITION_SLOTS.find((positionSlot) => positionSlot.slot === slot);

  if (slotConfig?.category === "Production") {
    return "production";
  }

  if (slotConfig?.category === "Video") {
    return "video";
  }

  return "weekend";
}

export function memberMatchesMinistryFilter(
  ministryTypes: string[] | null | undefined,
  ministryFilter: string,
): boolean {
  if (ministryFilter === "all") {
    return true;
  }

  if (WEEKEND_TEAM_MINISTRY_TYPES.has(ministryFilter)) {
    return !!ministryTypes?.some((type) => WEEKEND_TEAM_MINISTRY_TYPES.has(type) || type === "speaker");
  }

  if (CREATIVE_MINISTRY_TYPES.has(ministryFilter)) {
    return !!ministryTypes?.some((type) => CREATIVE_MINISTRY_TYPES.has(type));
  }

  return !!ministryTypes?.includes(ministryFilter);
}

export function breakRequestMatchesMinistryFilter(
  requestMinistryType: string | null | undefined,
  ministryFilter: string,
): boolean {
  if (ministryFilter === "all") {
    return true;
  }

  if (!requestMinistryType) {
    return true;
  }

  if (WEEKEND_TEAM_MINISTRY_TYPES.has(ministryFilter)) {
    return WEEKEND_TEAM_MINISTRY_TYPES.has(requestMinistryType) || requestMinistryType === "speaker";
  }

  if (CREATIVE_MINISTRY_TYPES.has(ministryFilter)) {
    return CREATIVE_MINISTRY_TYPES.has(requestMinistryType);
  }

  return requestMinistryType === ministryFilter;
}
