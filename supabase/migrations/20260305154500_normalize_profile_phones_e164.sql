-- Normalize all profile phone numbers to E.164 so group texting resolves reliably.
-- Examples:
--   (615) 555-1234 -> +16155551234
--   1-615-555-1234 -> +16155551234
--   +44 20 7946 0958 -> +442079460958

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned_input text;
  digits text;
BEGIN
  IF raw_phone IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned_input := btrim(raw_phone);
  IF cleaned_input = '' THEN
    RETURN NULL;
  END IF;

  -- Drop extension fragments (x123, ext 123, extension 123).
  cleaned_input := regexp_replace(
    cleaned_input,
    '\s*(ext\.?|extension|x)\s*\d+\s*$',
    '',
    'i'
  );

  digits := regexp_replace(cleaned_input, '\D', '', 'g');

  IF digits = '' THEN
    RETURN NULL;
  END IF;

  -- US local + country code assumptions.
  IF length(digits) = 10 THEN
    RETURN '+1' || digits;
  END IF;

  IF length(digits) = 11 AND left(digits, 1) = '1' THEN
    RETURN '+' || digits;
  END IF;

  -- International fallback (already has country code, with or without +).
  IF length(digits) BETWEEN 8 AND 15 THEN
    RETURN '+' || digits;
  END IF;

  -- Not a usable number.
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_phone_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone := public.normalize_phone_e164(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_profile_phone_before_write ON public.profiles;
CREATE TRIGGER normalize_profile_phone_before_write
BEFORE INSERT OR UPDATE OF phone ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profile_phone_before_write();

-- One-time cleanup for existing Team Directory numbers.
UPDATE public.profiles
SET phone = public.normalize_phone_e164(phone)
WHERE phone IS NOT NULL;

-- Enforce canonical storage format going forward.
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_phone_e164_chk;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_phone_e164_chk
CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
