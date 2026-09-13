// Keep in sync with public.canonical_swap_position and src/lib/swapPositions.ts.
const VOCALIST_POSITIONS = ["vocalist", "lead_vocals", "harmony_vocals", "background_vocals"];
const ELECTRIC_POSITION_VARIANTS = [
  "electric_guitar",
  "electric_1",
  "electric_2",
  "electric_3",
  "electric_4",
  "eg_1",
  "eg_2",
  "eg_3",
  "eg_4",
  "eg1",
  "eg2",
  "eg3",
  "eg4",
  "EG 1",
  "EG 2",
  "EG 3",
  "EG 4",
];
const ACOUSTIC_POSITION_VARIANTS = [
  "acoustic_guitar",
  "acoustic_1",
  "acoustic_2",
  "ag_1",
  "ag_2",
  "ag1",
  "ag2",
  "AG 1",
  "AG 2",
];

export function normalizeSwapPosition(position: string): string {
  return position.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function canonicalSwapPosition(position: string): string {
  const token = normalizeSwapPosition(position);
  if (!token) return "";

  if (
    VOCALIST_POSITIONS.includes(token) ||
    token === "vocals" ||
    /^vocalist_\d+$/.test(token)
  ) {
    return "vocalist";
  }

  const electricVariants = new Set(ELECTRIC_POSITION_VARIANTS.map(normalizeSwapPosition));
  if (
    token === "electric_guitar" ||
    token === "electric" ||
    electricVariants.has(token) ||
    /^electric_\d+$/.test(token) ||
    /^eg_?\d+$/.test(token)
  ) {
    return "electric_guitar";
  }

  const acousticVariants = new Set(ACOUSTIC_POSITION_VARIANTS.map(normalizeSwapPosition));
  if (
    token === "acoustic_guitar" ||
    token === "acoustic" ||
    acousticVariants.has(token) ||
    /^acoustic_\d+$/.test(token) ||
    /^ag_?\d+$/.test(token)
  ) {
    return "acoustic_guitar";
  }

  if (token === "sound_tech" || token === "foh" || token === "front_of_house") return "sound_tech";
  if (token === "media" || token === "lyrics" || token === "propresenter") return "media";
  if (token === "lighting" || token === "lights") return "lighting";
  if (token === "announcement" || token === "announcements") return "announcement";
  if (token === "closing_prayer" || token === "closer") return "closing_prayer";
  if (token === "broadcast" || token === "broadcast_mix") return "broadcast";

  if (token === "tri_pod_camera" || /^tri_pod_camera_\d+$/.test(token) || /^camera_\d+$/.test(token)) {
    return "tri_pod_camera";
  }
  if (token === "hand_held_camera" || /^hand_held_camera_\d+$/.test(token)) {
    return "hand_held_camera";
  }
  if (token === "director" || /^director_\d+$/.test(token)) return "director";
  if (token === "graphics" || /^graphics_\d+$/.test(token)) return "graphics";
  if (token === "switcher" || token === "video_switcher" || /^switcher_\d+$/.test(token)) {
    return "switcher";
  }

  return token;
}

export function swapPositionsMatch(left: string, right: string): boolean {
  const family = canonicalSwapPosition(left);
  return family !== "" && family === canonicalSwapPosition(right);
}
