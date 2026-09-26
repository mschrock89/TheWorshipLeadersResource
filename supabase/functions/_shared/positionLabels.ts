// Display names for serving reminders. Slot wins when several chairs share one
// backend position (acoustic_guitar is both AG 1 and AG 2). Vocalist chairs
// collapse to "Vocalist" rather than "Vocalist 1".

const POSITION_LABELS: Record<string, string> = {
  vocalist: "Vocalist",
  teacher: "Teacher",
  announcement: "Announcements",
  announcements: "Announcements",
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
  lighting: "Lights",
  media: "Lyrics",
  mon: "MON",
  broadcast: "Broadcast",
  tri_pod_camera: "Tri-Pod Camera",
  hand_held_camera: "Hand-Held Camera",
  director: "Director",
  graphics: "Graphics",
  producer: "Producer",
  switcher: "Switcher",
  photo_team: "Photography Team",
  art_team: "Art Team",
  student_cafe: "Cafe",
  student_hype: "Hype",
  student_prayer: "Prayer",
  student_hospitality: "Hospitality",
  student_small_group_leader: "Small Group Leader",
  pastor_mc: "M/C",
  pastor_prayer: "Prayer",
  pastor_speaker: "Speaker",
  pastor_game_master: "Game Master",
  other: "Other",
};

const SLOT_LABELS: Record<string, string> = {
  ag_1: "AG 1",
  ag_2: "AG 2",
  eg_1: "EG 1",
  eg_2: "EG 2",
  eg_3: "EG 3",
  eg_4: "EG 4",
  drums: "Drums",
  bass: "Bass",
  keys: "Keys",
  pad: "Pad",
  teacher: "Teacher",
  announcement: "Announcements",
  closing_prayer: "Closing Prayer",
  foh: "FOH",
  mon: "MON",
  broadcast: "Broadcast",
  audio_shadow: "Audio Shadow",
  lighting: "Lights",
  propresenter: "Lyrics",
  producer: "Producer",
  tri_pod_camera_1: "Tri-Pod Camera 1",
  tri_pod_camera_2: "Tri-Pod Camera 2",
  tri_pod_camera_3: "Tri-Pod Camera 3",
  tri_pod_camera_4: "Tri-Pod Camera 4",
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
  switcher: "Switcher",
  switcher_2: "Switcher 2",
  switcher_3: "Switcher 3",
  switcher_4: "Switcher 4",
  photo_team: "Photography Team",
  art_team: "Art Team",
  student_cafe: "Cafe",
  student_hype: "Hype",
  student_prayer: "Prayer",
  student_hospitality: "Hospitality",
  student_small_group_leader: "Small Group Leader",
  pastor_mc: "M/C",
  pastor_prayer: "Prayer",
  pastor_speaker: "Speaker",
  pastor_game_master: "Game Master",
};

function normalizeKey(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function titleCaseSnake(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
}

export function formatServingPosition(
  position: string | null | undefined,
  slot?: string | null,
): string {
  const slotKey = normalizeKey(slot);
  const positionKey = normalizeKey(position);

  if (/^vocalist_\d+$/.test(slotKey) || /^vocalist_\d+$/.test(positionKey)) {
    return "Vocalist";
  }

  if (slotKey && SLOT_LABELS[slotKey]) return SLOT_LABELS[slotKey];
  if (positionKey && SLOT_LABELS[positionKey]) return SLOT_LABELS[positionKey];
  if (positionKey && POSITION_LABELS[positionKey]) return POSITION_LABELS[positionKey];

  const raw = (position || slot || "").trim();
  if (!raw) return "";
  if (raw.includes(" ") || /[A-Z]/.test(raw)) return raw;
  return titleCaseSnake(raw);
}
