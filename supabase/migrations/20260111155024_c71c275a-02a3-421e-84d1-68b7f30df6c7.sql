-- Add new audio positions to the team_position enum
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'mon';
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'broadcast';