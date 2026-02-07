-- Add default_campus_id column to profiles table for admin users
ALTER TABLE public.profiles
ADD COLUMN default_campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL;

-- Add comment explaining usage
COMMENT ON COLUMN public.profiles.default_campus_id IS 'Default campus for admins - used as initial selection across all campus-filtered views';