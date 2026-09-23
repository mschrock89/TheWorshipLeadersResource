-- Weekend Worship teams no longer carry Teacher / Announcements / Closing Prayer.
-- Those slots belong only to the independent Speakers ministry. Remove leftover
-- weekend-tagged speaker rows (they duplicate the Speakers assignment and still
-- show old Weekend dates on My Schedule) and convert any remaining speaker-slot
-- rows to ministry_type = speaker.

-- Drop leftover Weekend copies when a Speakers row already exists for the same slot.
DELETE FROM public.team_members leftover
WHERE (
    lower(coalesce(leftover.position_slot, '')) IN ('teacher', 'announcement', 'closing_prayer')
    OR lower(coalesce(leftover.position, '')) IN (
      'teacher', 'announcement', 'announcements', 'closing_prayer', 'closer'
    )
  )
  AND leftover.ministry_types && ARRAY['weekend', 'weekend_team', 'sunday_am']::text[]
  AND EXISTS (
    SELECT 1
    FROM public.team_members keeper
    WHERE keeper.id <> leftover.id
      AND keeper.team_id = leftover.team_id
      AND keeper.rotation_period_id IS NOT DISTINCT FROM leftover.rotation_period_id
      AND keeper.position_slot IS NOT DISTINCT FROM leftover.position_slot
      AND keeper.service_day IS NOT DISTINCT FROM leftover.service_day
      AND 'speaker' = ANY (COALESCE(keeper.ministry_types, ARRAY[]::text[]))
  );

DELETE FROM public.team_member_date_overrides leftover
WHERE (
    lower(coalesce(leftover.position_slot, '')) IN ('teacher', 'announcement', 'closing_prayer')
    OR lower(coalesce(leftover.position, '')) IN (
      'teacher', 'announcement', 'announcements', 'closing_prayer', 'closer'
    )
  )
  AND leftover.ministry_types && ARRAY['weekend', 'weekend_team', 'sunday_am']::text[]
  AND EXISTS (
    SELECT 1
    FROM public.team_member_date_overrides keeper
    WHERE keeper.id <> leftover.id
      AND keeper.team_id = leftover.team_id
      AND keeper.rotation_period_id IS NOT DISTINCT FROM leftover.rotation_period_id
      AND keeper.position_slot IS NOT DISTINCT FROM leftover.position_slot
      AND keeper.schedule_date = leftover.schedule_date
      AND 'speaker' = ANY (COALESCE(keeper.ministry_types, ARRAY[]::text[]))
  );

-- Remaining speaker-slot rows become Speakers-only.
UPDATE public.team_members
SET ministry_types = ARRAY['speaker']
WHERE (
    lower(coalesce(position_slot, '')) IN ('teacher', 'announcement', 'closing_prayer')
    OR lower(coalesce(position, '')) IN (
      'teacher', 'announcement', 'announcements', 'closing_prayer', 'closer'
    )
  )
  AND (
    ministry_types IS NULL
    OR array_length(ministry_types, 1) IS NULL
    OR ministry_types <> ARRAY['speaker']::text[]
  );

UPDATE public.team_member_date_overrides
SET ministry_types = ARRAY['speaker']
WHERE (
    lower(coalesce(position_slot, '')) IN ('teacher', 'announcement', 'closing_prayer')
    OR lower(coalesce(position, '')) IN (
      'teacher', 'announcement', 'announcements', 'closing_prayer', 'closer'
    )
  )
  AND (
    ministry_types IS NULL
    OR array_length(ministry_types, 1) IS NULL
    OR ministry_types <> ARRAY['speaker']::text[]
  );

-- Weekend rotation drafts should not keep speaker slots on the Weekend team card.
UPDATE public.team_rotation_drafts
SET assignments = COALESCE((
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(COALESCE(assignments, '[]'::jsonb)) elem
  WHERE NOT (
    lower(coalesce(elem->>'position_slot', '')) IN ('teacher', 'announcement', 'closing_prayer')
    OR lower(coalesce(elem->>'position', '')) IN (
      'teacher', 'announcement', 'announcements', 'closing_prayer', 'closer'
    )
  )
), '[]'::jsonb)
WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am');

-- Campus position lists should not keep Speaker roles under Weekend Worship.
DELETE FROM public.user_campus_ministry_positions
WHERE ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
  AND lower(position) IN (
    'teacher',
    'announcement',
    'announcements',
    'closing_prayer',
    'closer'
  );
