-- Create a trigger function to protect encrypted token columns
-- Only service role (edge functions) can modify these sensitive columns
CREATE OR REPLACE FUNCTION public.protect_pco_encrypted_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if encrypted token columns are being modified
  IF (OLD.access_token_encrypted IS DISTINCT FROM NEW.access_token_encrypted) OR 
     (OLD.refresh_token_encrypted IS DISTINCT FROM NEW.refresh_token_encrypted) OR
     (OLD.token_expires_at IS DISTINCT FROM NEW.token_expires_at) THEN
    -- Only allow if this is a service role operation (edge functions)
    -- Service role operations have auth.uid() as NULL and role claim as 'service_role'
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot modify encrypted tokens directly. Use the authorized API.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS protect_pco_tokens_trigger ON public.pco_connections;
CREATE TRIGGER protect_pco_tokens_trigger
  BEFORE UPDATE ON public.pco_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pco_encrypted_tokens();

-- Also add a trigger for INSERT to ensure only service role can set initial tokens
CREATE OR REPLACE FUNCTION public.protect_pco_encrypted_tokens_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If encrypted tokens are being set, only allow from service role
  IF NEW.access_token_encrypted IS NOT NULL OR NEW.refresh_token_encrypted IS NOT NULL THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set encrypted tokens directly. Use the authorized API.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_pco_tokens_insert_trigger ON public.pco_connections;
CREATE TRIGGER protect_pco_tokens_insert_trigger
  BEFORE INSERT ON public.pco_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_pco_encrypted_tokens_insert();