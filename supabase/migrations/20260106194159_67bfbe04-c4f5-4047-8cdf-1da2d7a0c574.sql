-- Add sync_active_only setting to pco_connections (default true to only sync active members)
ALTER TABLE public.pco_connections
ADD COLUMN IF NOT EXISTS sync_active_only boolean NOT NULL DEFAULT true;

-- Update the safe view to include the new column
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe AS
SELECT
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only,
  connected_at,
  last_sync_at
FROM public.pco_connections;