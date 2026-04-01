-- Remove stale Weekend Worship assignments for Hannah Fletcher at Murfreesboro Central.
-- Live data inspection showed she still had weekend_team ministry/position rows even
-- though she should only be assigned to Production there.

DELETE FROM public.user_campus_ministry_positions
WHERE user_id = '2fac9958-991e-47a1-babe-76ee6cad08e3'
  AND campus_id = 'd70b980c-27a4-43b5-800b-1c58899ece90'
  AND ministry_type IN ('weekend', 'weekend_team', 'sunday_am');

DELETE FROM public.user_ministry_campuses
WHERE user_id = '2fac9958-991e-47a1-babe-76ee6cad08e3'
  AND campus_id = 'd70b980c-27a4-43b5-800b-1c58899ece90'
  AND ministry_type IN ('weekend', 'weekend_team', 'sunday_am');
