// Leadership notifications an admin can turn on or off per campus.
// Personal pushes (a roster reminder, a chat, a swap addressed to you)
// are not in this map, so they are never filtered here.

export const ADMIN_PUSH_CHANNEL_BY_TYPE: Record<string, string> = {
  "pending-approval": "setlist-approval",
  "feed-post": "feed-posts",
  "devo-live": "feed-posts",
  "setlist-confirmed": "setlist-confirmations",
  "swap-confirmed": "swaps",
  "swap-unanswered-gap": "swaps",
  "break-request": "break-requests",
  "gap-request": "gap-requests",
};

export type AdminPushPrefRow = {
  campusId: string;
  channel: string;
  enabled: boolean;
};

export function adminPushChannelForType(pushType: string): string | null {
  return ADMIN_PUSH_CHANNEL_BY_TYPE[pushType] ?? null;
}

/**
 * Missing rows mean "on" unless the person is explicit-only.
 * Explicit-only people receive a channel for a campus only when a row says so.
 * A push with no campus (the network feed) is allowed for them when any
 * campus has that channel turned on.
 */
export function allowsAdminPush(options: {
  explicitOnly: boolean;
  prefs: AdminPushPrefRow[];
  channel: string;
  campusIds: string[];
}): boolean {
  const channelPrefs = options.prefs.filter((pref) => pref.channel === options.channel);

  if (options.campusIds.length === 0) {
    if (options.explicitOnly) return channelPrefs.some((pref) => pref.enabled);
    return true;
  }

  return options.campusIds.some((campusId) => {
    const row = channelPrefs.find((pref) => pref.campusId === campusId);
    if (row) return row.enabled;
    return !options.explicitOnly;
  });
}
