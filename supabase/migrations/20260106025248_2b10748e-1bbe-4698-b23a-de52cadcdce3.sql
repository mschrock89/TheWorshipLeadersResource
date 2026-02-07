-- Add admin_campus_id to user_roles to track which campus a campus_admin manages
ALTER TABLE public.user_roles ADD COLUMN admin_campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.user_roles.admin_campus_id IS 'For campus_admin role, specifies which campus they administer';