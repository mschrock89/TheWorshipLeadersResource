-- Allow campus_admins to publish Feed posts to campuses they administer.
-- Used for "Share to My Feed" when browsing another campus's Feed.

DROP POLICY IF EXISTS "Admins can insert feed posts" ON public.feed_posts;
CREATE POLICY "Admins can insert feed posts"
  ON public.feed_posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (
      public.has_capability(auth.uid(), 'post_feed', resource_app_key)
      OR (
        campus_id IS NOT NULL
        AND camp_instance_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role = 'campus_admin'
            AND ur.admin_campus_id = campus_id
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
