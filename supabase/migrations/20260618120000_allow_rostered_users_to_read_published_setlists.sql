-- Allow volunteers who are rostered through swaps, covers, date overrides, or
-- custom-service assignments to read their published setlist even when the
-- setlist's campus is not one of their profile campuses.

CREATE POLICY "Rostered users can view published draft sets"
ON public.draft_sets
FOR SELECT
USING (
  status = 'published'
  AND published_at IS NOT NULL
  AND public.is_user_on_setlist_roster(id, auth.uid())
);

CREATE POLICY "Rostered users can view songs in published draft sets"
ON public.draft_set_songs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.draft_sets ds
    WHERE ds.id = draft_set_songs.draft_set_id
      AND ds.status = 'published'
      AND ds.published_at IS NOT NULL
      AND public.is_user_on_setlist_roster(ds.id, auth.uid())
  )
);

CREATE POLICY "Users can view their own setlist confirmations"
ON public.setlist_confirmations
FOR SELECT
USING (auth.uid() = user_id);
