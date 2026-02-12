-- Restrict setlist confirmations to users on the team roster for that setlist.
-- Users can still SEE any upcoming setlist for their campus/ministry; they can only CONFIRM if they are
-- on the team roster (scheduled team + rotation + swaps) for that setlist's date/campus/ministry.

-- Function: true if the given user is on the effective team roster for the given draft set
-- (scheduled team for that date/campus, rotation periods, minus swapped out, plus swapped in; ministry_type match).
CREATE OR REPLACE FUNCTION public.is_user_on_setlist_roster(p_draft_set_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ds AS (
    SELECT campus_id, plan_date, ministry_type
    FROM draft_sets
    WHERE id = p_draft_set_id
  ),
  team AS (
    SELECT ts.team_id
    FROM team_schedule ts
    CROSS JOIN ds
    WHERE ts.schedule_date = ds.plan_date
      AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
    ORDER BY (ts.campus_id IS NOT NULL) DESC
    LIMIT 1
  ),
  rot AS (
    SELECT array_agg(rp.id) AS ids
    FROM rotation_periods rp
    CROSS JOIN ds
    WHERE rp.campus_id = ds.campus_id
      AND ds.plan_date BETWEEN rp.start_date AND rp.end_date
  ),
  base_roster AS (
    SELECT tm.user_id, tm.ministry_types
    FROM team_members tm
    CROSS JOIN team
    CROSS JOIN rot
    WHERE tm.team_id = team.team_id
      AND tm.rotation_period_id = ANY(rot.ids)
      AND tm.user_id IS NOT NULL
  ),
  swapped_out AS (
    SELECT sr.requester_id AS uid
    FROM swap_requests sr
    CROSS JOIN ds
    WHERE sr.original_date = ds.plan_date
      AND sr.status = 'accepted'
      AND sr.requester_id IN (SELECT user_id FROM base_roster)
  ),
  swapped_in AS (
    SELECT sr.accepted_by_id AS uid
    FROM swap_requests sr
    CROSS JOIN ds
    WHERE sr.original_date = ds.plan_date
      AND sr.status = 'accepted'
      AND sr.accepted_by_id IS NOT NULL
      AND sr.requester_id IN (SELECT user_id FROM base_roster)
    UNION
    SELECT sr.requester_id AS uid
    FROM swap_requests sr
    CROSS JOIN ds
    WHERE sr.swap_date = ds.plan_date
      AND sr.status = 'accepted'
      AND sr.swap_date IS NOT NULL
      AND sr.accepted_by_id IN (SELECT user_id FROM base_roster)
  ),
  effective_roster AS (
    SELECT br.user_id, br.ministry_types
    FROM base_roster br
    WHERE br.user_id NOT IN (SELECT uid FROM swapped_out)
    UNION
    SELECT si.uid AS user_id, NULL::text[] AS ministry_types
    FROM swapped_in si
    WHERE si.uid IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM effective_roster er
    CROSS JOIN ds
    WHERE er.user_id = p_user_id
      AND (
        er.ministry_types IS NULL
        OR array_length(er.ministry_types, 1) IS NULL
        OR ds.ministry_type = ANY(er.ministry_types)
      )
  );
$$;

-- Drop the permissive insert policy and replace with roster check
DROP POLICY IF EXISTS "Users can confirm their own setlists" ON public.setlist_confirmations;

CREATE POLICY "Users can confirm setlist only if on roster"
ON public.setlist_confirmations
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_user_on_setlist_roster(draft_set_id, user_id)
);
