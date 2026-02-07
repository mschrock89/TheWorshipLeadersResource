-- Add campus_id to team_schedule for per-campus schedules
ALTER TABLE team_schedule 
ADD COLUMN campus_id uuid REFERENCES campuses(id);

-- Create index for efficient campus-based queries
CREATE INDEX idx_team_schedule_campus_id ON team_schedule(campus_id);