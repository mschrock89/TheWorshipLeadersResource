-- Fix foreign keys that block deleting a user/profile.
--
-- Several columns reference profiles(id) or auth.users(id) with the default
-- ON DELETE NO ACTION. When the user being deleted is referenced anywhere
-- (e.g. they approved a setlist, created an album, locked a team), deleting the
-- auth user fails with a foreign-key violation and the delete-profile edge
-- function returns a generic 500 ("edge function failed").
--
-- These are all "who did this" history columns, so ON DELETE SET NULL preserves
-- the record while allowing the user to be removed.

-- draft_sets.approved_by -> profiles(id)
ALTER TABLE public.draft_sets
  DROP CONSTRAINT IF EXISTS draft_sets_approved_by_fkey;
ALTER TABLE public.draft_sets
  ADD CONSTRAINT draft_sets_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- setlist_approvals.submitted_by -> profiles(id) (was NOT NULL)
ALTER TABLE public.setlist_approvals
  ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.setlist_approvals
  DROP CONSTRAINT IF EXISTS setlist_approvals_submitted_by_fkey;
ALTER TABLE public.setlist_approvals
  ADD CONSTRAINT setlist_approvals_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- setlist_approvals.approver_id -> profiles(id)
ALTER TABLE public.setlist_approvals
  DROP CONSTRAINT IF EXISTS setlist_approvals_approver_id_fkey;
ALTER TABLE public.setlist_approvals
  ADD CONSTRAINT setlist_approvals_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- albums.created_by -> auth.users(id)
ALTER TABLE public.albums
  DROP CONSTRAINT IF EXISTS albums_created_by_fkey;
ALTER TABLE public.albums
  ADD CONSTRAINT albums_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- team_period_locks.locked_by -> auth.users(id)
ALTER TABLE public.team_period_locks
  DROP CONSTRAINT IF EXISTS team_period_locks_locked_by_fkey;
ALTER TABLE public.team_period_locks
  ADD CONSTRAINT team_period_locks_locked_by_fkey
  FOREIGN KEY (locked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- service_flow_templates.created_by -> profiles(id)
ALTER TABLE public.service_flow_templates
  DROP CONSTRAINT IF EXISTS service_flow_templates_created_by_fkey;
ALTER TABLE public.service_flow_templates
  ADD CONSTRAINT service_flow_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- service_flows.created_by -> profiles(id)
ALTER TABLE public.service_flows
  DROP CONSTRAINT IF EXISTS service_flows_created_by_fkey;
ALTER TABLE public.service_flows
  ADD CONSTRAINT service_flows_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- break_requests.reviewed_by -> auth.users(id)
ALTER TABLE public.break_requests
  DROP CONSTRAINT IF EXISTS break_requests_reviewed_by_fkey;
ALTER TABLE public.break_requests
  ADD CONSTRAINT break_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
