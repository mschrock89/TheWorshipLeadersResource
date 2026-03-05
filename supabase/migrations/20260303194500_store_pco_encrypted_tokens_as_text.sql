-- Store encrypted PCO tokens as plain hex text instead of bytea.
-- bytea has introduced inconsistent encoding/decoding through PostgREST,
-- which causes decryption failures in edge functions.

ALTER TABLE public.pco_connections
ALTER COLUMN access_token_encrypted TYPE text
USING CASE
  WHEN access_token_encrypted IS NULL THEN NULL
  ELSE encode(access_token_encrypted, 'hex')
END;

ALTER TABLE public.pco_connections
ALTER COLUMN refresh_token_encrypted TYPE text
USING CASE
  WHEN refresh_token_encrypted IS NULL THEN NULL
  ELSE encode(refresh_token_encrypted, 'hex')
END;

COMMENT ON COLUMN public.pco_connections.access_token_encrypted IS
  'AES-GCM encrypted access token stored as hex text. Decryption key stored in edge function secrets.';

COMMENT ON COLUMN public.pco_connections.refresh_token_encrypted IS
  'AES-GCM encrypted refresh token stored as hex text. Decryption key stored in edge function secrets.';
