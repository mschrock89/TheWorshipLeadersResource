-- Final alignment fix:
-- If a user can view the linked draft_set row, they should be able to view its practice playlist.
-- This prevents swap/roster drift between multiple access-check implementations.

DROP POLICY IF EXISTS "Users can view their scheduled playlists" ON public.setlist_playlists;

CREATE POLICY "Users can view their scheduled playlists"
ON public.setlist_playlists
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.draft_sets ds
    WHERE ds.id = setlist_playlists.draft_set_id
      AND ds.status = 'published'
  )
  OR EXISTS (
    SELECT 1
    FROM public.audition_setlist_assignments asa
    WHERE asa.draft_set_id = setlist_playlists.draft_set_id
      AND asa.user_id = auth.uid()
  )
);
