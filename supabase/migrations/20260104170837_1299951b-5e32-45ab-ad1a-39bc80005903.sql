-- Allow authenticated users to view basic profile info (name, avatar) for chat purposes
CREATE POLICY "Authenticated users can view profiles for chat"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);