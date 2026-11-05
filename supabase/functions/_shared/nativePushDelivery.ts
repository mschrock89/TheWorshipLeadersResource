type PushSubscriptionLike = {
  user_id: string;
  platform?: string | null;
  endpoint?: string | null;
};

/**
 * The native app and an iPhone home-screen web push both alert the same lock
 * screen. When a person has the native app, skip the Apple web push.
 */
export function omitAppleWebPushWhenNativeExists<T extends PushSubscriptionLike>(subscriptions: T[]): T[] {
  const nativeUserIds = new Set(
    subscriptions
      .filter((subscription) => subscription.platform === "ios" && subscription.user_id)
      .map((subscription) => subscription.user_id),
  );
  if (nativeUserIds.size === 0) return subscriptions;

  return subscriptions.filter((subscription) => {
    if (!nativeUserIds.has(subscription.user_id)) return true;
    return !String(subscription.endpoint || "").startsWith("https://web.push.apple.com/");
  });
}
