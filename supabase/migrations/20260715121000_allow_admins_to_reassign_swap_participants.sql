-- Allow the same administrative roles that manage swap deletion to reassign
-- the requester or target/accepted participant. This is a separate permissive
-- policy so the participant response policy remains unchanged for volunteers.

CREATE POLICY "Admins can reassign swap participants"
ON public.swap_requests
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'video_director'::app_role)
  OR has_role(auth.uid(), 'production_manager'::app_role)
  OR (
    resource_app_key IN ('students_hs', 'students_ms')
    AND (
      has_role(auth.uid(), 'student_pastor'::app_role)
      OR has_role(auth.uid(), 'network_student_pastor'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'video_director'::app_role)
  OR has_role(auth.uid(), 'production_manager'::app_role)
  OR (
    resource_app_key IN ('students_hs', 'students_ms')
    AND (
      has_role(auth.uid(), 'student_pastor'::app_role)
      OR has_role(auth.uid(), 'network_student_pastor'::app_role)
    )
  )
);
