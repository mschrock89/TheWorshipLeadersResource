-- Drop the existing unique constraint that prevents multiple campus_admin roles per user
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;

-- Add a new unique constraint that allows multiple campus_admin roles per user (one per campus)
-- This ensures a user can't have duplicate roles for the same campus, but CAN have multiple campus_admin roles for different campuses
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_campus_key 
  UNIQUE (user_id, role, admin_campus_id);

-- Add a comment for clarity
COMMENT ON CONSTRAINT user_roles_user_id_role_campus_key ON public.user_roles IS 'Allows users to have multiple campus_admin roles (one per campus) while preventing duplicate role assignments';