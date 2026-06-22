import {
  Star,
  Heart,
  Zap,
  Diamond,
  Users,
  Music,
  Mic,
  Flame,
  Sun,
  Crown,
  Sparkles,
  Guitar,
  type LucideIcon,
} from "lucide-react";

export interface TeamIconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

// Shared icon set used by both the team card display and the team editor so the
// two never drift out of sync.
export const TEAM_ICON_OPTIONS: TeamIconOption[] = [
  { value: "star", label: "Star", Icon: Star },
  { value: "heart", label: "Heart", Icon: Heart },
  { value: "zap", label: "Lightning", Icon: Zap },
  { value: "diamond", label: "Diamond", Icon: Diamond },
  { value: "users", label: "People", Icon: Users },
  { value: "music", label: "Music", Icon: Music },
  { value: "mic", label: "Microphone", Icon: Mic },
  { value: "flame", label: "Flame", Icon: Flame },
  { value: "sun", label: "Sun", Icon: Sun },
  { value: "crown", label: "Crown", Icon: Crown },
  { value: "sparkles", label: "Sparkles", Icon: Sparkles },
  { value: "guitar", label: "Guitar", Icon: Guitar },
];

const TEAM_ICON_MAP = new Map<string, LucideIcon>(
  TEAM_ICON_OPTIONS.map((option) => [option.value, option.Icon]),
);

export function getTeamIcon(icon: string | null | undefined): LucideIcon {
  return (icon && TEAM_ICON_MAP.get(icon)) || Star;
}

// Curated palette for the team color picker. A free-form hex input is also
// available, but these cover the existing team colors.
export const TEAM_COLOR_PRESETS = [
  "#3B82F6",
  "#0EA5E9",
  "#38BDF8",
  "#22C55E",
  "#16A34A",
  "#EAB308",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
  "#6366F1",
  "#14B8A6",
  "#64748B",
];
