-- Store a mailing/home address on profiles so leaders imported via the bulk CSV
-- uploader (and edited in their profile) can carry an address.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS address text;
