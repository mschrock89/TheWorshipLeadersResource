export const ROLE_LABELS: Record<string, string> = {
  admin: "Organization Admin",
  campus_admin: "Campus Admin",
  network_worship_pastor: "Network Worship Pastor",
  campus_worship_pastor: "Campus Worship Pastor",
  student_worship_pastor: "Student Worship Leader",
  video_director: "Video Director",
  production_manager: "Production Manager",
  volunteer: "Volunteer",
};

// Roles that can be combined (leadership roles)
export const LEADERSHIP_ROLES = ['admin', 'campus_admin'] as const;

// Base roles (mutually exclusive - user gets one of these)
export const BASE_ROLES = ['network_worship_pastor', 'campus_worship_pastor', 'student_worship_pastor', 'video_director', 'production_manager', 'volunteer'] as const;

export const POSITION_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  bass: "Bass",
  drums: "Drums",
  keys: "Keys",
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
  camera_1: "Camera 1",
  camera_2: "Camera 2",
  camera_3: "Camera 3",
  camera_4: "Camera 4",
  camera_5: "Camera 5",
  camera_6: "Camera 6",
  chat_host: "Chat Host",
  director: "Director",
  graphics: "Graphics",
  producer: "Producer",
  switcher: "Switcher",
  other: "Other",
};

export const POSITION_LABELS_SHORT: Record<string, string> = {
  vocalist: "Vox",
  acoustic_guitar: "AG 1",
  acoustic_1: "AG 1",
  acoustic_2: "AG 2",
  electric_guitar: "EG 1",
  electric_1: "EG 1",
  electric_2: "EG 2",
  bass: "Bass",
  drums: "Drums",
  keys: "Keys",
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
  camera_1: "Cam 1",
  camera_2: "Cam 2",
  camera_3: "Cam 3",
  camera_4: "Cam 4",
  camera_5: "Cam 5",
  camera_6: "Cam 6",
  chat_host: "Chat",
  director: "Director",
  graphics: "Graphics",
  producer: "Producer",
  switcher: "Switcher",
  other: "Other",
};

export const POSITION_CATEGORIES = {
  vocals: ["vocalist"],
  instruments: ["acoustic_1", "acoustic_2", "electric_1", "electric_2", "bass", "drums", "keys"],
  audio: ["sound_tech", "mon", "broadcast", "audio_shadow", "lighting", "media", "producer"],
  video: ["camera_1", "camera_2", "camera_3", "camera_4", "camera_5", "camera_6", "chat_host", "director", "graphics", "switcher", "other"],
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
  { slot: "drums", label: "Drums", category: "Band", position: "drums" },
  { slot: "bass", label: "Bass", category: "Band", position: "bass" },
  { slot: "keys", label: "Keys", category: "Band", position: "keys" },
  { slot: "eg_1", label: "EG 1", category: "Band", position: "electric_guitar" },
  { slot: "eg_2", label: "EG 2", category: "Band", position: "electric_guitar" },
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
  { slot: "camera_1", label: "Camera 1", category: "Video", position: "camera_1" },
  { slot: "camera_2", label: "Camera 2", category: "Video", position: "camera_2" },
  { slot: "camera_3", label: "Camera 3", category: "Video", position: "camera_3" },
  { slot: "camera_4", label: "Camera 4", category: "Video", position: "camera_4" },
  { slot: "camera_5", label: "Camera 5", category: "Video", position: "camera_5" },
  { slot: "camera_6", label: "Camera 6", category: "Video", position: "camera_6" },
  { slot: "chat_host", label: "Chat Host", category: "Video", position: "chat_host" },
  { slot: "director", label: "Director", category: "Video", position: "director" },
  { slot: "graphics", label: "Graphics", category: "Video", position: "graphics" },
  { slot: "switcher", label: "Switcher", category: "Video", position: "switcher" },
];

export const MINISTRY_TYPES = [
  { value: "weekend_team", label: "Weekend Team", shortLabel: "WKDT", color: "bg-blue-600" },
  { value: "weekend", label: "Weekend Worship", shortLabel: "WKD", color: "bg-blue-500", hidden: true },
  { value: "encounter", label: "Encounter", shortLabel: "EN", color: "bg-accent" },
  { value: "eon", label: "EON", shortLabel: "EON", color: "bg-purple-500" },
  { value: "eon_weekend", label: "EON Weekend", shortLabel: "EONW", color: "bg-violet-500" },
  { value: "evident", label: "Evident", shortLabel: "EV", color: "bg-zinc-900 ring-1 ring-zinc-500" },
  { value: "er", label: "ER", shortLabel: "ER", color: "bg-red-500" },
  { value: "production", label: "Production", shortLabel: "PROD", color: "bg-emerald-500" },
  { value: "video", label: "Video", shortLabel: "VID", color: "bg-rose-500" },
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
  weekend_team: ["Vocalists", "Band", "Production", "Video"],
  weekend: ["Vocalists", "Band"],
  encounter: ["Vocalists", "Band"],
  eon: ["Vocalists", "Band"],
  eon_weekend: ["Vocalists", "Band"],
  evident: ["Vocalists", "Band"],
  er: ["Vocalists", "Band"],
  production: ["Production"],
  video: ["Video"],
  all: ["Vocalists", "Band", "Production", "Video"],
};

// Which teams are visible for each ministry type
// Maps ministry values to team name patterns - configure team count per ministry
export const MINISTRY_TEAM_FILTER: Record<string, string[] | null> = {
  weekend_team: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Weekend Team (combined)
  weekend: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Experience Music
  encounter: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Encounter
  eon: ["Team 1", "Team 2"], // 2 teams for EON (smaller ministry)
  eon_weekend: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for EON Weekend
  evident: ["Team 1", "Team 2"], // 2 teams for Evident (smaller ministry)
  er: ["Team 1", "Team 2"], // 2 teams for ER (smaller ministry)
  production: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Production
  video: ["Team 1", "Team 2", "Team 3", "Team 4"], // All 4 teams for Video
  all: null, // null means show all teams
};

