-- Add ministry_types column to team_members table
ALTER TABLE public.team_members
ADD COLUMN ministry_types text[] DEFAULT ARRAY['weekend']::text[];

-- Update all existing T1 members to have 'weekend' as their ministry type
UPDATE public.team_members
SET ministry_types = ARRAY['weekend']::text[]
WHERE ministry_types IS NULL OR ministry_types = '{}';