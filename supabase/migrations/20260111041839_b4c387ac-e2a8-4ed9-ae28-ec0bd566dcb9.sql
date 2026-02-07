-- Add audio_shadow position to the team_position enum
ALTER TYPE public.team_position ADD VALUE IF NOT EXISTS 'audio_shadow';