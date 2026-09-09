-- Native iOS app support: push_subscriptions rows can now be APNs device
-- tokens (platform = 'ios', device_token set, endpoint = 'apns:<token>')
-- alongside the existing web push rows (platform = 'web').
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_token TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform
  ON public.push_subscriptions (platform);
