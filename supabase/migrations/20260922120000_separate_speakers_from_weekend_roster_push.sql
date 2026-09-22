-- Speakers now rotate independently from Weekend Worship. Keep the latest
-- cover / override roster logic, but stop treating speaker as a weekend alias
-- so leftover weekend dates and weekend worship pushes no longer include
-- speaker-only people, and speaker schedule rows notify speakers.

CREATE OR REPLACE FUNCTION public.get_roster_notifiable_assignments(
  p_schedule_date date,
  p_campus_id uuid DEFAULT NULL,
  p_ministry_type text DEFAULT NULL,
  p_team_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, assignment_position text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
    weekend_aliases AS (
      SELECT unnest(ARRAY['weekend', 'sunday_am', 'weekend_team']) AS value
    ),
    speaker_positions AS (
      SELECT unnest(ARRAY[
        'teacher',
        'announcement',
        'announcements',
        'closing_prayer',
        'closer'
      ]) AS value
    ),

    target AS (
      SELECT
        p_schedule_date AS service_date,
        CASE
          WHEN EXTRACT(DOW FROM p_schedule_date) = 6 THEN 'saturday'
          WHEN EXTRACT(DOW FROM p_schedule_date) = 0 THEN 'sunday'
          ELSE NULL
        END AS service_day
    ),

    -- Swaps and Team Builder Splits recorded on either day of the weekend pair
    -- apply to both services, matching Calendar / useTeamRosterForDate.
    weekend_match_dates AS (
      SELECT p_schedule_date AS service_date
      UNION
      SELECT CASE
        WHEN EXTRACT(DOW FROM p_schedule_date) = 6 THEN p_schedule_date + 1
        WHEN EXTRACT(DOW FROM p_schedule_date) = 0 THEN p_schedule_date - 1
        ELSE NULL
      END
    ),

    eligible_schedule_rows AS (
      SELECT DISTINCT ts.team_id, ts.schedule_date, ts.ministry_type, ts.rotation_period
      FROM team_schedule ts
      WHERE ts.schedule_date = p_schedule_date
        AND (p_campus_id IS NULL OR ts.campus_id = p_campus_id OR ts.campus_id IS NULL)
        AND (p_team_id IS NULL OR ts.team_id = p_team_id)
        AND (
          p_ministry_type IS NULL
          OR ts.ministry_type = p_ministry_type
          OR ts.ministry_type IS NULL
          OR (
            p_ministry_type IN (SELECT value FROM weekend_aliases)
            AND ts.ministry_type IN (SELECT value FROM weekend_aliases)
          )
        )
    ),

    schedule_rotation_names AS (
      SELECT DISTINCT rotation_period
      FROM eligible_schedule_rows
      WHERE rotation_period IS NOT NULL
        AND btrim(rotation_period) <> ''
    ),

    rot AS (
      SELECT COALESCE(
        (
          SELECT array_agg(DISTINCT rp.id)
          FROM rotation_periods rp
          JOIN schedule_rotation_names srn ON rp.name = srn.rotation_period
          WHERE p_campus_id IS NULL OR rp.campus_id = p_campus_id
        ),
        (
          SELECT array_agg(DISTINCT rp.id)
          FROM rotation_periods rp
          WHERE (p_campus_id IS NULL OR rp.campus_id = p_campus_id)
            AND p_schedule_date BETWEEN rp.start_date AND rp.end_date
        ),
        (
          SELECT array_agg(DISTINCT rp.id)
          FROM rotation_periods rp
          WHERE (p_campus_id IS NULL OR rp.campus_id = p_campus_id)
            AND rp.is_active = true
        ),
        ARRAY[]::uuid[]
      ) AS ids
    ),

    base_assignments AS (
      SELECT DISTINCT
        tm.user_id,
        tm.position AS member_position,
        tm.position_slot,
        tm.ministry_types,
        tm.service_day,
        esr.team_id,
        esr.schedule_date,
        esr.ministry_type AS schedule_ministry_type
      FROM team_members tm
      JOIN eligible_schedule_rows esr ON esr.team_id = tm.team_id
      CROSS JOIN rot
      WHERE tm.user_id IS NOT NULL
        AND COALESCE(array_length(rot.ids, 1), 0) > 0
        AND tm.rotation_period_id = ANY(rot.ids)
        AND (
          tm.service_day IS NULL
          OR tm.service_day = (SELECT service_day FROM target)
        )
    ),

    -- All date overrides on the weekend pair for eligible teams (including blanks).
    slot_overrides AS (
      SELECT DISTINCT
        tdo.user_id,
        tdo.position AS member_position,
        tdo.position_slot,
        tdo.ministry_types,
        tdo.member_name,
        tdo.team_id,
        esr.schedule_date,
        esr.ministry_type AS schedule_ministry_type
      FROM team_member_date_overrides tdo
      JOIN eligible_schedule_rows esr
        ON esr.team_id = tdo.team_id
      CROSS JOIN rot
      WHERE tdo.schedule_date IN (
          SELECT service_date FROM weekend_match_dates WHERE service_date IS NOT NULL
        )
        AND COALESCE(array_length(rot.ids, 1), 0) > 0
        AND tdo.rotation_period_id = ANY(rot.ids)
    ),

    suppressing_slots AS (
      SELECT DISTINCT team_id, schedule_date, position_slot
      FROM slot_overrides
      WHERE user_id IS NOT NULL
         OR member_name = '__TEAM_BUILDER_BLANK_SLOT__'
    ),

    date_overrides AS (
      SELECT DISTINCT
        so.user_id,
        so.member_position,
        so.position_slot,
        so.ministry_types,
        NULL::text AS service_day,
        so.team_id,
        so.schedule_date,
        so.schedule_ministry_type
      FROM slot_overrides so
      WHERE so.user_id IS NOT NULL
    ),

    base_roster AS (
      SELECT
        ba.user_id, ba.member_position, ba.position_slot,
        ba.ministry_types, ba.service_day, ba.team_id, ba.schedule_date,
        ba.schedule_ministry_type
      FROM base_assignments ba
      WHERE NOT EXISTS (
        SELECT 1
        FROM suppressing_slots ss
        WHERE ss.team_id       = ba.team_id
          AND ss.schedule_date = ba.schedule_date
          AND ss.position_slot = ba.position_slot
      )
      UNION ALL
      SELECT
        dov.user_id, dov.member_position, dov.position_slot,
        dov.ministry_types, dov.service_day, dov.team_id, dov.schedule_date,
        dov.schedule_ministry_type
      FROM date_overrides dov
    ),

    -- Roster rows that are actually effective for the notified service:
    -- service-day and ministry filters applied. Swaps are resolved against
    -- these rows so a cover vanishes when the covered slot was overridden.
    eligible_roster AS (
      SELECT br.user_id, br.member_position, br.team_id
      FROM base_roster br
      WHERE (
          br.service_day IS NULL
          OR br.service_day = (SELECT service_day FROM target)
        )
        AND (
          CASE
            WHEN COALESCE(br.schedule_ministry_type, 'weekend') = 'speaker' THEN
              EXISTS (
                SELECT 1
                FROM unnest(COALESCE(br.ministry_types, ARRAY[]::text[])) AS mt(value)
                WHERE mt.value = 'speaker'
              )
              OR (
                (br.ministry_types IS NULL OR array_length(br.ministry_types, 1) IS NULL)
                AND lower(COALESCE(br.member_position, '')) IN (SELECT value FROM speaker_positions)
              )
            ELSE
              (
                br.ministry_types IS NULL
                OR array_length(br.ministry_types, 1) IS NULL
                OR EXISTS (
                  SELECT 1
                  FROM unnest(br.ministry_types) AS mt(value)
                  WHERE (
                      CASE
                        WHEN mt.value IN (SELECT value FROM weekend_aliases) THEN 'weekend'
                        ELSE mt.value
                      END
                    ) = (
                      CASE
                        WHEN COALESCE(br.schedule_ministry_type, 'weekend')
                             IN (SELECT value FROM weekend_aliases) THEN 'weekend'
                        ELSE COALESCE(br.schedule_ministry_type, 'weekend')
                      END
                    )
                )
              )
              AND NOT (
                COALESCE(br.schedule_ministry_type, 'weekend') IN (SELECT value FROM weekend_aliases)
                AND (
                  (
                    EXISTS (
                      SELECT 1
                      FROM unnest(COALESCE(br.ministry_types, ARRAY[]::text[])) AS mt(value)
                      WHERE mt.value = 'speaker'
                    )
                    AND NOT EXISTS (
                      SELECT 1
                      FROM unnest(COALESCE(br.ministry_types, ARRAY[]::text[])) AS mt(value)
                      WHERE mt.value IN (SELECT value FROM weekend_aliases)
                    )
                  )
                  OR (
                    (br.ministry_types IS NULL OR array_length(br.ministry_types, 1) IS NULL)
                    AND lower(COALESCE(br.member_position, '')) IN (SELECT value FROM speaker_positions)
                  )
                )
              )
          END
        )
    ),

    swapped_out AS (
      SELECT sr.requester_id AS uid
      FROM swap_requests sr
      WHERE sr.original_date IN (
          SELECT service_date FROM weekend_match_dates WHERE service_date IS NOT NULL
        )
        AND sr.status = 'accepted'
        AND sr.accepted_by_id IS NOT NULL
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
      UNION
      SELECT sr.accepted_by_id AS uid
      FROM swap_requests sr
      WHERE sr.swap_date IN (
          SELECT service_date FROM weekend_match_dates WHERE service_date IS NOT NULL
        )
        AND sr.status = 'accepted'
        AND sr.accepted_by_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM eligible_roster er
          WHERE er.user_id = sr.accepted_by_id
        )
    ),

    filtered_roster AS (
      SELECT er.user_id, er.member_position, er.team_id
      FROM eligible_roster er
      WHERE NOT EXISTS (
          SELECT 1 FROM swapped_out so
          WHERE so.uid = er.user_id
        )
    ),

    -- Covering members inherit the covered person's effective positions for
    -- the push body (Calendar treats covers as a full takeover).
    cover_assignments AS (
      SELECT sr.accepted_by_id AS user_id, er.member_position
      FROM swap_requests sr
      JOIN eligible_roster er
        ON er.user_id = sr.requester_id
       AND er.team_id = sr.team_id
      WHERE sr.original_date IN (
          SELECT service_date FROM weekend_match_dates WHERE service_date IS NOT NULL
        )
        AND sr.status         = 'accepted'
        AND sr.accepted_by_id IS NOT NULL
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
      UNION
      SELECT sr.requester_id AS user_id, er.member_position
      FROM swap_requests sr
      JOIN eligible_roster er
        ON er.user_id = sr.accepted_by_id
      WHERE sr.swap_date IN (
          SELECT service_date FROM weekend_match_dates WHERE service_date IS NOT NULL
        )
        AND sr.status = 'accepted'
    ),

    roster_assignments AS (
      SELECT fr.user_id, fr.member_position
      FROM filtered_roster fr
      UNION
      SELECT ca.user_id, ca.member_position
      FROM cover_assignments ca
      WHERE ca.user_id IS NOT NULL
    )

  SELECT DISTINCT ra.user_id, ra.member_position AS assignment_position
  FROM roster_assignments ra
  WHERE ra.user_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_roster_notifiable_assignments(date, uuid, text, uuid)
  TO authenticated, service_role;
