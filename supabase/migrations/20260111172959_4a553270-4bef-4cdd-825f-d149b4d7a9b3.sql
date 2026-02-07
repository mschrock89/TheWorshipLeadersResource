-- Add acoustic_1 and acoustic_2 to the team_position enum
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'acoustic_1';
ALTER TYPE team_position ADD VALUE IF NOT EXISTS 'acoustic_2';