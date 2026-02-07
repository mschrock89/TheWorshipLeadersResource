-- Drop existing policies and recreate with explicit authentication checks
DROP POLICY IF EXISTS "Users can view own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;
DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;

-- Recreate policies with explicit authentication requirement
CREATE POLICY "Authenticated users can view own connection"
ON public.pco_connections
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can insert own connection"
ON public.pco_connections
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can update own connection"
ON public.pco_connections
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);

CREATE POLICY "Authenticated users can delete own connection"
ON public.pco_connections
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);