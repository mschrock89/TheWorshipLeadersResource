-- Create a function to get upcoming birthdays for all authenticated users
-- This only exposes birthday-related data (id, name, avatar, birthday)
-- without revealing other sensitive fields like phone, email, etc.

CREATE OR REPLACE FUNCTION public.get_upcoming_birthdays()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  birthday date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.birthday
  FROM public.profiles p
  INNER JOIN public.user_campuses uc ON uc.user_id = p.id
  WHERE p.birthday IS NOT NULL
    AND EXISTS (
      -- Only show birthdays for users who share a campus with the viewer
      SELECT 1 FROM public.user_campuses viewer_uc
      WHERE viewer_uc.user_id = auth.uid()
        AND viewer_uc.campus_id = uc.campus_id
    )
  GROUP BY p.id, p.full_name, p.avatar_url, p.birthday
$$;