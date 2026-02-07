-- 1. Add consent field for sharing contact info with campus members
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS share_contact_with_campus boolean NOT NULL DEFAULT false;

-- 2. Drop the current overly permissive policy
DROP POLICY IF EXISTS "Users can view campus member profiles" ON public.profiles;

-- 3. Create restrictive policy - full profile access only with consent
CREATE POLICY "Users can view profiles with consent"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id  -- Own profile
  OR has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
  OR (has_role(auth.uid(), 'campus_pastor'::app_role) AND shares_campus_with(auth.uid(), id) AND share_contact_with_pastors = true)  -- Campus pastors with consent
  OR (shares_campus_with(auth.uid(), id) AND share_contact_with_campus = true)  -- Campus members with consent
);

-- 4. Create security definer function for basic profile info (name, avatar only) - for chat/team display
CREATE OR REPLACE FUNCTION public.get_basic_profiles()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE 
    has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
    OR shares_campus_with(auth.uid(), p.id)  -- Campus members
    OR p.id = auth.uid()  -- Own profile
$$;