-- Defense in depth for setlist push notifications:
-- the original draft_sets trigger sent "New Set Published" pushes without
-- recipient IDs, which the push sender historically interpreted as every
-- subscribed device. Keep that legacy path disabled even if an environment
-- missed the earlier cleanup migration.

DROP TRIGGER IF EXISTS on_set_published_notify ON public.draft_sets;

CREATE OR REPLACE FUNCTION public.notify_published_set()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;
