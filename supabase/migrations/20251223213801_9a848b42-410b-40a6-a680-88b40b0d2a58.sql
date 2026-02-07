-- Create a function to check if two users share a campus
CREATE OR REPLACE FUNCTION public.shares_campus_with(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_campuses uc1
    JOIN user_campuses uc2 ON uc1.campus_id = uc2.campus_id
    WHERE uc1.user_id = _viewer_id
      AND uc2.user_id = _profile_id
  )
$$;

-- Drop existing profile SELECT policies
DROP POLICY IF EXISTS "Leaders can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new SELECT policies
-- Leaders can still see everyone
CREATE POLICY "Leaders can view all profiles" ON public.profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'leader'::app_role));

-- Campus pastors can see users in their campus
CREATE POLICY "Campus pastors can view their campus profiles" ON public.profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'campus_pastor'::app_role)
    AND shares_campus_with(auth.uid(), id)
  );

-- Users can always see their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);