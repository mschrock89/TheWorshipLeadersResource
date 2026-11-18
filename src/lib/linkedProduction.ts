/**
 * Worship views that schedule a production crew on its own ministry, the same
 * way Weekend Worship schedules Production. The ministries stay separate:
 * rosters, team assignments, and schedule rows never cross families.
 */
export interface LinkedProductionFamily {
  worshipView: string;
  worshipTypes: readonly string[];
  productionType: string;
  videoType: string | null;
  speakerType: string | null;
  /** Setlists and songs belong to the worship ministry, not the production crew. */
  songMinistry: string;
}

export const LINKED_PRODUCTION_FAMILIES: readonly LinkedProductionFamily[] = [
  {
    worshipView: "weekend_team",
    worshipTypes: ["weekend", "weekend_team", "sunday_am"],
    productionType: "production",
    videoType: "video",
    speakerType: "speaker",
    songMinistry: "weekend",
  },
  {
    worshipView: "ms_hs",
    worshipTypes: ["ms_hs"],
    productionType: "ms_hs_production",
    videoType: null,
    speakerType: null,
    songMinistry: "ms_hs",
  },
  {
    worshipView: "encounter",
    worshipTypes: ["encounter"],
    productionType: "hs_production",
    videoType: null,
    speakerType: null,
    songMinistry: "encounter",
  },
];

const WEEKEND_WORSHIP_TEAM_OPTIONS = [
  "Team 1",
  "Team 2",
  "Team 3",
  "Team 4",
  "Simple Worship",
  "5th Sunday",
] as const;

/** Team cards Weekend Worship can schedule. Student worship and production use the same list. */
export const WEEKEND_WORSHIP_TEAM_NAMES: readonly string[] = WEEKEND_WORSHIP_TEAM_OPTIONS;

export function linkedProductionFamily(
  ministryType: string | null | undefined,
): LinkedProductionFamily | null {
  if (!ministryType) return null;
  return (
    LINKED_PRODUCTION_FAMILIES.find(
      (family) =>
        family.worshipView === ministryType ||
        family.worshipTypes.includes(ministryType) ||
        family.productionType === ministryType ||
        family.videoType === ministryType ||
        family.speakerType === ministryType,
    ) ?? null
  );
}

export function isSeparateProductionMinistry(ministryType: string | null | undefined): boolean {
  return LINKED_PRODUCTION_FAMILIES.some((family) => family.productionType === ministryType);
}

/**
 * Schedule rows that should highlight together. Worship views include their
 * production crew. Production views include the worship dates they serve.
 * Other ministries return null and match themselves.
 */
export function calendarLinkedMinistries(ministryFilter: string): readonly string[] | null {
  const family = linkedProductionFamily(ministryFilter);
  if (!family) return null;

  const support = [
    family.productionType,
    ...(family.videoType ? [family.videoType] : []),
    ...(family.speakerType ? [family.speakerType] : []),
  ];

  if (ministryFilter === family.worshipView || family.worshipTypes.includes(ministryFilter)) {
    return [...family.worshipTypes, ...support];
  }

  if (ministryFilter === family.productionType) {
    return [...family.worshipTypes, family.productionType];
  }

  if (family.videoType && ministryFilter === family.videoType) {
    return [...family.worshipTypes, family.videoType];
  }

  return null;
}

/** Custom services stored under the worship ministry, plus that family's production crew. */
export function customServiceMinistriesForFilter(ministryFilter: string): string[] | null {
  const linked = calendarLinkedMinistries(ministryFilter);
  if (!linked) return null;
  return linked.filter(
    (ministry) => ministry !== "speaker" && ministry !== "weekend_team" && ministry !== "sunday_am",
  );
}

/**
 * Production and video calendars read the worship setlist. Worship filters
 * already are the setlist ministry, except Weekend Worship's combined view.
 */
export function worshipSetlistMinistry(ministryType: string | null | undefined): string | null {
  if (!ministryType) return null;
  const family = linkedProductionFamily(ministryType);
  if (!family) return ministryType;
  if (ministryType === family.productionType || ministryType === family.videoType) {
    return family.songMinistry;
  }
  return ministryType;
}
