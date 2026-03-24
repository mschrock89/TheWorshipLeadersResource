-- Allow leadership roles who can manage weekend reference tracks to upload/delete
-- files in the dedicated reference-tracks folder inside the song-audio bucket.
-- This keeps the rest of the audio library admin-managed.

CREATE POLICY "Reference track managers can upload reference audio"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'reference-tracks'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  )
);

CREATE POLICY "Reference track managers can update reference audio"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'reference-tracks'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'reference-tracks'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  )
);

CREATE POLICY "Reference track managers can delete reference audio"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'song-audio'
  AND (storage.foldername(name))[1] = 'reference-tracks'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  )
);
