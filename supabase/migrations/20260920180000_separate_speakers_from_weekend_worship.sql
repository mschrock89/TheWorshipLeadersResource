-- Split Announcements / Closing Prayer / Teacher into an independent Speakers
-- ministry with its own Team Builder schedule. Existing weekend-tagged speaker
-- assignments and campus positions move to ministry_type = 'speaker', and
-- weekend team_schedule rows are copied so Speakers starts with a schedule
-- that can then rotate independently.

WITH speaker_positions AS (
  SELECT unnest(ARRAY[
    'teacher',
    'Teacher',
    'announcement',
    'Announcements',
    'closing_prayer',
    'Closing Prayer',
    'closer'
  ]) AS position
),
weekend_speaker_rows AS (
  SELECT DISTINCT
    ucmp.user_id,
    ucmp.campus_id,
    ucmp.position
  FROM public.user_campus_ministry_positions ucmp
  JOIN speaker_positions sp ON sp.position = ucmp.position
  WHERE ucmp.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
)
INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
SELECT
  user_id,
  campus_id,
  'speaker',
  position
FROM weekend_speaker_rows
ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;

WITH campuses_needing_speakers AS (
  SELECT DISTINCT
    user_id,
    campus_id
  FROM public.user_campus_ministry_positions
  WHERE ministry_type = 'speaker'
)
INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
SELECT
  user_id,
  campus_id,
  'speaker'
FROM campuses_needing_speakers
ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;

DELETE FROM public.user_campus_ministry_positions
WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
  AND position IN (
    'teacher',
    'Teacher',
    'announcement',
    'Announcements',
    'closing_prayer',
    'Closing Prayer',
    'closer'
  );

UPDATE public.team_members
SET ministry_types = ARRAY(
  SELECT DISTINCT unnest(
    ARRAY['speaker'] || ARRAY(
      SELECT unnest(COALESCE(ministry_types, ARRAY[]::text[]))
      EXCEPT
      SELECT unnest(ARRAY['weekend', 'weekend_team', 'sunday_am'])
    )
  )
)
WHERE position_slot IN ('teacher', 'announcement', 'closing_prayer')
   OR lower(position) IN ('teacher', 'announcement', 'announcements', 'closing_prayer', 'closer');

UPDATE public.team_member_date_overrides
SET ministry_types = ARRAY(
  SELECT DISTINCT unnest(
    ARRAY['speaker'] || ARRAY(
      SELECT unnest(COALESCE(ministry_types, ARRAY[]::text[]))
      EXCEPT
      SELECT unnest(ARRAY['weekend', 'weekend_team', 'sunday_am'])
    )
  )
)
WHERE position_slot IN ('teacher', 'announcement', 'closing_prayer')
   OR lower(position) IN ('teacher', 'announcement', 'announcements', 'closing_prayer', 'closer');

INSERT INTO public.team_schedule (
  campus_id,
  schedule_date,
  team_id,
  ministry_type,
  time_of_day,
  rotation_period,
  notes,
  resource_app_key
)
SELECT
  weekend.campus_id,
  weekend.schedule_date,
  weekend.team_id,
  'speaker',
  weekend.time_of_day,
  weekend.rotation_period,
  weekend.notes,
  weekend.resource_app_key
FROM public.team_schedule weekend
WHERE weekend.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_schedule speaker
    WHERE speaker.ministry_type = 'speaker'
      AND speaker.schedule_date = weekend.schedule_date
      AND speaker.resource_app_key = weekend.resource_app_key
      AND speaker.rotation_period = weekend.rotation_period
      AND speaker.team_id = weekend.team_id
      AND COALESCE(speaker.campus_id::text, '') = COALESCE(weekend.campus_id::text, '')
      AND COALESCE(speaker.time_of_day, '') = COALESCE(weekend.time_of_day, '')
  );

UPDATE public.profiles
SET ministry_types = array_append(COALESCE(ministry_types, ARRAY[]::text[]), 'speaker')
WHERE id IN (
  SELECT DISTINCT user_id
  FROM public.user_campus_ministry_positions
  WHERE ministry_type = 'speaker'
)
  AND NOT ('speaker' = ANY(COALESCE(ministry_types, ARRAY[]::text[])));
