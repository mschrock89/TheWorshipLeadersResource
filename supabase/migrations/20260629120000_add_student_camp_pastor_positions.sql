-- Student Camp teams add a "Pastors" position group (M/C, Prayer, Speaker) that is
-- separate from the worship-focused Speaker positions used on weekend teams.
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'pastor_mc';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'pastor_prayer';
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'pastor_speaker';
