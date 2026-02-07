-- Add camera_5 and camera_6 to team_position enum
ALTER TYPE team_position ADD VALUE 'camera_5';
ALTER TYPE team_position ADD VALUE 'camera_6';

-- Add service_day column to team_members table
-- NULL = serves both days (default for band/audio)
-- 'saturday' or 'sunday' = specific day assignment (for video team)
ALTER TABLE team_members 
ADD COLUMN service_day TEXT CHECK (service_day IN ('saturday', 'sunday'));

-- Add comment explaining the column
COMMENT ON COLUMN team_members.service_day IS 'Indicates which day this member serves. NULL means both days (typical for band). saturday/sunday for video team positions.';