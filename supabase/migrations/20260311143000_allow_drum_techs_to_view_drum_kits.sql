CREATE OR REPLACE FUNCTION public.can_view_drum_kits(_campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_campuses uc
        WHERE uc.user_id = auth.uid()
          AND uc.campus_id = _campus_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_campus_ministry_positions ucmp
        WHERE ucmp.user_id = auth.uid()
          AND ucmp.campus_id = _campus_id
          AND ucmp.position = 'drum_tech'
      )
    );
$$;
