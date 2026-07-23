import { MINISTRY_TYPES } from "@/lib/constants";
import type { ServiceFlowItem } from "@/hooks/useServiceFlow";
import type { Service, ServiceItem, ServiceSection } from "./ServiceFlow";
import { formatTotalDuration } from "./DurationInput";

function isAnnouncementsContext(title: string, sectionTitle: string) {
  const compact = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, "");

  const compactTitle = compact(title);
  const compactSectionTitle = compact(sectionTitle);
  return (
    compactSectionTitle.includes("announcement") ||
    compactSectionTitle.includes("anncouncement") ||
    compactSectionTitle.includes("annoucement") ||
    compactTitle.includes("announcement") ||
    compactTitle.includes("anncouncement") ||
    compactTitle.includes("annoucement")
  );
}

function isLessonContext(title: string, sectionTitle: string) {
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ");

  const normalizedTitle = normalize(title);
  const normalizedSectionTitle = normalize(sectionTitle);
  return (
    normalizedSectionTitle.includes("lesson") ||
    normalizedSectionTitle.includes("message") ||
    normalizedSectionTitle.includes("sermon") ||
    normalizedSectionTitle.includes("teaching") ||
    normalizedTitle.includes("lesson") ||
    normalizedTitle.includes("teacher") ||
    normalizedTitle.includes("message") ||
    normalizedTitle.includes("sermon")
  );
}

function inferItemType(
  item: ServiceFlowItem,
  sectionTitle: string,
): ServiceItem["type"] {
  if (item.item_type === "song") return "song";

  const title = item.title.toLowerCase();
  if (title.includes("video")) return "video";

  if (
    isLessonContext(item.title, sectionTitle) ||
    isAnnouncementsContext(item.title, sectionTitle) ||
    title.includes("message") ||
    title.includes("sermon") ||
    title.includes("teaching") ||
    title.includes("speaker") ||
    title.includes("welcome") ||
    title.includes("host")
  ) {
    return "speaker";
  }

  if (title.includes("announcement")) return "announcement";
  return "other";
}

function formatItemDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "TBD";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatLeader(item: ServiceFlowItem) {
  if (item.vocalists && item.vocalists.length > 0) {
    return item.vocalists
      .map((vocalist) => vocalist.full_name || "")
      .filter(Boolean)
      .join(", ");
  }
  return item.vocalist?.full_name || undefined;
}

export function buildServiceFlowHref(params: {
  date: string;
  campusId?: string | null;
  ministryType?: string | null;
  draftSetId?: string | null;
  customServiceId?: string | null;
}) {
  const search = new URLSearchParams();
  search.set("date", params.date);
  if (params.campusId) search.set("campus", params.campusId);
  if (params.ministryType) search.set("ministry", params.ministryType);
  if (params.draftSetId) search.set("draftSetId", params.draftSetId);
  if (params.customServiceId) search.set("customServiceId", params.customServiceId);
  return `/service-flow?${search.toString()}`;
}

export function buildServiceFlowPreview(params: {
  items: ServiceFlowItem[];
  serviceDate: string;
  campusName?: string | null;
  ministryType?: string | null;
  title?: string | null;
  clockTimesByItemId?: Map<string, string>;
  resolveTitle?: (item: ServiceFlowItem, sectionTitle: string) => string;
}): Service {
  const ministryLabel =
    MINISTRY_TYPES.find((option) => option.value === params.ministryType)?.label ||
    "Service";

  const sections: ServiceSection[] = [];
  let currentSection: ServiceSection | null = null;

  const ensureSection = () => {
    if (!currentSection) {
      currentSection = {
        id: "section-overview",
        title: "Service",
        items: [],
      };
      sections.push(currentSection);
    }
    return currentSection;
  };

  let totalDuration = 0;

  for (const item of params.items) {
    if (item.item_type === "header") {
      currentSection = {
        id: item.id,
        title: item.title,
        items: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (item.duration_seconds && item.duration_seconds > 0) {
      totalDuration += item.duration_seconds;
    }

    const sectionTitle = currentSection?.title || "";
    ensureSection().items.push({
      id: item.id,
      title: params.resolveTitle
        ? params.resolveTitle(item, sectionTitle)
        : item.song?.title || item.title,
      type: inferItemType(item, sectionTitle),
      duration: formatItemDuration(item.duration_seconds),
      clockTime: params.clockTimesByItemId?.get(item.id),
      bpm: item.song?.bpm || undefined,
      key: item.song_key || undefined,
      leader: formatLeader(item),
    });
  }

  return {
    title:
      params.title?.trim() ||
      [params.campusName, ministryLabel].filter(Boolean).join(" ") ||
      "Service Flow",
    date: params.serviceDate,
    totalTime: formatTotalDuration(totalDuration),
    sections: sections.filter((section) => section.items.length > 0),
  };
}
