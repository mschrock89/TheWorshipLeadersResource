-- Assignee DEVO post reminder: 5 days before scheduled go-live, not at go-live.

UPDATE public.push_notification_definitions
SET
  description = 'Reminder 5 days before the scheduled go-live time so the assignee can write their DEVO.',
  trigger_description = '5 days before scheduled go-live for a DEVO assignment (cron every 15 minutes)',
  title_template = 'Time to write {{chapter}}',
  body_template = 'Your {{chapter}} DEVO goes live {{post_day}} at {{post_time}}. Open DEVO to write your post — it publishes to The Feed at go-live. Need the how-to? Profile badge → DEVO.',
  deep_link_url = '/devo',
  updated_at = now()
WHERE key = 'devo-post-reminder';

NOTIFY pgrst, 'reload schema';
