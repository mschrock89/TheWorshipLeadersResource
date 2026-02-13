ALTER TABLE public.custom_service_assignments
  DROP CONSTRAINT IF EXISTS custom_service_assignments_custom_service_id_assignment_date_user_id_key;

ALTER TABLE public.custom_service_assignments
  ADD CONSTRAINT custom_service_assignments_unique_member_role_per_service
  UNIQUE(custom_service_id, assignment_date, user_id, role);
