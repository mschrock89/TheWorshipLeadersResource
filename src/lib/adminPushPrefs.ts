export const ADMIN_PUSH_PROFILE_ROLES = [
  "admin",
  "campus_admin",
  "campus_pastor",
  "campus_worship_pastor",
  "production_manager",
  "video_director",
  "network_worship_pastor",
  "network_worship_leader",
  "network_student_pastor",
  "student_pastor",
  "student_worship_pastor",
  "childrens_pastor",
] as const;

export function profileUsesAdminPushPreferences(roles: string[]) {
  return roles.some((role) =>
    (ADMIN_PUSH_PROFILE_ROLES as readonly string[]).includes(role),
  );
}

export const ADMIN_PUSH_GROUPS = [
  {
    label: "Setlists",
    channels: [
      { key: "setlist-approval", label: "Submitted for approval" },
      { key: "setlist-confirmations", label: "Confirmations" },
    ],
  },
  {
    label: "Swaps",
    channels: [{ key: "swaps", label: "Leader swap notices" }],
  },
  {
    label: "Team",
    channels: [
      { key: "break-requests", label: "Break requests" },
      { key: "gap-requests", label: "Gap requests" },
    ],
  },
  {
    label: "Feed",
    channels: [{ key: "feed-posts", label: "Feed posts" }],
  },
] as const;

export type AdminPushChannel = (typeof ADMIN_PUSH_GROUPS)[number]["channels"][number]["key"];

export function adminPushChannelEnabled(options: {
  explicitOnly: boolean;
  enabled: boolean | null;
}) {
  if (options.enabled === null) return !options.explicitOnly;
  return options.enabled;
}
