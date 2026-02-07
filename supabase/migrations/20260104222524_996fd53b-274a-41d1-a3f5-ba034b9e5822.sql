-- Remove redundant SELECT policies that are now covered by the new consolidated policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Leaders can view all profiles" ON public.profiles;