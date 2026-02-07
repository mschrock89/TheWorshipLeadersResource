-- Update existing data: change lead_vocals to vocalist in profiles.positions
UPDATE public.profiles 
SET positions = array_replace(positions, 'lead_vocals'::team_position, 'vocalist'::team_position)
WHERE positions @> ARRAY['lead_vocals']::team_position[];

-- Update existing data: change lead_vocals to vocalist in team_members.position
UPDATE public.team_members 
SET position = 'vocalist'
WHERE position = 'lead_vocals';

-- Update existing data: change lead_vocals to vocalist in user_campus_ministry_positions.position
UPDATE public.user_campus_ministry_positions 
SET position = 'vocalist'
WHERE position = 'lead_vocals';