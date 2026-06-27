import { POSITION_SLOTS, normalizeSessionSetMinistryType } from "@/lib/constants";

// Student Camp teams expose only these production positions (FOH, MON, Lyrics) so the
// camp's production crew can be assigned on the team itself rather than a separate
// Production team. "propresenter" is the Lyrics slot.
const STUDENT_CAMP_PRODUCTION_SLOT_IDS = ["foh", "mon", "propresenter"];

function isStudentCampTemplateContext(context?: TeamTemplateContext | null) {
  const base = normalizeSessionSetMinistryType(context?.ministryType) ?? context?.ministryType;
  return base === "student_camp";
}

export type VocalSlotGender = "male" | "female";
export interface TeamTemplateContext {
  campusName?: string | null;
  ministryType?: string | null;
}

export interface TeamTemplateConfig {
  vocalSlots?: Array<{
    slot: string;
    gender: VocalSlotGender;
  }>;
  bandSlots?: string[];
  productionSlots?: string[];
  videoSlots?: string[];
}

const DEFAULT_VOCAL_SLOT_IDS = ["vocalist_1", "vocalist_2", "vocalist_3", "vocalist_4"] as const;
const EXTENDED_VOCAL_SLOT_IDS = [
  ...DEFAULT_VOCAL_SLOT_IDS,
  "vocalist_5",
  "vocalist_6",
  "vocalist_7",
  "vocalist_8",
] as const;

const DEFAULT_VOCAL_SLOTS: TeamTemplateConfig["vocalSlots"] = [
  { slot: "vocalist_1", gender: "male" },
  { slot: "vocalist_2", gender: "male" },
  { slot: "vocalist_3", gender: "female" },
  { slot: "vocalist_4", gender: "female" },
];
const MURFREESBORO_CENTRAL_WORSHIP_NIGHT_VOCAL_SLOTS: TeamTemplateConfig["vocalSlots"] = [
  { slot: "vocalist_1", gender: "male" },
  { slot: "vocalist_2", gender: "male" },
  { slot: "vocalist_3", gender: "female" },
  { slot: "vocalist_4", gender: "female" },
  { slot: "vocalist_5", gender: "male" },
  { slot: "vocalist_6", gender: "male" },
  { slot: "vocalist_7", gender: "female" },
  { slot: "vocalist_8", gender: "female" },
];

const DEFAULT_BAND_SLOTS = ["drums", "bass", "keys", "eg_1", "eg_2", "ag_1", "ag_2"];
const EXTENDED_BAND_SLOTS = [...DEFAULT_BAND_SLOTS, "pad", "eg_3", "eg_4"];
const MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_SLOTS = [
  "drums",
  "bass",
  "keys",
  "eg_1",
  "eg_2",
  "eg_3",
  "ag_1",
  "ag_2",
  "pad",
] as const;
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
const VALID_BAND_SLOTS = new Set(EXTENDED_BAND_SLOTS);
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

export function isMurfreesboroCentralWorshipNightTemplateContext(context?: TeamTemplateContext | null) {
  return (
    context?.ministryType === "worship_night" &&
    context?.campusName === "Murfreesboro Central"
  );
}

function usesGenderedVocalSlots(context?: TeamTemplateContext | null) {
  return context?.ministryType !== "kids_camp";
}

export function getSupportedVocalSlotIds(context?: TeamTemplateContext | null) {
  return isMurfreesboroCentralWorshipNightTemplateContext(context)
    ? EXTENDED_VOCAL_SLOT_IDS
    : DEFAULT_VOCAL_SLOT_IDS;
}

function getDefaultVocalSlotsForContext(context?: TeamTemplateContext | null) {
  return isMurfreesboroCentralWorshipNightTemplateContext(context)
    ? MURFREESBORO_CENTRAL_WORSHIP_NIGHT_VOCAL_SLOTS
    : DEFAULT_VOCAL_SLOTS;
}

function getDefaultBandSlotsForContext(context?: TeamTemplateContext | null) {
  return isMurfreesboroCentralWorshipNightTemplateContext(context)
    ? [...MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_SLOTS]
    : DEFAULT_BAND_SLOTS;
}

function orderBandSlotsForContext(slots: string[], context?: TeamTemplateContext | null) {
  const orderedBandSlots = isMurfreesboroCentralWorshipNightTemplateContext(context)
    ? MURFREESBORO_CENTRAL_WORSHIP_NIGHT_BAND_SLOTS
    : EXTENDED_BAND_SLOTS;

  return orderedBandSlots.filter((slot) => slots.includes(slot));
}

export function normalizeTeamTemplateConfig(
  config: TeamTemplateConfig | null | undefined,
  context?: TeamTemplateContext | null,
): Required<TeamTemplateConfig> {
  const validVocalSlots = new Set(getSupportedVocalSlotIds(context));
  const normalizedVocalSlots = Array.isArray(config?.vocalSlots)
    ? config.vocalSlots
        .filter(
          (slot): slot is { slot: string; gender: VocalSlotGender } =>
            !!slot &&
            validVocalSlots.has(slot.slot as (typeof EXTENDED_VOCAL_SLOT_IDS)[number]) &&
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
    vocalSlots:
      normalizedVocalSlots.length > 0 ? normalizedVocalSlots : getDefaultVocalSlotsForContext(context),
    bandSlots:
      normalizedBandSlots.length > 0
        ? orderBandSlotsForContext(normalizedBandSlots, context)
        : getDefaultBandSlotsForContext(context),
    productionSlots:
      normalizedProductionSlots.length > 0
        ? normalizedProductionSlots
        : DEFAULT_TEAM_TEMPLATE.productionSlots,
    videoSlots: normalizedVideoSlots.length > 0 ? normalizedVideoSlots : DEFAULT_TEAM_TEMPLATE.videoSlots,
  };
}

export function getTeamTemplateSlotConfigs(
  teamTemplateConfig: TeamTemplateConfig | null | undefined,
  context?: TeamTemplateContext | null,
) {
  const template = normalizeTeamTemplateConfig(teamTemplateConfig, context);
  const vocalGenderCounts: Record<VocalSlotGender, number> = { male: 0, female: 0 };

  const vocalSlots = template.vocalSlots
    .map((templateSlot) => {
      const slotConfig = POSITION_SLOTS.find((slot) => slot.slot === templateSlot.slot);
      if (!slotConfig) return null;

      vocalGenderCounts[templateSlot.gender] += 1;
      const genderedLabel = `${templateSlot.gender === "male" ? "Male" : "Female"} Vocal ${vocalGenderCounts[templateSlot.gender]}`;

      return {
        ...slotConfig,
        label: usesGenderedVocalSlots(context) ? genderedLabel : slotConfig.label,
        vocalGender: usesGenderedVocalSlots(context) ? templateSlot.gender : null,
      };
    })
    .filter(
      (
        slot,
      ): slot is (typeof POSITION_SLOTS)[number] & {
        vocalGender: VocalSlotGender | null;
      } => Boolean(slot),
    );

  const bandSlots = template.bandSlots
    .map((slotId) => POSITION_SLOTS.find((slot) => slot.slot === slotId))
    .filter((slot): slot is (typeof POSITION_SLOTS)[number] => Boolean(slot));
  // Student Camp surfaces a fixed set of production slots (FOH, MON, Lyrics) regardless of
  // the team's stored template, since the same team is shared across ministries and we do
  // not want to mutate its weekend production config.
  const productionSlotIds = isStudentCampTemplateContext(context)
    ? STUDENT_CAMP_PRODUCTION_SLOT_IDS
    : template.productionSlots;
  const productionSlots = productionSlotIds
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
  context?: TeamTemplateContext | null,
): VocalSlotGender | null {
  if (!usesGenderedVocalSlots(context)) {
    return null;
  }

  const template = normalizeTeamTemplateConfig(teamTemplateConfig, context);
  return template.vocalSlots.find((slot) => slot.slot === slotId)?.gender || null;
}

export function isTeamSlotVisible(
  teamTemplateConfig: TeamTemplateConfig | null | undefined,
  slotId: string,
  context?: TeamTemplateContext | null,
) {
  const slotConfig = POSITION_SLOTS.find((slot) => slot.slot === slotId);
  if (!slotConfig) return false;
  if (
    slotConfig.category !== "Vocalists" &&
    slotConfig.category !== "Band" &&
    slotConfig.category !== "Production" &&
    slotConfig.category !== "Video"
  ) return true;

  const { visibleSlotIds } = getTeamTemplateSlotConfigs(teamTemplateConfig, context);
  return visibleSlotIds.has(slotId);
}
