import type { ResourceAppKey } from "@/lib/constants";
import { isStudentResourceAppKey } from "@/lib/resourceApp";

export const WORSHIP_CHAT_MINISTRY_TYPES = [
  { value: "weekend", label: "Weekend" },
  { value: "kids_camp", label: "Kids Camp" },
  { value: "encounter", label: "HS Worship" },
  { value: "evident", label: "Evident" },
  { value: "eon", label: "MS Worship" },
  { value: "production", label: "Production" },
  { value: "video", label: "Video" },
] as const;

export const STUDENT_CHAT_MINISTRY_TYPES = [
  { value: "student_camp", label: "Camp Chat" },
  { value: "leader_chat", label: "Leader Chat" },
  { value: "student_leader_chat", label: "Student Leader Chat" },
  { value: "small_group_1", label: "Small Group 1" },
  { value: "small_group_2", label: "Small Group 2" },
  { value: "small_group_3", label: "Small Group 3" },
  { value: "small_group_4", label: "Small Group 4" },
  { value: "small_group_5", label: "Small Group 5" },
  { value: "small_group_6", label: "Small Group 6" },
  { value: "small_group_7", label: "Small Group 7" },
  { value: "small_group_8", label: "Small Group 8" },
] as const;

export const CHAT_MINISTRY_TYPES = WORSHIP_CHAT_MINISTRY_TYPES;

const WEEKEND_CHAT_MINISTRY_ALIASES = new Set(["weekend", "weekend_team", "sunday_am"]);
const STUDENT_CHAT_MINISTRY_VALUES = new Set<string>(STUDENT_CHAT_MINISTRY_TYPES.map((chat) => chat.value));
const CHAT_MINISTRY_LABELS = new Map<string, string>(
  [...WORSHIP_CHAT_MINISTRY_TYPES, ...STUDENT_CHAT_MINISTRY_TYPES].map((chat) => [chat.value, chat.label]),
);

export function normalizeChatMinistryType(ministryType: string | null | undefined) {
  if (!ministryType) return "weekend";
  return WEEKEND_CHAT_MINISTRY_ALIASES.has(ministryType) ? "weekend" : ministryType;
}

export function getUniqueNormalizedChatMinistries(ministryTypes: Array<string | null | undefined>) {
  return Array.from(new Set(ministryTypes.map((ministryType) => normalizeChatMinistryType(ministryType))));
}

export function getChatMinistryTypesForResourceApp(resourceAppKey: ResourceAppKey | string) {
  return isStudentResourceAppKey(resourceAppKey) ? STUDENT_CHAT_MINISTRY_TYPES : WORSHIP_CHAT_MINISTRY_TYPES;
}

export function getDefaultChatMinistryTypeForResourceApp(resourceAppKey: ResourceAppKey | string) {
  return getChatMinistryTypesForResourceApp(resourceAppKey)[0].value;
}

export function getChatMinistryLabel(ministryType: string | null | undefined) {
  const normalized = normalizeChatMinistryType(ministryType);
  return CHAT_MINISTRY_LABELS.get(normalized) || normalized;
}

export function isStudentChatMinistryType(ministryType: string | null | undefined) {
  return STUDENT_CHAT_MINISTRY_VALUES.has(normalizeChatMinistryType(ministryType));
}
