export const CHAT_MINISTRY_TYPES = [
  { value: "weekend", label: "Weekend" },
  { value: "encounter", label: "Encounter" },
  { value: "evident", label: "Evident" },
  { value: "eon", label: "EON" },
  { value: "production", label: "Production" },
  { value: "video", label: "Video" },
] as const;

const WEEKEND_CHAT_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);

export function normalizeChatMinistryType(ministryType: string | null | undefined) {
  if (!ministryType) return "weekend";
  return WEEKEND_CHAT_MINISTRY_ALIASES.has(ministryType) ? "weekend" : ministryType;
}

export function getUniqueNormalizedChatMinistries(ministryTypes: Array<string | null | undefined>) {
  return Array.from(new Set(ministryTypes.map((ministryType) => normalizeChatMinistryType(ministryType))));
}
