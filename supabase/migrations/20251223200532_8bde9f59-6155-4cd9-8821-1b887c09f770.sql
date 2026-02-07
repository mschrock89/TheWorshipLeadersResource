-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new policy: Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Create new policy: Leaders can view all profiles
CREATE POLICY "Leaders can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'leader'::app_role));