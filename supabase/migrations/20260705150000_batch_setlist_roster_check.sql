-- My Setlists resolved roster eligibility with one is_user_on_setlist_roster RPC
-- per published setlist, which turns into dozens-to-hundreds of sequential HTTP
-- round trips for users with months of history. Add a batched variant so the
-- client resolves every setlist in a single request. The per-set logic stays in
-- is_user_on_setlist_roster (single source of truth); this only removes the
-- network round trips.

CREATE OR REPLACE FUNCTION public.is_user_on_setlist_rosters(p_draft_set_ids uuid[], p_user_id uuid)
RETURNS TABLE (draft_set_id uuid, on_roster boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ids.id, public.is_user_on_setlist_roster(ids.id, p_user_id)
  FROM unnest(p_draft_set_ids) AS ids(id);
$$;

GRANT EXECUTE ON FUNCTION public.is_user_on_setlist_rosters(uuid[], uuid) TO authenticated;
