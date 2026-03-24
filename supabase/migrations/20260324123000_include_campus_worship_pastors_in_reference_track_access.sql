-- Include Campus Worship Pastors in the same campus-scoped reference track
-- management access as Campus Pastors and Student Worship Leaders.

CREATE POLICY "Campus worship pastors can insert reference tracks"
ON public.setlist_playlist_reference_tracks
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlists sp
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
  )
);

CREATE POLICY "Campus worship pastors can update reference tracks"
ON public.setlist_playlist_reference_tracks
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlists sp
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
  )
)
WITH CHECK (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlists sp
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
  )
);

CREATE POLICY "Campus worship pastors can delete reference tracks"
ON public.setlist_playlist_reference_tracks
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlists sp
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
  )
);

CREATE POLICY "Campus worship pastors can manage reference track markers"
ON public.reference_track_markers
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlist_reference_tracks rt
    JOIN public.setlist_playlists sp
      ON sp.id = rt.playlist_id
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE rt.id = reference_track_markers.reference_track_id
  )
)
WITH CHECK (
  has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.setlist_playlist_reference_tracks rt
    JOIN public.setlist_playlists sp
      ON sp.id = rt.playlist_id
    JOIN public.user_campuses uc
      ON uc.user_id = auth.uid()
     AND uc.campus_id = sp.campus_id
    WHERE rt.id = reference_track_markers.reference_track_id
  )
);
