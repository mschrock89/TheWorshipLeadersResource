-- Normalize legacy Weekend Worship ministry aliases across assignment tables.
-- This removes hidden backend rows like weekend/sunday_am and keeps weekend_team
-- as the single canonical Weekend Worship assignment value.

WITH weekend_alias_assignments AS (
  SELECT DISTINCT
    user_id,
    campus_id
  FROM public.user_ministry_campuses
  WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
)
INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
SELECT
  user_id,
  campus_id,
  'weekend_team'
FROM weekend_alias_assignments
ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;

DELETE FROM public.user_ministry_campuses
WHERE ministry_type IN ('weekend', 'sunday_am');

WITH weekend_alias_positions AS (
  SELECT DISTINCT
    user_id,
    campus_id,
    position
  FROM public.user_campus_ministry_positions
  WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
)
INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
SELECT
  user_id,
  campus_id,
  'weekend_team',
  position
FROM weekend_alias_positions
ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;

DELETE FROM public.user_campus_ministry_positions
WHERE ministry_type IN ('weekend', 'sunday_am');
