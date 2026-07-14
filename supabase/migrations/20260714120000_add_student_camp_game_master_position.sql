-- Student Camp teams gain a "Game Master" leadership position alongside the existing
-- Pastors group (M/C, Prayer, Speaker). Same team_position enum, grouped under Pastors.
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'pastor_game_master';
