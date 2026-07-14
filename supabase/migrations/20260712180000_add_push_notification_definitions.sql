-- Push notification definitions: editable catalog of every push type.
-- Admins manage copy, enable/disable, and add new types from the UI.
-- send-push-notification reads this table by context_type / key.

CREATE TABLE public.push_notification_definitions (
  key                     TEXT PRIMARY KEY,
  label                   TEXT NOT NULL,
  category                TEXT NOT NULL,
  description             TEXT,
  trigger_description     TEXT,
  recipients_description  TEXT,
  title_template          TEXT NOT NULL,
  body_template           TEXT NOT NULL,
  deep_link_url           TEXT,
  template_variables      TEXT[] NOT NULL DEFAULT '{}',
  enabled                 BOOLEAN NOT NULL DEFAULT true,
  content_from_db         BOOLEAN NOT NULL DEFAULT false,
  is_system               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INTEGER NOT NULL DEFAULT 100,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_notification_definitions_category_idx
  ON public.push_notification_definitions (category, sort_order, label);

ALTER TABLE public.push_notification_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read push notification definitions"
  ON public.push_notification_definitions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage push notification definitions"
  ON public.push_notification_definitions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.set_push_notification_definitions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_notification_definitions_updated_at
  BEFORE UPDATE ON public.push_notification_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_push_notification_definitions_updated_at();

-- Seed current production push types (content_from_db = false so live copy
-- stays with existing edge/SQL callers until an admin opts in).
INSERT INTO public.push_notification_definitions (
  key, label, category, description, trigger_description, recipients_description,
  title_template, body_template, deep_link_url, template_variables, sort_order
) VALUES
-- Setlists
(
  'setlist-published',
  'Setlist Posted',
  'Setlists',
  'Sent when a setlist is published for a weekend.',
  'Publishing a setlist (Set Planner / Calendar / Approvals)',
  'Everyone on the setlist roster for that date and campus',
  'Setlist Posted',
  '{{song_count}} songs for {{date}} at {{campus}}',
  '/my-setlists?setId={{set_id}}',
  ARRAY['song_count', 'date', 'campus', 'set_id'],
  10
),
(
  'setlist-manual-reminder',
  'Setlist Posted (Manual Reminder)',
  'Setlists',
  'Manual reminder that a setlist is posted.',
  'Admin/leader sends a manual setlist reminder',
  'Setlist roster for that date and campus',
  'Setlist Posted',
  'The setlist for {{date}} at {{campus}} is posted.',
  '/my-setlists?setId={{set_id}}',
  ARRAY['date', 'campus', 'set_id'],
  20
),
(
  'setlist-confirmed',
  'Setlist Confirmed',
  'Setlists',
  'Sent when a team member confirms they reviewed the setlist.',
  'Someone taps Confirm on a setlist',
  'Campus and global admins',
  'Setlist Confirmed',
  '{{name}} reviewed the {{date}} {{campus}} setlist',
  '/my-setlists?setId={{set_id}}',
  ARRAY['name', 'date', 'campus', 'set_id'],
  30
),
(
  'weekend-track-uploaded',
  'Weekend Tracks Uploaded',
  'Setlists',
  'Sent when a weekend reference track is uploaded.',
  'Uploader opts in while adding a weekend track',
  'Setlist roster (except the uploader)',
  'Weekend Tracks Uploaded',
  '"{{track_title}}" was added for {{date}} at {{campus}}.',
  '/my-setlists?setId={{set_id}}',
  ARRAY['track_title', 'date', 'campus', 'set_id'],
  40
),

-- Schedule
(
  'schedule-reminder',
  'Serving Reminder',
  'Schedule',
  'Saturday morning reminder for people serving this weekend.',
  'Cron: Saturday 8:00 AM America/Chicago',
  'Anyone on the worship roster for Saturday or Sunday',
  '🎵 You''re Serving {{day_word_title}}!',
  'You''re on {{positions}} for {{teams}} {{day_word}}. See you at church!',
  '/calendar',
  ARRAY['day_word', 'day_word_title', 'positions', 'teams'],
  50
),
(
  'video-schedule-reminder',
  'Video Team Reminder',
  'Schedule',
  'Heads-up for video team members 10 days before they serve.',
  'Cron: daily 9:00 AM America/Chicago (10 days out)',
  'Video roster members scheduled on the target date',
  'Video Team Reminder',
  'Heads up — you''re on the Video team in 10 days ({{date}}). Open Calendar to view details.',
  '/calendar',
  ARRAY['date'],
  60
),
(
  'team-schedule-date',
  'Production / Video Schedule Date',
  'Schedule',
  'Manual schedule confirmation push for Production or Video teams.',
  'Leader sends from Calendar for a support-team date',
  'Scheduled Production or Video team members',
  '{{team}} Production/Video — {{date_range}}',
  'You''re scheduled to serve with {{team}} {{ministry}} on {{dates}}. Confirm here.',
  '/my-setlists?setId={{set_id}}&confirm=1',
  ARRAY['team', 'ministry', 'date_range', 'dates', 'set_id'],
  70
),

-- Swaps
(
  'swap-request',
  'Swap / Cover Request',
  'Swaps',
  'Sent when someone requests a cover or swap.',
  'Creating a swap or cover request',
  'Target person (direct) or same position group (open request)',
  '{{request_label}}',
  '{{requester}} asked you to cover {{position}} on {{date}} for {{team}}',
  '/swaps',
  ARRAY['request_label', 'requester', 'position', 'date', 'team'],
  80
),
(
  'swap-request-sent',
  'Swap Request Sent',
  'Swaps',
  'Confirmation to the person who opened the request.',
  'After a swap/cover request is created',
  'The requester',
  'Swap Request Sent',
  'Your cover/swap request was sent.',
  '/swaps',
  ARRAY[]::TEXT[],
  90
),
(
  'swap-accepted',
  'Swap Accepted',
  'Swaps',
  'Sent to the requester when their request is accepted.',
  'Swap request status changes to accepted',
  'Original requester',
  'Swap Accepted',
  '{{accepter}} will cover your date on {{date}}',
  '/swaps',
  ARRAY['accepter', 'date'],
  100
),
(
  'swap-declined',
  'Swap Declined',
  'Swaps',
  'Sent to the requester when their request is declined.',
  'Swap request status changes to declined',
  'Original requester',
  'Swap Declined',
  'Your swap request for {{date}} was declined',
  '/swaps',
  ARRAY['date'],
  110
),
(
  'swap-confirmed',
  'Swap Confirmed (Leaders)',
  'Swaps',
  'Notifies ministry leaders that a swap was confirmed.',
  'Swap accepted (edge function + DB trigger paths)',
  'Ministry-scoped pastors and Production/Video managers',
  'Swap Request Confirmed',
  '{{requester}} and {{accepter}} have confirmed a swap for {{date}}',
  '/swaps',
  ARRAY['requester', 'accepter', 'date'],
  120
),

-- Chat
(
  'chat-message',
  'Chat Message',
  'Chat',
  'New message in a campus/ministry chat.',
  'New chat_messages row (trigger + client fallback)',
  'Chat roster for that campus/ministry (or camp subscribers)',
  '{{sender}} in {{chat_label}}',
  '{{preview}}',
  '/chat',
  ARRAY['sender', 'chat_label', 'preview'],
  130
),
(
  'chat-mention',
  'Chat Mention',
  'Chat',
  'Someone was @mentioned in chat.',
  'Mention detected in a chat message',
  'Mentioned users on the chat roster',
  '{{sender}} mentioned you',
  '{{preview}}',
  '/chat',
  ARRAY['sender', 'preview'],
  140
),
(
  'chat-busy',
  'Chat Busy',
  'Chat',
  'Throttled notice when a chat is very active.',
  '5+ messages in a minute in the same chat',
  'Non-mentioned roster members (once per minute)',
  '{{chat_label}} is busy',
  'A lot is happening in chat right now. Join the conversation.',
  '/chat',
  ARRAY['chat_label'],
  150
),
(
  'chat-activity',
  'Chat Activity',
  'Chat',
  'App-wide notice that chat has been active (currently unused by cron).',
  'notify-chat-activity edge function (manual / future cron)',
  'All push subscribers for the resource app',
  '🔥 Chat is Active!',
  '{{count}} messages in the last 30 minutes. Join the conversation at {{campus}}!',
  '/chat',
  ARRAY['count', 'campus'],
  160
),

-- Feed & events
(
  'feed-post',
  'Feed Post',
  'Feed',
  'New post in The Feed (or Camp Feed).',
  'New feed_posts row (trigger + client fallback)',
  'Push subscribers for the app (or camp instance)',
  'New Post in The Feed',
  '{{author}} shared: {{title_preview}}',
  '/feed',
  ARRAY['author', 'title_preview'],
  170
),
(
  'event',
  'New Event',
  'Events',
  'A new calendar event was created.',
  'events INSERT trigger',
  'Users matching the event campus/ministry filters',
  'New Event',
  '{{title}} • {{campus}} • {{ministry}} on {{date}}{{time}}',
  '/calendar',
  ARRAY['title', 'campus', 'ministry', 'date', 'time'],
  180
),

-- Team / roles
(
  'drum-tech-comment',
  'Drum Tech Message',
  'Team',
  'New comment in Drum Tech.',
  'Drum tech comment INSERT trigger',
  'Campus users with drums / drum_tech position',
  'New Drum Tech message',
  '{{author}} posted in {{campus}}: {{preview}}',
  '/drum-tech',
  ARRAY['author', 'campus', 'preview'],
  190
),
(
  'break-request',
  'Break Request',
  'Team',
  'Someone needs a break or is willing to take one.',
  'Break request created',
  'Network pastors, campus worship pastors, campus admins',
  'Break Request',
  '{{name}} {{request_phrase}} for {{period}}',
  '/team-builder',
  ARRAY['name', 'request_phrase', 'period'],
  200
),
(
  'rotation-publish',
  'Rotation Assignment',
  'Team',
  'Welcome message when a rotation is published.',
  'Publishing a Team Builder rotation',
  'Each assigned team member',
  'Welcome to {{team}}',
  'You''re on {{team}} for {{dates}}. Tap to view your team and schedule.',
  '/team-builder',
  ARRAY['team', 'dates', 'period'],
  210
),
(
  'rotation-break',
  'Rotation Break',
  'Team',
  'Encouragement for people on break this trimester.',
  'Publishing a Team Builder rotation (break list)',
  'Members marked on break for the period',
  '{{period}}: Time to Recharge',
  'This trimester is a chance to reset, breathe, and stay connected in a different way.',
  '/team-builder',
  ARRAY['period'],
  220
),

-- Admin / system
(
  'admin-ping',
  'Leader Ping',
  'Admin',
  'Custom broadcast from Admin Tools.',
  'Admin Ping card in Admin Tools',
  'Filtered leaders (campus, ministry, gender, grade, camp mode)',
  '{{title}}',
  '{{sender}}: {{message}}',
  '/',
  ARRAY['title', 'sender', 'message'],
  230
),
(
  'test-notification',
  'Test Notification',
  'Admin',
  'Admin test push from Profile settings.',
  'Test Push button on Profile (admins)',
  'All users with push enabled in the current app',
  'Test Notification 🎵',
  'Push notifications are working! You''ll receive updates about schedules, setlists, and more.',
  '/dashboard',
  ARRAY[]::TEXT[],
  240
),
(
  'cancellation',
  'Notification Withdrawn',
  'Admin',
  'Correction sent when a previous push is canceled.',
  'cancel-push-notification edge function',
  'Original recipients of the canceled push',
  'Notification withdrawn',
  'Please ignore the earlier notification: {{original_title}}',
  '{{original_url}}',
  ARRAY['original_title', 'original_url'],
  250
);
