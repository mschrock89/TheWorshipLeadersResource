-- First, clean up the messy data in team_members
-- Normalize all vocal-related positions to 'vocalist'
UPDATE public.team_members SET position = 'vocalist' WHERE position IN ('Vocals', 'Vocalist 1', 'harmony_vocals', 'background_vocals', 'lead_vocals');

-- Normalize instrument positions
UPDATE public.team_members SET position = 'drums' WHERE position = 'Drums';
UPDATE public.team_members SET position = 'bass' WHERE position = 'Bass';
UPDATE public.team_members SET position = 'keys' WHERE position = 'Keys';
UPDATE public.team_members SET position = 'electric_1' WHERE position IN ('Electric 1', 'EG 1');
UPDATE public.team_members SET position = 'electric_2' WHERE position IN ('Electric 2', 'EG 2');
UPDATE public.team_members SET position = 'acoustic_1' WHERE position IN ('Acoustic 1', 'AG 1');
UPDATE public.team_members SET position = 'acoustic_2' WHERE position IN ('Acoustic 2', 'AG 2');
UPDATE public.team_members SET position = 'sound_tech' WHERE position = 'FOH';
UPDATE public.team_members SET position = 'media' WHERE position = 'Lyrics';