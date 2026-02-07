
-- Create a security definer function to get profiles for chat mentions
-- This allows ALL users to see basic profile info for people in the same campus+ministry
CREATE OR REPLACE FUNCTION public.get_profiles_for_chat_mention(
  _campus_id uuid,
  _ministry_type text
)
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  INNER JOIN public.user_ministry_campuses umc 
    ON umc.user_id = p.id
  WHERE umc.campus_id = _campus_id
    AND umc.ministry_type = _ministry_type
  ORDER BY p.full_name;
$$;
