-- Allow setlist reference tracks to be managed by the pastoral roles that already
-- own setlist workflows in the app. Network Worship Pastors are network-wide,
-- while Campus Pastors and Student Worship Leaders are scoped to their campuses.

CREATE POLICY "Reference track managers can insert reference tracks"
ON public.setlist_playlist_reference_tracks
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.setlist_playlists sp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = sp.campus_id
      WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
    )
  )
);

CREATE POLICY "Reference track managers can update reference tracks"
ON public.setlist_playlist_reference_tracks
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.setlist_playlists sp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = sp.campus_id
      WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.setlist_playlists sp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = sp.campus_id
      WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
    )
  )
);

CREATE POLICY "Reference track managers can delete reference tracks"
ON public.setlist_playlist_reference_tracks
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
    AND EXISTS (
      SELECT 1
      FROM public.setlist_playlists sp
      JOIN public.user_campuses uc
        ON uc.user_id = auth.uid()
       AND uc.campus_id = sp.campus_id
      WHERE sp.id = setlist_playlist_reference_tracks.playlist_id
    )
  )
);

CREATE POLICY "Reference track managers can manage markers"
ON public.reference_track_markers
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
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
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR (
    (
      has_role(auth.uid(), 'campus_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    )
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
);
