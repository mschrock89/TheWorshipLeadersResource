-- Add gender column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN gender text CHECK (gender IN ('male', 'female'));

-- Add index for filtering
CREATE INDEX idx_profiles_gender ON public.profiles(gender);