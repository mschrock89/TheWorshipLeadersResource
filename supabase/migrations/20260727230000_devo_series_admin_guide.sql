-- Admin how-to guide lives on the DEVO series (not assignee uploads).
-- Storage path: series/{series_id}/{timestamp}-{filename}

ALTER TABLE public.devo_series
  ADD COLUMN IF NOT EXISTS guide_storage_path text,
  ADD COLUMN IF NOT EXISTS guide_file_name text,
  ADD COLUMN IF NOT EXISTS guide_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS guide_uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Replace assignee-upload storage policies with series-scoped admin upload + roster read.
DROP POLICY IF EXISTS "Devo assignees and admins can read guides" ON storage.objects;
DROP POLICY IF EXISTS "Devo assignees can upload guides" ON storage.objects;
DROP POLICY IF EXISTS "Devo assignees and admins can update guides" ON storage.objects;
DROP POLICY IF EXISTS "Devo assignees and admins can delete guides" ON storage.objects;

CREATE POLICY "Devo series guides readable by roster and admins"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND (
    -- New path: series/{series_id}/...
    (
      (storage.foldername(name))[1] = 'series'
      AND EXISTS (
        SELECT 1
        FROM public.devo_series s
        WHERE s.id = nullif((storage.foldername(name))[2], '')::uuid
          AND (
            public.has_capability(auth.uid(), 'admin_tools', s.resource_app_key)
            OR EXISTS (
              SELECT 1
              FROM public.devo_assignments a
              WHERE a.series_id = s.id
                AND a.assignee_id = auth.uid()
                AND a.status <> 'cancelled'
            )
          )
      )
    )
    OR
    -- Legacy path: {assignment_id}/...
    EXISTS (
      SELECT 1
      FROM public.devo_assignments a
      WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
        AND (
          a.assignee_id = auth.uid()
          OR public.has_capability(auth.uid(), 'admin_tools', a.resource_app_key)
        )
    )
  )
);

CREATE POLICY "Admins can upload DEVO series guides"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'devo_guides'
  AND (storage.foldername(name))[1] = 'series'
  AND EXISTS (
    SELECT 1
    FROM public.devo_series s
    WHERE s.id = nullif((storage.foldername(name))[2], '')::uuid
      AND public.has_capability(auth.uid(), 'admin_tools', s.resource_app_key)
  )
);

CREATE POLICY "Admins can update DEVO series guides"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND (storage.foldername(name))[1] = 'series'
  AND EXISTS (
    SELECT 1
    FROM public.devo_series s
    WHERE s.id = nullif((storage.foldername(name))[2], '')::uuid
      AND public.has_capability(auth.uid(), 'admin_tools', s.resource_app_key)
  )
)
WITH CHECK (
  bucket_id = 'devo_guides'
  AND (storage.foldername(name))[1] = 'series'
  AND EXISTS (
    SELECT 1
    FROM public.devo_series s
    WHERE s.id = nullif((storage.foldername(name))[2], '')::uuid
      AND public.has_capability(auth.uid(), 'admin_tools', s.resource_app_key)
  )
);

CREATE POLICY "Admins can delete DEVO series guides"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND (storage.foldername(name))[1] = 'series'
  AND EXISTS (
    SELECT 1
    FROM public.devo_series s
    WHERE s.id = nullif((storage.foldername(name))[2], '')::uuid
      AND public.has_capability(auth.uid(), 'admin_tools', s.resource_app_key)
  )
);

-- Push copy: guide is admin-provided, opened from DEVO — not uploaded by writers.
UPDATE public.push_notification_definitions
SET
  body_template = 'Goes live {{post_day}} at {{post_time}}. Open your profile badge → DEVO for the how-to guide and to write your post. It publishes to The Feed at go-live.',
  updated_at = now()
WHERE key = 'devo-assigned';

UPDATE public.push_notification_definitions
SET
  body_template = 'Your {{chapter}} DEVO is going live now on The Feed. Open The Feed to see it — or finish writing in DEVO if you have not yet. Need the how-to? Profile badge → DEVO.',
  updated_at = now()
WHERE key = 'devo-post-reminder';

NOTIFY pgrst, 'reload schema';
