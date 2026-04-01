-- Production-only positions should not live under Weekend Worship aliases.
-- Move any existing weekend/weekend_team/sunday_am production positions to the
-- canonical production ministry and remove the weekend-side rows.

WITH production_positions AS (
  SELECT unnest(ARRAY[
    'sound_tech',
    'mon',
    'broadcast',
    'audio_shadow',
    'lighting',
    'media',
    'producer'
  ]) AS position
),
weekend_production_rows AS (
  SELECT DISTINCT
    ucmp.user_id,
    ucmp.campus_id,
    ucmp.position
  FROM public.user_campus_ministry_positions ucmp
  JOIN production_positions pp ON pp.position = ucmp.position
  WHERE ucmp.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
)
INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
SELECT
  user_id,
  campus_id,
  'production',
  position
FROM weekend_production_rows
ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;

WITH campuses_needing_production AS (
  SELECT DISTINCT
    user_id,
    campus_id
  FROM public.user_campus_ministry_positions
  WHERE ministry_type = 'production'
)
INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
SELECT
  user_id,
  campus_id,
  'production'
FROM campuses_needing_production
ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;

DELETE FROM public.user_campus_ministry_positions
WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
  AND position IN (
    'sound_tech',
    'mon',
    'broadcast',
    'audio_shadow',
    'lighting',
    'media',
    'producer'
  );
