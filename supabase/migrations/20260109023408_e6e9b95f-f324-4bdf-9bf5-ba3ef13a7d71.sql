-- Add ministry_types column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN ministry_types text[] DEFAULT ARRAY['weekend']::text[];

-- Update any existing profiles with default weekend ministry
UPDATE public.profiles 
SET ministry_types = ARRAY['weekend']::text[] 
WHERE ministry_types IS NULL;