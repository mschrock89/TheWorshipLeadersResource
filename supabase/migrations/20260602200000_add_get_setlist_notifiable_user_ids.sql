-- Returns the set of user IDs who are on the effective roster for a given draft set.
-- This is the authoritative source for push-notification recipients: it handles all
-- set types (audition, custom service, team builder), applies swaps, date overrides,
-- weekend-pair expansion, Kids Camp ministry normalisation, and support-team inclusion
-- in a single query — replacing the previous two-step approach of
-- getScheduledRecipientUserIds + N+1 is_user_on_setlist_roster calls.

CREATE OR REPLACE FUNCTION public.get_setlist_notifiable_user_ids(p_draft_set_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
    -- ── core set metadata ──────────────────────────────────────────────────────
    ds AS (
      SELECT
        d.id,
        d.campus_id,
        d.plan_date,
        d.ministry_type,
        d.custom_service_id,
        CASE
          WHEN d.ministry_type IN ('kids_camp', 'kids_camp_morning', 'kids_camp_afternoon')
            THEN 'kids_camp'
          ELSE d.ministry_type
        END AS roster_ministry_type
      FROM draft_sets d
      WHERE d.id = p_draft_set_id
    ),

    -- ── Branch 1 – audition sets ───────────────────────────────────────────────
    audition_users AS (
      SELECT DISTINCT asa.user_id
      FROM ds
      JOIN audition_setlist_assignments asa ON asa.draft_set_id = ds.id
      WHERE ds.ministry_type = 'audition'
        AND asa.user_id IS NOT NULL
    ),

    -- ── Branch 2 – custom service sets (non-Kids-Camp) ────────────────────────
    custom_service_users AS (
      SELECT DISTINCT csa.user_id
      FROM ds
      JOIN custom_service_assignments csa
        ON csa.custom_service_id = ds.custom_service_id
       AND csa.assignment_date    = ds.plan_date
      WHERE ds.custom_service_id IS NOT NULL
        AND ds.ministry_type NOT IN ('kids_camp', 'kids_camp_morning', 'kids_camp_afternoon')
        AND csa.user_id IS NOT NULL
    ),

    -- ── Branch 3 – team-builder roster (all other types, including Kids Camp) ──

    weekend_aliases AS (
      SELECT unnest(ARRAY['weekend', 'sunday_am', 'weekend_team']) AS value
    ),
    support_ministries AS (
      SELECT unnest(ARRAY['production', 'video']) AS value
    ),

    -- Both days of the same weekend cluster are checked (Sat ↔ Sun)
    service_dates AS (
      SELECT ds.plan_date::date AS service_date FROM ds
      UNION
      SELECT
        CASE
          WHEN EXTRACT(DOW FROM ds.plan_date::date) = 6
            THEN (ds.plan_date::date + INTERVAL '1 day')::date
          WHEN EXTRACT(DOW FROM ds.plan_date::date) = 0
            THEN (ds.plan_date::date - INTERVAL '1 day')::date
          ELSE NULL::date
        END
      FROM ds
    ),

    eligible_schedule_rows AS (
      SELECT DISTINCT ts.team_id, ts.schedule_date, ts.ministry_type
      FROM team_schedule ts
      CROSS JOIN ds
      WHERE ts.schedule_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
        AND (
          ts.ministry_type = ds.roster_ministry_type
          OR ts.ministry_type IS NULL
          OR (
            ds.roster_ministry_type IN (SELECT value FROM weekend_aliases)
            AND ts.ministry_type    IN (SELECT value FROM weekend_aliases)
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
      JOIN eligible_schedule_rows esr ON esr.team_id = tm.team_id
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
        ON esr.team_id      = tdo.team_id
       AND esr.schedule_date = tdo.schedule_date
      CROSS JOIN rot
      WHERE (
          tdo.rotation_period_id IS NULL
          OR tdo.rotation_period_id = ANY(COALESCE(rot.ids, ARRAY[]::uuid[]))
        )
        AND tdo.user_id IS NOT NULL
    ),

    -- Date overrides replace the base slot for the same position_slot on the same day
    base_roster AS (
      SELECT
        ba.user_id, ba.position, ba.position_slot,
        ba.ministry_types, ba.service_day, ba.team_id, ba.schedule_date
      FROM base_assignments ba
      WHERE NOT EXISTS (
        SELECT 1
        FROM date_overrides dov
        WHERE dov.team_id       = ba.team_id
          AND dov.schedule_date = ba.schedule_date
          AND dov.position_slot = ba.position_slot
      )
      UNION ALL
      SELECT
        dov.user_id, dov.position, dov.position_slot,
        dov.ministry_types, dov.service_day, dov.team_id, dov.schedule_date
      FROM date_overrides dov
    ),

    -- People who are no longer serving on this date due to an accepted swap
    swapped_out AS (
      SELECT sr.requester_id AS uid, sr.position
      FROM swap_requests sr
      WHERE sr.original_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status = 'accepted'
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.requester_id AND br.position = sr.position
        )
      UNION
      SELECT sr.accepted_by_id AS uid, sr.position
      FROM swap_requests sr
      WHERE sr.swap_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status        = 'accepted'
        AND sr.swap_date     IS NOT NULL
        AND sr.accepted_by_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.accepted_by_id AND br.position = sr.position
        )
    ),

    -- People who are now serving on this date due to an accepted swap
    swapped_in AS (
      SELECT sr.accepted_by_id AS uid
      FROM swap_requests sr
      WHERE sr.original_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status         = 'accepted'
        AND sr.accepted_by_id IS NOT NULL
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.requester_id AND br.position = sr.position
        )
      UNION
      SELECT sr.requester_id AS uid
      FROM swap_requests sr
      WHERE sr.swap_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status    = 'accepted'
        AND sr.swap_date IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.accepted_by_id AND br.position = sr.position
        )
    ),

    team_builder_users AS (
      -- Still-active base roster members that pass ministry / service-day filters
      SELECT DISTINCT br.user_id
      FROM base_roster br
      CROSS JOIN ds
      WHERE NOT EXISTS (
          SELECT 1 FROM swapped_out so
          WHERE so.uid = br.user_id AND so.position = br.position
        )
        AND (
          br.service_day IS NULL
          OR EXISTS (
            SELECT 1
            FROM service_dates sd
            WHERE sd.service_date IS NOT NULL
              AND br.service_day = CASE
                WHEN EXTRACT(DOW FROM sd.service_date) = 6 THEN 'saturday'
                WHEN EXTRACT(DOW FROM sd.service_date) = 0 THEN 'sunday'
                ELSE NULL
              END
          )
        )
        AND (
          br.ministry_types IS NULL
          OR array_length(br.ministry_types, 1) IS NULL
          OR ds.roster_ministry_type = ANY(br.ministry_types)
          OR (
            ds.roster_ministry_type IN (SELECT value FROM weekend_aliases)
            AND EXISTS (
              SELECT 1 FROM unnest(br.ministry_types) AS mt(value)
              WHERE mt.value IN (SELECT value FROM weekend_aliases)
            )
          )
          OR EXISTS (
            SELECT 1 FROM unnest(br.ministry_types) AS mt(value)
            WHERE mt.value IN (SELECT value FROM support_ministries)
          )
        )

      UNION

      -- Swapped-in cover/swap recipients
      SELECT DISTINCT si.uid AS user_id
      FROM swapped_in si
      WHERE si.uid IS NOT NULL
    )

  -- ── Combine all branches ──────────────────────────────────────────────────
  SELECT user_id FROM audition_users      WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM custom_service_users WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM team_builder_users   WHERE user_id IS NOT NULL
$$;
