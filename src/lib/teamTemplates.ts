import { POSITION_SLOTS } from "@/lib/constants";

export type VocalSlotGender = "male" | "female";

export interface TeamTemplateConfig {
  vocalSlots?: Array<{
    slot: string;
    gender: VocalSlotGender;
  }>;
  bandSlots?: string[];
  productionSlots?: string[];
  videoSlots?: string[];
}

const DEFAULT_VOCAL_SLOTS: TeamTemplateConfig["vocalSlots"] = [
  { slot: "vocalist_1", gender: "male" },
  { slot: "vocalist_2", gender: "male" },
  { slot: "vocalist_3", gender: "female" },
  { slot: "vocalist_4", gender: "female" },
];

const DEFAULT_BAND_SLOTS = ["drums", "bass", "keys", "eg_1", "eg_2", "ag_1", "ag_2"];
const DEFAULT_PRODUCTION_SLOTS = [
  "foh",
  "mon",
  "broadcast",
  "audio_shadow",
  "lighting",
  "propresenter",
  "producer",
];
const DEFAULT_VIDEO_SLOTS = [
  "tri_pod_camera_1",
  "hand_held_camera_1",
  "director",
  "graphics",
  "switcher",
];
const VALID_VOCAL_SLOTS = new Set(DEFAULT_VOCAL_SLOTS.map((slot) => slot.slot));
const VALID_BAND_SLOTS = new Set(DEFAULT_BAND_SLOTS);
const VALID_PRODUCTION_SLOTS = new Set(DEFAULT_PRODUCTION_SLOTS);
const VALID_VIDEO_SLOTS = new Set([
  "tri_pod_camera_1",
  "tri_pod_camera_2",
  "tri_pod_camera_3",
  "tri_pod_camera_4",
  "hand_held_camera_1",
  "hand_held_camera_2",
  "hand_held_camera_3",
  "hand_held_camera_4",
  "director",
  "director_2",
  "director_3",
  "director_4",
  "graphics",
  "graphics_2",
  "graphics_3",
  "graphics_4",
  "switcher",
  "switcher_2",
  "switcher_3",
  "switcher_4",
]);

export const DEFAULT_TEAM_TEMPLATE: Required<TeamTemplateConfig> = {
  vocalSlots: DEFAULT_VOCAL_SLOTS,
  bandSlots: DEFAULT_BAND_SLOTS,
  productionSlots: DEFAULT_PRODUCTION_SLOTS,
  videoSlots: DEFAULT_VIDEO_SLOTS,
};

export function normalizeTeamTemplateConfig(config: TeamTemplateConfig | null | undefined): Required<TeamTemplateConfig> {
  const normalizedVocalSlots = Array.isArray(config?.vocalSlots)
    ? config.vocalSlots
        .filter(
          (slot): slot is { slot: string; gender: VocalSlotGender } =>
            !!slot &&
            VALID_VOCAL_SLOTS.has(slot.slot) &&
            (slot.gender === "male" || slot.gender === "female"),
        )
        .sort((a, b) => a.slot.localeCompare(b.slot))
    : [];

  const normalizedBandSlots = Array.isArray(config?.bandSlots)
    ? config.bandSlots.filter((slot): slot is string => VALID_BAND_SLOTS.has(slot))
    : [];
  const normalizedProductionSlots = Array.isArray(config?.productionSlots)
    ? config.productionSlots.filter((slot): slot is string => VALID_PRODUCTION_SLOTS.has(slot))
    : [];
  const normalizedVideoSlots = Array.isArray(config?.videoSlots)
    ? config.videoSlots.filter((slot): slot is string => VALID_VIDEO_SLOTS.has(slot))
    : [];

  return {
    vocalSlots: normalizedVocalSlots.length > 0 ? normalizedVocalSlots : DEFAULT_TEAM_TEMPLATE.vocalSlots,
    bandSlots: normalizedBandSlots.length > 0 ? normalizedBandSlots : DEFAULT_TEAM_TEMPLATE.bandSlots,
    productionSlots:
      normalizedProductionSlots.length > 0
        ? normalizedProductionSlots
        : DEFAULT_TEAM_TEMPLATE.productionSlots,
    videoSlots: normalizedVideoSlots.length > 0 ? normalizedVideoSlots : DEFAULT_TEAM_TEMPLATE.videoSlots,
  };
}

export function getTeamTemplateSlotConfigs(teamTemplateConfig: TeamTemplateConfig | null | undefined) {
  const template = normalizeTeamTemplateConfig(teamTemplateConfig);
  const vocalGenderCounts: Record<VocalSlotGender, number> = { male: 0, female: 0 };

  const vocalSlots = template.vocalSlots
    .map((templateSlot) => {
      const slotConfig = POSITION_SLOTS.find((slot) => slot.slot === templateSlot.slot);
      if (!slotConfig) return null;

      vocalGenderCounts[templateSlot.gender] += 1;

      return {
        ...slotConfig,
        label: `${templateSlot.gender === "male" ? "Male" : "Female"} Vocal ${vocalGenderCounts[templateSlot.gender]}`,
        vocalGender: templateSlot.gender,
      };
    })
    .filter(
      (
        slot,
      ): slot is (typeof POSITION_SLOTS)[number] & {
        vocalGender: VocalSlotGender;
      } => Boolean(slot),
    );

  const bandSlots = template.bandSlots
    .map((slotId) => POSITION_SLOTS.find((slot) => slot.slot === slotId))
    .filter((slot): slot is (typeof POSITION_SLOTS)[number] => Boolean(slot));
  const productionSlots = template.productionSlots
    .map((slotId) => POSITION_SLOTS.find((slot) => slot.slot === slotId))
    .filter((slot): slot is (typeof POSITION_SLOTS)[number] => Boolean(slot));
  const videoSlots = template.videoSlots
    .map((slotId) => POSITION_SLOTS.find((slot) => slot.slot === slotId))
    .filter((slot): slot is (typeof POSITION_SLOTS)[number] => Boolean(slot));

  return {
    vocalSlots,
    bandSlots,
    productionSlots,
    videoSlots,
    visibleSlotIds: new Set([
      ...vocalSlots.map((slot) => slot.slot),
      ...bandSlots.map((slot) => slot.slot),
      ...productionSlots.map((slot) => slot.slot),
      ...videoSlots.map((slot) => slot.slot),
    ]),
  };
}

export function getRequiredGenderForSlot(
  teamTemplateConfig: TeamTemplateConfig | null | undefined,
  slotId: string,
): VocalSlotGender | null {
  const template = normalizeTeamTemplateConfig(teamTemplateConfig);
  return template.vocalSlots.find((slot) => slot.slot === slotId)?.gender || null;
}

export function isTeamSlotVisible(teamTemplateConfig: TeamTemplateConfig | null | undefined, slotId: string) {
  const slotConfig = POSITION_SLOTS.find((slot) => slot.slot === slotId);
  if (!slotConfig) return false;
  if (
    slotConfig.category !== "Vocalists" &&
    slotConfig.category !== "Band" &&
    slotConfig.category !== "Production" &&
    slotConfig.category !== "Video"
  ) return true;

  const { visibleSlotIds } = getTeamTemplateSlotConfigs(teamTemplateConfig);
  return visibleSlotIds.has(slotId);
}
