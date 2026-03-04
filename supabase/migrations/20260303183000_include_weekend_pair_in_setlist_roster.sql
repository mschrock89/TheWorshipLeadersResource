-- Keep setlist confirmation eligibility aligned with the roster UI for weekend swaps.
-- Weekend swaps are treated as covering both Saturday and Sunday, and team schedule
-- resolution already follows that behavior in the frontend roster queries.

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
      -- Custom services: assignment table is source of truth for roster.
      SELECT 1
      FROM draft_sets ds
      JOIN custom_service_assignments csa
        ON csa.custom_service_id = ds.custom_service_id
       AND csa.assignment_date = ds.plan_date
      WHERE ds.id = p_draft_set_id
        AND ds.custom_service_id IS NOT NULL
        AND csa.user_id = p_user_id
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
      service_dates AS (
        SELECT ds.plan_date::date AS service_date
        FROM ds
        UNION
        SELECT CASE
          WHEN EXTRACT(DOW FROM ds.plan_date::date) = 6 THEN (ds.plan_date::date + INTERVAL '1 day')::date
          WHEN EXTRACT(DOW FROM ds.plan_date::date) = 0 THEN (ds.plan_date::date - INTERVAL '1 day')::date
          ELSE NULL::date
        END AS service_date
        FROM ds
      ),
      teams AS (
        SELECT DISTINCT ts.team_id
        FROM team_schedule ts
        CROSS JOIN ds
        WHERE ts.schedule_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
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
        WHERE sr.original_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
        UNION
        SELECT sr.accepted_by_id AS uid
        FROM swap_requests sr
        WHERE sr.swap_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.accepted_by_id IN (SELECT user_id FROM base_roster)
      ),
      swapped_in AS (
        SELECT sr.accepted_by_id AS uid
        FROM swap_requests sr
        WHERE sr.original_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.accepted_by_id IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM teams)
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
        UNION
        SELECT sr.requester_id AS uid
        FROM swap_requests sr
        WHERE sr.swap_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
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
