-- Keep setlist playlist visibility aligned with the roster UI by honoring
-- per-date team member overrides. Split-role assignments are often stored in
-- team_member_date_overrides instead of the base team_members roster.

CREATE OR REPLACE FUNCTION public.is_user_on_setlist_roster(p_draft_set_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM draft_sets ds
      JOIN audition_setlist_assignments asa ON asa.draft_set_id = ds.id
      WHERE ds.id = p_draft_set_id
        AND ds.ministry_type = 'audition'
        AND asa.user_id = p_user_id
    )
    OR
    EXISTS (
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
      support_ministries AS (
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
      eligible_schedule_rows AS (
        SELECT DISTINCT ts.team_id, ts.schedule_date, ts.ministry_type
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
              AND ts.ministry_type IN (SELECT value FROM weekend_aliases)
            )
            OR ts.ministry_type IN (SELECT value FROM support_ministries)
          )
      ),
      rot AS (
        SELECT array_agg(rp.id) AS ids
        FROM rotation_periods rp
        CROSS JOIN ds
        WHERE rp.campus_id = ds.campus_id
          AND ds.plan_date BETWEEN rp.start_date AND rp.end_date
      ),
      base_assignments AS (
        SELECT DISTINCT
          tm.user_id,
          tm.position,
          tm.position_slot,
          tm.ministry_types,
          tm.service_day,
          esr.team_id,
          esr.schedule_date
        FROM team_members tm
        JOIN eligible_schedule_rows esr
          ON esr.team_id = tm.team_id
        CROSS JOIN rot
        WHERE (
            tm.rotation_period_id IS NULL
            OR tm.rotation_period_id = ANY(COALESCE(rot.ids, ARRAY[]::uuid[]))
          )
          AND tm.user_id IS NOT NULL
          AND (
            tm.service_day IS NULL
            OR tm.service_day = CASE
              WHEN EXTRACT(DOW FROM esr.schedule_date::date) = 6 THEN 'saturday'
              WHEN EXTRACT(DOW FROM esr.schedule_date::date) = 0 THEN 'sunday'
              ELSE NULL
            END
          )
      ),
      date_overrides AS (
        SELECT DISTINCT
          tdo.user_id,
          tdo.position,
          tdo.position_slot,
          tdo.ministry_types,
          NULL::text AS service_day,
          tdo.team_id,
          tdo.schedule_date
        FROM team_member_date_overrides tdo
        JOIN eligible_schedule_rows esr
          ON esr.team_id = tdo.team_id
         AND esr.schedule_date = tdo.schedule_date
        CROSS JOIN rot
        WHERE (
            tdo.rotation_period_id IS NULL
            OR tdo.rotation_period_id = ANY(COALESCE(rot.ids, ARRAY[]::uuid[]))
          )
          AND tdo.user_id IS NOT NULL
      ),
      base_roster AS (
        SELECT
          ba.user_id,
          ba.position,
          ba.position_slot,
          ba.ministry_types,
          ba.service_day
        FROM base_assignments ba
        WHERE NOT EXISTS (
          SELECT 1
          FROM date_overrides override_row
          WHERE override_row.team_id = ba.team_id
            AND override_row.schedule_date = ba.schedule_date
            AND override_row.position_slot = ba.position_slot
        )
        UNION
        SELECT
          override_row.user_id,
          override_row.position,
          override_row.position_slot,
          override_row.ministry_types,
          override_row.service_day
        FROM date_overrides override_row
      ),
      swapped_out AS (
        SELECT sr.requester_id AS uid, sr.position
        FROM swap_requests sr
        WHERE sr.original_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
          AND EXISTS (
            SELECT 1
            FROM base_roster br
            WHERE br.user_id = sr.requester_id
              AND br.position = sr.position
          )
        UNION
        SELECT sr.accepted_by_id AS uid, sr.position
        FROM swap_requests sr
        WHERE sr.swap_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.accepted_by_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM base_roster br
            WHERE br.user_id = sr.accepted_by_id
              AND br.position = sr.position
          )
      ),
      swapped_in AS (
        SELECT sr.accepted_by_id AS uid, sr.position
        FROM swap_requests sr
        WHERE sr.original_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.accepted_by_id IS NOT NULL
          AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
          AND EXISTS (
            SELECT 1
            FROM base_roster br
            WHERE br.user_id = sr.requester_id
              AND br.position = sr.position
          )
        UNION
        SELECT sr.requester_id AS uid, sr.position
        FROM swap_requests sr
        WHERE sr.swap_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM base_roster br
            WHERE br.user_id = sr.accepted_by_id
              AND br.position = sr.position
          )
      ),
      effective_roster AS (
        SELECT br.user_id, br.position, br.position_slot, br.ministry_types, br.service_day
        FROM base_roster br
        WHERE NOT EXISTS (
          SELECT 1
          FROM swapped_out so
          WHERE so.uid = br.user_id
            AND so.position = br.position
        )
        UNION
        SELECT si.uid AS user_id, si.position, NULL::text AS position_slot, NULL::text[] AS ministry_types, NULL::text AS service_day
        FROM swapped_in si
        WHERE si.uid IS NOT NULL
      )
      SELECT 1
      FROM effective_roster er
      CROSS JOIN ds
      WHERE er.user_id = p_user_id
        AND (
          er.service_day IS NULL
          OR EXISTS (
            SELECT 1
            FROM service_dates sd
            WHERE sd.service_date IS NOT NULL
              AND er.service_day = CASE
                WHEN EXTRACT(DOW FROM sd.service_date) = 6 THEN 'saturday'
                WHEN EXTRACT(DOW FROM sd.service_date) = 0 THEN 'sunday'
                ELSE NULL
              END
          )
        )
        AND (
          er.ministry_types IS NULL
          OR array_length(er.ministry_types, 1) IS NULL
          OR ds.ministry_type = ANY(er.ministry_types)
          OR (
            ds.ministry_type IN (SELECT value FROM weekend_aliases)
            AND EXISTS (
              SELECT 1
              FROM unnest(er.ministry_types) AS member_ministry(value)
              WHERE member_ministry.value IN (SELECT value FROM weekend_aliases)
            )
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(er.ministry_types) AS member_ministry(value)
            WHERE member_ministry.value IN (SELECT value FROM support_ministries)
          )
        )
    );
$$;
