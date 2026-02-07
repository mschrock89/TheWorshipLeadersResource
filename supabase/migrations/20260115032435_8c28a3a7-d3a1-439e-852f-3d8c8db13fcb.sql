-- Add ministry_type column to team_schedule table
ALTER TABLE public.team_schedule 
ADD COLUMN ministry_type text DEFAULT 'weekend';

-- Update existing Wednesday dates to 'encounter'
UPDATE public.team_schedule 
SET ministry_type = 'encounter' 
WHERE EXTRACT(DOW FROM schedule_date) = 3;