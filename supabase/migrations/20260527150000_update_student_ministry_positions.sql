ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'student_cafe';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'student_hype';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'student_prayer';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'student_hospitality';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'student_small_group_leader';

DELETE FROM public.user_campus_ministry_positions
WHERE ministry_type = 'students'
  AND position IN ('student_team_lead', 'student_team_member');
