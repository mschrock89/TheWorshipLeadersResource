-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted token columns (we'll migrate data in edge functions)
ALTER TABLE public.pco_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted bytea;

-- Create a view that only exposes non-sensitive fields for client-side queries
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections;

-- Grant access to the safe view
GRANT SELECT ON public.pco_connections_safe TO authenticated;

-- Add comment explaining the encryption
COMMENT ON COLUMN public.pco_connections.access_token_encrypted IS 'AES-256 encrypted access token. Decryption key stored in edge function secrets.';
COMMENT ON COLUMN public.pco_connections.refresh_token_encrypted IS 'AES-256 encrypted refresh token. Decryption key stored in edge function secrets.';