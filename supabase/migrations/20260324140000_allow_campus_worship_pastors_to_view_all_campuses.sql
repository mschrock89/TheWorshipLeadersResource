-- Campus Worship Pastors need the full campus list for cross-campus calendar and
-- weekend setlist views. Keep general users scoped to assigned campuses.

DROP POLICY IF EXISTS "Users can view assigned campuses" ON public.campuses;

CREATE POLICY "Users can view assigned campuses"
ON public.campuses
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR id IN (
    SELECT uc.campus_id
    FROM public.user_campuses uc
    WHERE uc.user_id = auth.uid()
  )
);
