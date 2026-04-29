export const ROLE_LABELS: Record<string, string> = {
  admin: "Organization Admin",
  campus_admin: "Campus Admin",
  network_worship_pastor: "Network Worship Pastor",
  campus_worship_pastor: "Campus Worship Pastor",
  student_worship_pastor: "Student Worship Leader",
  speaker: "Speaker",
  video_director: "Video Director",
  production_manager: "Production Manager",
  audition_candidate: "Audition Candidate",
  volunteer: "Volunteer",
};

// Roles that can be combined (leadership roles)
export const LEADERSHIP_ROLES = ['admin', 'campus_admin'] as const;

// Base roles (mutually exclusive - user gets one of these)
export const BASE_ROLES = ['network_worship_pastor', 'campus_worship_pastor', 'student_worship_pastor', 'speaker', 'video_director', 'production_manager', 'audition_candidate', 'volunteer'] as const;

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
];

export const MINISTRY_TYPES = [
  { value: "weekend_team", label: "Weekend Worship", shortLabel: "WKDT", color: "bg-blue-600" },
  { value: "weekend", label: "Weekend Worship", shortLabel: "WKD", color: "bg-blue-500", hidden: true },
  { value: "worship_night", label: "Worship Night", shortLabel: "WN", color: "bg-indigo-600" },
  { value: "kids_camp", label: "Kids Camp", shortLabel: "KC", color: "bg-orange-500" },
  { value: "prayer_night", label: "Prayer Night", shortLabel: "PRAY", color: "bg-cyan-600" },
  { value: "encounter", label: "Encounter", shortLabel: "EN", color: "bg-accent" },
  { value: "eon", label: "EON", shortLabel: "EON", color: "bg-purple-500" },
  { value: "eon_weekend", label: "EON Weekend", shortLabel: "EONW", color: "bg-violet-500" },
  { value: "evident", label: "Evident", shortLabel: "EV", color: "bg-zinc-900 ring-1 ring-zinc-500" },
  { value: "er", label: "ER", shortLabel: "ER", color: "bg-red-500" },
  { value: "audition", label: "Audition", shortLabel: "AUD", color: "bg-sky-600" },
  { value: "speaker", label: "Speaker", shortLabel: "SPK", color: "bg-amber-600" },
  { value: "production", label: "Production", shortLabel: "PROD", color: "bg-emerald-500" },
  { value: "video", label: "Video", shortLabel: "VID", color: "bg-rose-500" },
] as const;

export const SET_PLANNER_MINISTRY_OPTIONS = [
  { value: "weekend", label: "Weekend Services" },
  { value: "worship_night", label: "Worship Night" },
  { value: "kids_camp", label: "Kids Camp" },
  { value: "prayer_night", label: "Prayer Night" },
  { value: "encounter", label: "Encounter" },
  { value: "eon", label: "EON" },
  { value: "eon_weekend", label: "EON Weekend" },
  { value: "evident", label: "Evident Life" },
] as const;

// Service Flow item types
export const SERVICE_FLOW_ITEM_TYPES = {
  header: { label: "Header", description: "Section divider" },
  item: { label: "Item", description: "General service element" },
  song: { label: "Song", description: "Song from setlist" },
  song_placeholder: { label: "Song Placeholder", description: "Placeholder for template" },
} as const;

// Which slot categories are available for each ministry type
// Production and Video only show when those specific ministries are selected
export const MINISTRY_SLOT_CATEGORIES: Record<string, string[]> = {
  weekend_team: ["Vocalists", "Speaker", "Band"],
  weekend: ["Vocalists", "Speaker", "Band"],
  worship_night: ["Vocalists", "Band"],
  kids_camp: ["Vocalists", "Speaker", "Band"],
  prayer_night: [],
  encounter: ["Vocalists", "Band", "Production"],
  eon: ["Vocalists", "Band", "Production"],
  eon_weekend: ["Vocalists", "Band"],
  evident: ["Vocalists", "Band"],
  er: ["Vocalists", "Band"],
  speaker: ["Speaker"],
  production: ["Production"],
  video: ["Video"],
  all: ["Vocalists", "Speaker", "Band", "Production", "Video"],
};

// Which teams are visible for each ministry type
// Maps ministry values to team name patterns - configure team count per ministry
export const MINISTRY_TEAM_FILTER: Record<string, string[] | null> = {
  weekend_team: ["Team 1", "Team 2", "Team 3", "Team 4", "Simple Worship", "5th Sunday"], // Weekend Worship teams plus special weekend options
  weekend: ["Team 1", "Team 2", "Team 3", "Team 4", "Simple Worship", "5th Sunday"], // Weekend Worship teams plus special weekend options
  worship_night: ["Team 1", "Team 2", "Team 3", "Team 4"], // Worship Night follows the same 4-team campus rotation
  kids_camp: ["Team 1", "Team 2", "Team 3", "Team 4"], // Kids Camp follows the standard 4-team campus rotation
  prayer_night: [], // Custom-services only; no standard team rotation filter
  encounter: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Encounter
  eon: ["Team 1", "Team 2", "Team 3", "Team 4"], // EON uses the full 4-team rotation
  eon_weekend: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for EON Weekend
  evident: ["Team 1", "Team 2"], // 2 teams for Evident (smaller ministry)
  er: ["Team 1", "Team 2"], // 2 teams for ER (smaller ministry)
  speaker: ["Team 1", "Team 2", "Team 3", "Team 4", "5th Sunday"], // Speaker rotations follow campus team structure and include the special 5th Sunday team
  production: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Production
  video: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Video
  all: null, // null means show all teams
};

const TEAM_NUMBER_PATTERN = /\b(?:team\s*|t)([1-9]\d*)\b/i;

export function getTeamRotationNumber(teamName: string): number | null {
  const match = teamName.match(TEAM_NUMBER_PATTERN);
  if (!match) return null;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isTeamVisibleForMinistry(teamName: string, ministryType: string): boolean {
  const allowedTeams = MINISTRY_TEAM_FILTER[ministryType];
  if (!allowedTeams) return true;
  if (allowedTeams.length === 0) return false;

  if (allowedTeams.includes(teamName)) {
    return true;
  }

  const teamNumber = getTeamRotationNumber(teamName);
  if (teamNumber == null) {
    return false;
  }

  return allowedTeams.some((allowedTeamName) => getTeamRotationNumber(allowedTeamName) === teamNumber);
}

const WEEKEND_TEAM_MINISTRY_TYPES = new Set(["weekend", "weekend_team", "sunday_am"]);

export function normalizeWeekendWorshipMinistryType(
  ministryType: string | null | undefined,
): string | null | undefined {
  if (!ministryType) {
    return ministryType;
  }

  return WEEKEND_TEAM_MINISTRY_TYPES.has(ministryType) ? "weekend" : ministryType;
}

export function getMinistryLabel(ministryType: string | null | undefined): string {
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

  return requestMinistryType === ministryFilter;
}
