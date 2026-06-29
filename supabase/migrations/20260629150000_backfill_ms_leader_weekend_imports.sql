-- Repair the MS Leader Weekend bulk import from 2026-06-29. The ms_leader_weekend
-- enum value did not exist on the database when those users were imported, so the
-- import deleted each new user's default volunteer role and then failed (silently)
-- to assign ms_leader_weekend, leaving the profiles with no base role at all.
--
-- Backfill scope is intentionally narrow: only profiles created today that
-- currently have zero rows in user_roles. A freshly created user normally always
-- has at least the default volunteer role, so a role-less profile created today
-- is one of these failed imports.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'ms_leader_weekend'::public.app_role
FROM public.profiles p
WHERE p.created_at >= CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
  );
