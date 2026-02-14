-- Prevent missing practice playlists for any published setlist.
-- 1) Backfill any missing playlist rows for already-published draft sets.
-- 2) Keep playlist rows in sync automatically when draft_sets are published/edited.

-- Backfill missing playlist rows for currently published setlists.
INSERT INTO public.setlist_playlists (draft_set_id, campus_id, service_date, ministry_type)
SELECT ds.id, ds.campus_id, ds.plan_date, ds.ministry_type
FROM public.draft_sets ds
WHERE ds.status = 'published'
  AND ds.published_at IS NOT NULL
  AND ds.campus_id IS NOT NULL
ON CONFLICT (draft_set_id)
DO UPDATE SET
  campus_id = EXCLUDED.campus_id,
  service_date = EXCLUDED.service_date,
  ministry_type = EXCLUDED.ministry_type;

-- Keep setlist_playlists synced whenever a set is published or updated while published.
CREATE OR REPLACE FUNCTION public.sync_setlist_playlist_for_published_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If the row is published, ensure playlist exists and matches current metadata.
  IF NEW.status = 'published' AND NEW.published_at IS NOT NULL AND NEW.campus_id IS NOT NULL THEN
    INSERT INTO public.setlist_playlists (draft_set_id, campus_id, service_date, ministry_type)
    VALUES (NEW.id, NEW.campus_id, NEW.plan_date, NEW.ministry_type)
    ON CONFLICT (draft_set_id)
    DO UPDATE SET
      campus_id = EXCLUDED.campus_id,
      service_date = EXCLUDED.service_date,
      ministry_type = EXCLUDED.ministry_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_setlist_playlist_on_published_set ON public.draft_sets;

CREATE TRIGGER trg_sync_setlist_playlist_on_published_set
AFTER INSERT OR UPDATE OF status, published_at, campus_id, plan_date, ministry_type
ON public.draft_sets
FOR EACH ROW
EXECUTE FUNCTION public.sync_setlist_playlist_for_published_set();
