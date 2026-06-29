-- Ensure the 24 most recently imported users have MS Leader Weekend as their
-- primary (1st) base role. The bulk import that created them could not assign
-- ms_leader_weekend (the enum value was missing at the time), so their base role
-- was left wrong/empty. This sets ms_leader_weekend at sort_order 0 (the slot the
-- app reads as the primary base role) while preserving any elevated roles such as
-- admin / campus_admin / network_worship_leader.
DO $$
DECLARE
  target_ids uuid[];
  user_count int;
  assigned int;
BEGIN
  SELECT array_agg(id) INTO target_ids
  FROM (
    SELECT id FROM public.profiles ORDER BY created_at DESC LIMIT 24
  ) t;

  user_count := COALESCE(array_length(target_ids, 1), 0);
  RAISE NOTICE 'Targeting % most recently created profiles', user_count;

  IF user_count = 0 THEN
    RETURN;
  END IF;

  -- Clear replaceable base roles (mirrors the import's replaceableBaseRoles set;
  -- intentionally excludes admin / campus_admin / network_worship_leader).
  DELETE FROM public.user_roles
  WHERE user_id = ANY(target_ids)
    AND role IN (
      'leader','member','network_worship_pastor','campus_worship_pastor',
      'student_pastor','student_worship_pastor','childrens_pastor','speaker',
      'video_director','production_manager','creative_team_lead','audition_candidate',
      'student','ms_leader','ms_leader_weekend','hs_leader','volunteer'
    );

  -- Assign ms_leader_weekend as the primary base role.
  INSERT INTO public.user_roles (user_id, role, admin_campus_id, sort_order)
  SELECT unnest(target_ids), 'ms_leader_weekend'::public.app_role, NULL, 0;

  GET DIAGNOSTICS assigned = ROW_COUNT;
  RAISE NOTICE 'Assigned ms_leader_weekend (sort_order 0) to % users', assigned;
END $$;
