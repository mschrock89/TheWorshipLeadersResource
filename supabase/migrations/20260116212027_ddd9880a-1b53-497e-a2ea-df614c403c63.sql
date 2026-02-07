-- Fix 1: Tighten profiles RLS - require same campus for consent-based visibility
DROP POLICY IF EXISTS "Users can view own profile or authorized via consent" ON public.profiles;

CREATE POLICY "Users can view own profile or same-campus authorized"
ON public.profiles
FOR SELECT
USING (
  -- Always can view own profile
  auth.uid() = id
  -- OR user is admin (can view all)
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'::public.app_role
  )
  -- OR shares campus AND has appropriate consent
  OR (
    public.shares_campus_with(id, auth.uid())
    AND (
      -- Campus members who share with campus
      share_contact_with_campus = true
      -- OR pastors can see if user shares with pastors
      OR (
        share_contact_with_pastors = true
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role IN ('campus_pastor'::public.app_role, 'campus_worship_pastor'::public.app_role, 'network_worship_pastor'::public.app_role)
        )
      )
    )
  )
);

-- Fix 2: Prevent direct access to encrypted tokens in pco_connections
-- Users should only access via the safe view, not read encrypted columns directly
DROP POLICY IF EXISTS "Users can read own connection" ON public.pco_connections;

-- Create a restrictive read policy that excludes token columns
-- Since RLS can't filter columns, we prevent all direct reads and force use of safe view
CREATE POLICY "Only service role can read pco_connections"
ON public.pco_connections
FOR SELECT
USING (
  -- Only allow reads via service role (edge functions)
  -- Users must use pco_connections_safe view instead
  false
);

-- But allow users to check if they have a connection (for UI purposes) via the safe view
-- The safe view with security_invoker will work because it's defined with auth.uid() filter

-- Allow users to insert/update/delete their own connections
DROP POLICY IF EXISTS "Users can insert own connection" ON public.pco_connections;
CREATE POLICY "Users can insert own connection"
ON public.pco_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own connection" ON public.pco_connections;
CREATE POLICY "Users can update own connection"
ON public.pco_connections
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connection" ON public.pco_connections;
CREATE POLICY "Users can delete own connection"
ON public.pco_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Fix 3: Recreate safe view to work without direct table RLS
-- Since we blocked direct reads, recreate view as SECURITY DEFINER function instead
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create a secure function that returns only the user's connection metadata
CREATE OR REPLACE FUNCTION public.get_my_pco_connection()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  campus_id uuid,
  pco_organization_name text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  sync_team_members boolean,
  sync_positions boolean,
  sync_birthdays boolean,
  sync_phone_numbers boolean,
  sync_active_only boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    user_id,
    campus_id,
    pco_organization_name,
    connected_at,
    last_sync_at,
    sync_team_members,
    sync_positions,
    sync_birthdays,
    sync_phone_numbers,
    sync_active_only
  FROM public.pco_connections
  WHERE user_id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_pco_connection() TO authenticated;