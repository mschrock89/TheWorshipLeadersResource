-- Align playlist visibility with actual setlist roster logic (including swaps + weekend support teams).

CREATE OR REPLACE FUNCTION public.is_user_on_setlist_roster(p_draft_set_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      -- Audition setlists: explicitly assigned users are on roster.
      SELECT 1
      FROM draft_sets ds
      JOIN audition_setlist_assignments asa ON asa.draft_set_id = ds.id
      WHERE ds.id = p_draft_set_id
        AND ds.ministry_type = 'audition'
        AND asa.user_id = p_user_id
    )
    OR
    EXISTS (
      WITH weekend_aliases AS (
        SELECT unnest(ARRAY['weekend','sunday_am','weekend_team']) AS value
      ),
      weekend_support AS (
        SELECT unnest(ARRAY['production','video']) AS value
      ),
      ds AS (
        SELECT campus_id, plan_date, ministry_type
        FROM draft_sets
        WHERE id = p_draft_set_id
      ),
      teams AS (
        SELECT DISTINCT ts.team_id
        FROM team_schedule ts
        CROSS JOIN ds
        WHERE ts.schedule_date = ds.plan_date
          AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
          AND (
            ts.ministry_type = ds.ministry_type
            OR ts.ministry_type IS NULL
            OR (
              ds.ministry_type IN (SELECT value FROM weekend_aliases)
              AND ts.ministry_type IN (SELECT value FROM weekend_support)
            )
          )
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
        CROSS JOIN rot
        WHERE tm.team_id IN (SELECT team_id FROM teams)
          AND (
            tm.rotation_period_id IS NULL
            OR tm.rotation_period_id = ANY(COALESCE(rot.ids, ARRAY[]::uuid[]))
          )
          AND tm.user_id IS NOT NULL
      ),
      swapped_out AS (
        SELECT sr.requester_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.original_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
        UNION
        SELECT sr.accepted_by_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.swap_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.accepted_by_id IN (SELECT user_id FROM base_roster)
      ),
      swapped_in AS (
        SELECT sr.accepted_by_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.original_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.accepted_by_id IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
        UNION
        SELECT sr.requester_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.swap_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM teams)
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
      SELECT 1
      FROM effective_roster er
      CROSS JOIN ds
      WHERE er.user_id = p_user_id
        AND (
          er.ministry_types IS NULL
          OR array_length(er.ministry_types, 1) IS NULL
          OR ds.ministry_type = ANY(er.ministry_types)
          OR (
            ds.ministry_type IN (SELECT value FROM weekend_aliases)
            AND EXISTS (
              SELECT 1
              FROM unnest(er.ministry_types) AS member_ministry(value)
              WHERE member_ministry.value IN (SELECT value FROM weekend_support)
            )
          )
        )
    );
$$;

DROP POLICY IF EXISTS "Users can view their scheduled playlists" ON public.setlist_playlists;
CREATE POLICY "Users can view their scheduled playlists"
ON public.setlist_playlists
FOR SELECT
USING (
  is_user_on_setlist_roster(draft_set_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.audition_setlist_assignments asa
    WHERE asa.draft_set_id = setlist_playlists.draft_set_id
      AND asa.user_id = auth.uid()
  )
);
