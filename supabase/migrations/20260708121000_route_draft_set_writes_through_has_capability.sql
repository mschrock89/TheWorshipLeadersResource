-- Permissions cutover, part 1 (draft_sets INSERT = the "plan a set" gate).
--
-- Replaces the hand-maintained has_role() OR-chain on the draft_sets INSERT
-- policy with a single has_capability(...,'plan_set') check. Because the Phase 1
-- seed grants plan_set to exactly the roles this policy used to list — and
-- has_capability keeps admin_full as a break-glass superset — this is
-- behavior-preserving. Reversible: re-run the prior migration's policy body to
-- roll back.
--
-- The owner-based UPDATE/DELETE policies ("Users can update/delete their own
-- draft sets or admins can update/delete any") are ownership checks, not a
-- capability, so they are intentionally left untouched here.

DROP POLICY IF EXISTS "Campus admins and pastors can create draft sets" ON public.draft_sets;
CREATE POLICY "Campus admins and pastors can create draft sets" ON public.draft_sets
FOR INSERT WITH CHECK (
  public.has_capability(auth.uid(), 'plan_set', 'all')
);
