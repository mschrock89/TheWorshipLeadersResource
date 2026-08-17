import { format, parseISO } from "date-fns";
import type { TeamMemberAssignment, WorshipTeam } from "@/hooks/useTeamBuilder";
import {
  MINISTRY_TYPES,
  POSITION_SLOTS,
  getTeamBuilderSlotCategories,
  memberMatchesMinistryFilter,
} from "@/lib/constants";
import { isBlankTeamBuilderAssignment } from "@/lib/teamBuilderBlankSlot";
import { getTeamTemplateSlotConfigs } from "@/lib/teamTemplates";
import {
  formatWeekendGroupDateLabelCompact,
  getWeekendPairDate,
  isWeekend,
  type CampusWeekendServiceConfig,
} from "@/lib/utils";

export interface TeamScheduleExportCellOverride {
  dateLabel: string;
  memberName: string;
}

export interface TeamScheduleExportCell {
  memberName: string | null;
  isEmpty: boolean;
  isBlank: boolean;
  notUsed: boolean;
  overrides: TeamScheduleExportCellOverride[];
}

export interface TeamScheduleExportRow {
  slot: string;
  label: string;
  cells: TeamScheduleExportCell[];
}

export interface TeamScheduleExportSection {
  title: string;
  rows: TeamScheduleExportRow[];
}

export interface TeamScheduleExportTeam {
  key: string;
  name: string;
  color: string;
  scheduleDates: string[];
}

export interface TeamScheduleExportDocument {
  title: string;
  campusName: string;
  ministryLabel: string;
  periodName: string;
  periodRange: string | null;
  generatedLabel: string;
  teams: TeamScheduleExportTeam[];
  sections: TeamScheduleExportSection[];
}

export interface TeamScheduleExportCardInput {
  key: string;
  team: WorshipTeam;
  title: string;
  members: TeamMemberAssignment[];
  slotScheduleDates: string[];
  slotDateOverrides: Record<string, Record<string, TeamMemberAssignment>>;
}

interface SlotConfig {
  slot: string;
  label: string;
}

interface SlotGroup {
  title: string;
  slots: SlotConfig[];
}

function formatDateRange(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return null;

  try {
    return `${format(parseISO(startDate), "MMM d")} – ${format(parseISO(endDate), "MMM d, yyyy")}`;
  } catch {
    return null;
  }
}

function shouldCollapseWeekendBuckets(ministryType: string) {
  return ministryType !== "video" && ministryType !== "eon_weekend";
}

export function formatScheduleBucketLabel(
  bucketKey: string,
  campus?: CampusWeekendServiceConfig | null,
  ministryType?: string,
) {
  try {
    if (shouldCollapseWeekendBuckets(ministryType || "") && isWeekend(bucketKey)) {
      const sunday = getWeekendPairDate(bucketKey);
      if (sunday) {
        return formatWeekendGroupDateLabelCompact(bucketKey, sunday, campus);
      }
    }

    return format(parseISO(bucketKey), "MMM d");
  } catch {
    return bucketKey;
  }
}

function getMinistryLabel(ministryType: string) {
  return MINISTRY_TYPES.find((ministry) => ministry.value === ministryType)?.label || ministryType;
}

function getMemberForSlot(members: TeamMemberAssignment[], slot: string) {
  const slotMembers = members.filter((member) => member.position_slot === slot);
  if (slotMembers.length === 0) return undefined;
  if (slotMembers.length === 1) return slotMembers[0];

  return slotMembers.sort((a, b) => a.display_order - b.display_order)[0];
}

function displayMemberName(assignment?: TeamMemberAssignment | null) {
  if (!assignment) return null;
  if (isBlankTeamBuilderAssignment(assignment)) return null;
  const name = assignment.member_name?.trim();
  return name ? name : null;
}

function getSlotGroupsForTeam(
  team: WorshipTeam,
  ministryType: string,
  campusName?: string | null,
): SlotGroup[] {
  const allowedCategories = getTeamBuilderSlotCategories(ministryType);
  const templateSlots = getTeamTemplateSlotConfigs(team.template_config, {
    campusName,
    ministryType,
  });

  const groups: SlotGroup[] = [];

  const pushGroup = (title: string, slots: SlotConfig[]) => {
    if (slots.length === 0) return;
    groups.push({ title, slots });
  };

  if (allowedCategories.includes("Pastors")) {
    pushGroup(
      "Pastors",
      POSITION_SLOTS.filter((slot) => slot.category === "Pastors"),
    );
  }

  if (allowedCategories.includes("Vocalists")) {
    pushGroup("Vocalists", templateSlots.vocalSlots);
  }

  if (allowedCategories.includes("Band")) {
    pushGroup("Band", templateSlots.bandSlots);
  }

  if (allowedCategories.includes("Speaker")) {
    pushGroup(
      "Speaker",
      POSITION_SLOTS.filter((slot) => slot.category === "Speaker"),
    );
  }

  if (allowedCategories.includes("Students")) {
    pushGroup(
      "Team",
      POSITION_SLOTS.filter((slot) => slot.category === "Students"),
    );
  }

  if (allowedCategories.includes("Production")) {
    pushGroup("Production", templateSlots.productionSlots);
  }

  if (allowedCategories.includes("Video")) {
    pushGroup("Video", templateSlots.videoSlots);
  }

  if (allowedCategories.includes("Creative")) {
    pushGroup(
      "Creative",
      POSITION_SLOTS.filter((slot) => slot.category === "Creative"),
    );
  }

  return groups;
}

function unionSlotGroups(teamGroups: SlotGroup[][]) {
  const sectionOrder: string[] = [];
  const slotsBySection = new Map<string, SlotConfig[]>();

  teamGroups.forEach((groups) => {
    groups.forEach((group) => {
      if (!slotsBySection.has(group.title)) {
        sectionOrder.push(group.title);
        slotsBySection.set(group.title, []);
      }

      const existing = slotsBySection.get(group.title)!;
      const existingSlots = new Set(existing.map((slot) => slot.slot));

      group.slots.forEach((slot) => {
        if (existingSlots.has(slot.slot)) return;
        existing.push({ slot: slot.slot, label: slot.label });
        existingSlots.add(slot.slot);
      });
    });
  });

  return sectionOrder.map((title) => ({
    title,
    slots: slotsBySection.get(title) || [],
  }));
}

function buildCell(input: {
  slot: string;
  usedSlots: Set<string>;
  members: TeamMemberAssignment[];
  slotScheduleDates: string[];
  slotDateOverrides: Record<string, TeamMemberAssignment>;
  campus?: CampusWeekendServiceConfig | null;
  ministryType: string;
}): TeamScheduleExportCell {
  if (!input.usedSlots.has(input.slot)) {
    return {
      memberName: null,
      isEmpty: true,
      isBlank: false,
      notUsed: true,
      overrides: [],
    };
  }

  const member = getMemberForSlot(input.members, input.slot);
  const isBlank = isBlankTeamBuilderAssignment(member);
  const memberName = displayMemberName(member);
  const overrideDates = Array.from(
    new Set([
      ...input.slotScheduleDates,
      ...Object.keys(input.slotDateOverrides),
    ]),
  ).sort();

  const overrides = overrideDates.flatMap((dateKey) => {
    const override = input.slotDateOverrides[dateKey];
    if (!override) return [];

    const overrideIsBlank = isBlankTeamBuilderAssignment(override);
    const overrideName = displayMemberName(override);

    if (!overrideIsBlank && overrideName && overrideName === memberName) {
      return [];
    }

    return [
      {
        dateLabel: formatScheduleBucketLabel(dateKey, input.campus, input.ministryType),
        memberName: overrideIsBlank || !overrideName ? "Open" : overrideName,
      },
    ];
  });

  return {
    memberName,
    isEmpty: !memberName && !isBlank && overrides.length === 0,
    isBlank,
    notUsed: false,
    overrides,
  };
}

export function buildTeamScheduleExportDocument(input: {
  campusName: string;
  campus?: CampusWeekendServiceConfig | null;
  ministryType: string;
  periodName: string;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  cards: TeamScheduleExportCardInput[];
}): TeamScheduleExportDocument {
  const ministryLabel = getMinistryLabel(input.ministryType);
  const periodName = input.periodName || "Rotation";
  const campusName = input.campusName || "Campus";

  const preparedCards = input.cards.map((card) => {
    const members = card.members.filter((member) =>
      memberMatchesMinistryFilter(member.ministry_types, input.ministryType),
    );
    const groups = getSlotGroupsForTeam(card.team, input.ministryType, campusName);

    return {
      ...card,
      members,
      groups,
      usedSlots: new Set(groups.flatMap((group) => group.slots.map((slot) => slot.slot))),
      scheduleDates: card.slotScheduleDates.map((dateKey) =>
        formatScheduleBucketLabel(dateKey, input.campus, input.ministryType),
      ),
    };
  });

  const sections = unionSlotGroups(preparedCards.map((card) => card.groups)).map((group) => ({
    title: group.title,
    rows: group.slots.map((slot) => ({
      slot: slot.slot,
      label: slot.label,
      cells: preparedCards.map((card) =>
        buildCell({
          slot: slot.slot,
          usedSlots: card.usedSlots,
          members: card.members,
          slotScheduleDates: card.slotScheduleDates,
          slotDateOverrides: card.slotDateOverrides[slot.slot] || {},
          campus: input.campus,
          ministryType: input.ministryType,
        }),
      ),
    })),
  }));

  return {
    title: `${campusName} ${ministryLabel} · ${periodName}`,
    campusName,
    ministryLabel,
    periodName,
    periodRange: formatDateRange(input.periodStartDate, input.periodEndDate),
    generatedLabel: format(new Date(), "MMM d, yyyy"),
    teams: preparedCards.map((card) => ({
      key: card.key,
      name: card.title,
      color: card.team.color,
      scheduleDates: card.scheduleDates,
    })),
    sections,
  };
}
