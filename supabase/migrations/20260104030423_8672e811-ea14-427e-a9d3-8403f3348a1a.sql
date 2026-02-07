-- Add consent column to profiles for users to control visibility
ALTER TABLE public.profiles 
ADD COLUMN share_contact_with_pastors boolean NOT NULL DEFAULT false;

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Campus pastors can view their campus profiles" ON public.profiles;

-- Create new policy: Campus pastors can only see profiles where user has consented
CREATE POLICY "Campus pastors can view consented campus profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'campus_pastor'::app_role) 
  AND shares_campus_with(auth.uid(), id)
  AND share_contact_with_pastors = true
);