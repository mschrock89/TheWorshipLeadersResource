-- Persist the position/order of a user's base roles.
--
-- The ManageBaseRoles dialog lets admins pick a primary, 2nd, and 3rd base
-- role, but user_roles had no ordering column. On reload the roles came back
-- in arbitrary DB order, so the assigned positions were lost and "volunteer"
-- tended to float to the primary slot. This column lets us store and restore
-- the exact slot each base role was assigned to.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;
