-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that explicitly requires authentication first
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id 
    OR has_role(auth.uid(), 'leader'::app_role)
  )
);