-- Team Builder team management (rename / customize / delete).
--
-- worship_teams already supports admin INSERT/UPDATE/DELETE via the
-- "Admins can manage worship teams" policy, so renaming, recoloring, creating,
-- and hard-deleting teams works without new policies.
--
-- The only missing piece is suppression: several built-in teams (Team 1-4,
-- Combined, Simple Worship, 5th Sunday, and the student teams) are hardcoded
-- fallbacks in the app and get re-injected into Team Builder even after their
-- database row is deleted. This tombstone table records intentionally deleted
-- teams so those fallbacks stay hidden until an admin re-creates them.

CREATE TABLE IF NOT EXISTS public.worship_team_archives (
  team_id UUID PRIMARY KEY,
  resource_app_key TEXT NOT NULL DEFAULT 'worship',
  team_name TEXT,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS worship_team_archives_resource_app_key_idx
  ON public.worship_team_archives (resource_app_key);

ALTER TABLE public.worship_team_archives ENABLE ROW LEVEL SECURITY;

-- All authenticated users must be able to read the tombstones so deleted
-- fallback teams stay hidden for everyone (not just admins).
DROP POLICY IF EXISTS "Authenticated can view archived teams" ON public.worship_team_archives;
CREATE POLICY "Authenticated can view archived teams"
  ON public.worship_team_archives
  FOR SELECT
  TO authenticated
  USING (true);

-- Only org admins can archive / un-archive teams, matching the existing
-- worship_teams write policy.
DROP POLICY IF EXISTS "Admins can manage archived teams" ON public.worship_team_archives;
CREATE POLICY "Admins can manage archived teams"
  ON public.worship_team_archives
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
