-- Let assigned audition candidates create a practice playlist and upload reference tracks
-- for their own audition setlist without broadening access for other ministries.

DROP POLICY IF EXISTS "Assigned audition candidates can create playlists" ON public.setlist_playlists;
CREATE POLICY "Assigned audition candidates can create playlists"
ON public.setlist_playlists
FOR INSERT TO authenticated
WITH CHECK (
  ministry_type = 'audition'
  AND EXISTS (
    SELECT 1
    FROM public.audition_setlist_assignments asa
    WHERE asa.draft_set_id = setlist_playlists.draft_set_id
      AND asa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Assigned audition candidates can insert reference tracks" ON public.setlist_playlist_reference_tracks;
CREATE POLICY "Assigned audition candidates can insert reference tracks"
ON public.setlist_playlist_reference_tracks
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.setlist_playlists sp
    JOIN public.audition_setlist_assignments asa
      ON asa.draft_set_id = sp.draft_set_id
    WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
      AND sp.ministry_type = 'audition'
      AND asa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Assigned audition candidates can insert reference track markers" ON public.reference_track_markers;
CREATE POLICY "Assigned audition candidates can insert reference track markers"
ON public.reference_track_markers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.setlist_playlist_reference_tracks rt
    JOIN public.setlist_playlists sp
      ON sp.id = rt.playlist_id
    JOIN public.audition_setlist_assignments asa
      ON asa.draft_set_id = sp.draft_set_id
    WHERE rt.id = reference_track_markers.reference_track_id
      AND sp.ministry_type = 'audition'
      AND asa.user_id = auth.uid()
  )
);
