-- Setlist confirmation eligibility (is_user_on_setlist_roster) and publish-notification
-- recipients (get_setlist_notifiable_user_ids) gated team membership on service_day with
-- an exact saturday/sunday comparison:
--
--   tm.service_day IS NULL
--   OR tm.service_day = CASE WHEN DOW = 6 THEN 'saturday'
--                           WHEN DOW = 0 THEN 'sunday'
--                           ELSE NULL END
--
-- On a WEEKDAY service date the CASE evaluates to NULL, so `tm.service_day = NULL` is never
-- true and every member with a non-null service_day (e.g. weekend volunteers whose row is
-- tagged 'saturday' / 'sunday' / 'both' / 'weekend') was dropped from the roster. Student Camp
-- (and any mid-week session set) runs Mon-Fri, so volunteers who clearly appear on the
-- Team Builder schedule could not confirm their setlist -- the confirm RLS rejected the insert
-- with "you can only confirm setlists you're scheduled for".
--
-- The client roster logic (assignmentMatchesServiceDay) already treats a weekday date as
-- "service_day does not gate eligibility" and treats 'both'/'weekend' as always-matching, which
-- is why the schedule UI showed the volunteer while the RPC disagreed. Align the database with
-- the client via a shared helper.

CREATE OR REPLACE FUNCTION public.service_day_matches_date(p_service_day text, p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  -- Mirrors the client assignmentMatchesServiceDay helper:
  --   * no service_day            -> matches
  --   * 'both' / 'weekend'        -> matches
  --   * weekday service date      -> service_day does not gate (matches)
  --   * weekend service date      -> service_day must equal that day's saturday/sunday
  SELECT CASE
    WHEN p_service_day IS NULL THEN true
    WHEN lower(p_service_day) IN ('both', 'weekend') THEN true
    WHEN EXTRACT(DOW FROM p_date) = 6 THEN lower(p_service_day) = 'saturday'
    WHEN EXTRACT(DOW FROM p_date) = 0 THEN lower(p_service_day) = 'sunday'
    ELSE true
  END;
$$;


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
        AND ds.ministry_type NOT IN (
          'kids_camp', 'kids_camp_morning', 'kids_camp_afternoon',
          'student_camp', 'student_camp_morning', 'student_camp_evening'
        )
        AND csa.user_id = p_user_id
    )
    OR
    EXISTS (
      WITH weekend_aliases AS (
        SELECT unnest(ARRAY['weekend','sunday_am','weekend_team']) AS value
      ),
      session_set_ministries AS (
        SELECT unnest(ARRAY[
          'kids_camp','kids_camp_morning','kids_camp_afternoon',
          'student_camp','student_camp_morning','student_camp_evening'
        ]) AS value
      ),
      support_ministries AS (
        SELECT unnest(ARRAY['production','video']) AS value
      ),
      ds AS (
        SELECT
          campus_id,
          plan_date,
          ministry_type,
          CASE
            WHEN ministry_type IN (SELECT value FROM session_set_ministries)
              THEN regexp_replace(ministry_type, '_(morning|afternoon|evening)$', '')
            ELSE ministry_type
          END AS roster_ministry_type
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
        SELECT DISTINCT
          ts.team_id,
          ts.schedule_date,
          ts.ministry_type,
          CASE
            WHEN ts.ministry_type IN (SELECT value FROM session_set_ministries)
              THEN regexp_replace(ts.ministry_type, '_(morning|afternoon|evening)$', '')
            ELSE ts.ministry_type
          END AS roster_ministry_type
        FROM team_schedule ts
        CROSS JOIN ds
        WHERE ts.schedule_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
          AND (
            CASE
              WHEN ts.ministry_type IN (SELECT value FROM session_set_ministries)
                THEN regexp_replace(ts.ministry_type, '_(morning|afternoon|evening)$', '')
              ELSE ts.ministry_type
            END = ds.roster_ministry_type
            OR ts.ministry_type IS NULL
            OR (
              ds.roster_ministry_type IN (SELECT value FROM weekend_aliases)
              AND ts.ministry_type IN (SELECT value FROM weekend_aliases)
            )
            OR ts.ministry_type IN (SELECT value FROM support_ministries)
          )
          AND public.support_schedule_has_weekend_anchor(
            ts.team_id,
            ts.schedule_date,
            ts.rotation_period,
            ts.campus_id,
            ts.ministry_type
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
          AND public.service_day_matches_date(tm.service_day, esr.schedule_date::date)
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
        SELECT sr.requester_id AS uid, br.position
        FROM swap_requests sr
        JOIN base_roster br
          ON br.user_id = sr.requester_id
         AND (
           public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
           OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
         )
        WHERE sr.original_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
        UNION
        SELECT sr.accepted_by_id AS uid, br.position
        FROM swap_requests sr
        JOIN base_roster br
          ON br.user_id = sr.accepted_by_id
         AND (
           public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
           OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
         )
        WHERE sr.swap_date IN (
          SELECT service_date
          FROM service_dates
          WHERE service_date IS NOT NULL
        )
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.accepted_by_id IS NOT NULL
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
              AND (
                public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
                OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
              )
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
              AND (
                public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
                OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
              )
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
        AND EXISTS (
          SELECT 1
          FROM service_dates sd
          WHERE sd.service_date IS NOT NULL
            AND public.service_day_matches_date(er.service_day, sd.service_date)
        )
        AND (
          er.ministry_types IS NULL
          OR array_length(er.ministry_types, 1) IS NULL
          OR ds.roster_ministry_type = ANY(er.ministry_types)
          OR EXISTS (
            SELECT 1
            FROM unnest(er.ministry_types) AS member_ministry(value)
            WHERE regexp_replace(member_ministry.value, '_(morning|afternoon|evening)$', '') = ds.roster_ministry_type
          )
          OR (
            ds.roster_ministry_type IN (SELECT value FROM weekend_aliases)
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


CREATE OR REPLACE FUNCTION public.get_setlist_notifiable_user_ids(p_draft_set_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
    ds AS (
      SELECT
        d.id,
        d.campus_id,
        d.plan_date,
        d.ministry_type,
        d.custom_service_id,
        CASE
          WHEN d.ministry_type IN (
            'kids_camp', 'kids_camp_morning', 'kids_camp_afternoon',
            'student_camp', 'student_camp_morning', 'student_camp_evening'
          )
            THEN regexp_replace(d.ministry_type, '_(morning|afternoon|evening)$', '')
          ELSE d.ministry_type
        END AS roster_ministry_type
      FROM draft_sets d
      WHERE d.id = p_draft_set_id
    ),

    audition_users AS (
      SELECT DISTINCT asa.user_id
      FROM ds
      JOIN audition_setlist_assignments asa ON asa.draft_set_id = ds.id
      WHERE ds.ministry_type = 'audition'
        AND asa.user_id IS NOT NULL
    ),

    custom_service_users AS (
      SELECT DISTINCT csa.user_id
      FROM ds
      JOIN custom_service_assignments csa
        ON csa.custom_service_id = ds.custom_service_id
       AND csa.assignment_date    = ds.plan_date
      WHERE ds.custom_service_id IS NOT NULL
        AND ds.ministry_type NOT IN (
          'kids_camp', 'kids_camp_morning', 'kids_camp_afternoon',
          'student_camp', 'student_camp_morning', 'student_camp_evening'
        )
        AND csa.user_id IS NOT NULL
    ),

    weekend_aliases AS (
      SELECT unnest(ARRAY['weekend', 'sunday_am', 'weekend_team']) AS value
    ),
    session_set_ministries AS (
      SELECT unnest(ARRAY[
        'kids_camp', 'kids_camp_morning', 'kids_camp_afternoon',
        'student_camp', 'student_camp_morning', 'student_camp_evening'
      ]) AS value
    ),
    support_ministries AS (
      SELECT unnest(ARRAY['production', 'video']) AS value
    ),

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
      SELECT DISTINCT
        ts.team_id,
        ts.schedule_date,
        ts.ministry_type,
        CASE
          WHEN ts.ministry_type IN (SELECT value FROM session_set_ministries)
            THEN regexp_replace(ts.ministry_type, '_(morning|afternoon|evening)$', '')
          ELSE ts.ministry_type
        END AS roster_ministry_type
      FROM team_schedule ts
      CROSS JOIN ds
      WHERE ts.schedule_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
        AND (
          CASE
            WHEN ts.ministry_type IN (SELECT value FROM session_set_ministries)
              THEN regexp_replace(ts.ministry_type, '_(morning|afternoon|evening)$', '')
            ELSE ts.ministry_type
          END = ds.roster_ministry_type
          OR ts.ministry_type IS NULL
          OR (
            ds.roster_ministry_type IN (SELECT value FROM weekend_aliases)
            AND ts.ministry_type    IN (SELECT value FROM weekend_aliases)
          )
          OR ts.ministry_type IN (SELECT value FROM support_ministries)
        )
        AND public.support_schedule_has_weekend_anchor(
          ts.team_id,
          ts.schedule_date,
          ts.rotation_period,
          ts.campus_id,
          ts.ministry_type
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
        AND public.service_day_matches_date(tm.service_day, esr.schedule_date::date)
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

    swapped_out AS (
      SELECT sr.requester_id AS uid, br.position
      FROM swap_requests sr
      JOIN base_roster br
        ON br.user_id = sr.requester_id
       AND (
         public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
         OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
       )
      WHERE sr.original_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status = 'accepted'
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
      UNION
      SELECT sr.accepted_by_id AS uid, br.position
      FROM swap_requests sr
      JOIN base_roster br
        ON br.user_id = sr.accepted_by_id
       AND (
         public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
         OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
       )
      WHERE sr.swap_date IN (
          SELECT service_date FROM service_dates WHERE service_date IS NOT NULL
        )
        AND sr.status        = 'accepted'
        AND sr.swap_date     IS NOT NULL
        AND sr.accepted_by_id IS NOT NULL
    ),

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
          WHERE br.user_id = sr.requester_id
            AND (
              public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
              OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
            )
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
          WHERE br.user_id = sr.accepted_by_id
            AND (
              public.normalize_position_token(br.position) = public.normalize_position_token(sr.position)
              OR public.normalize_position_token(br.position_slot) = public.normalize_position_token(sr.position)
            )
        )
    ),

    team_builder_users AS (
      SELECT DISTINCT br.user_id
      FROM base_roster br
      CROSS JOIN ds
      WHERE NOT EXISTS (
          SELECT 1 FROM swapped_out so
          WHERE so.uid = br.user_id AND so.position = br.position
        )
        AND EXISTS (
          SELECT 1
          FROM service_dates sd
          WHERE sd.service_date IS NOT NULL
            AND public.service_day_matches_date(br.service_day, sd.service_date)
        )
        AND (
          br.ministry_types IS NULL
          OR array_length(br.ministry_types, 1) IS NULL
          OR ds.roster_ministry_type = ANY(br.ministry_types)
          OR EXISTS (
            SELECT 1 FROM unnest(br.ministry_types) AS mt(value)
            WHERE regexp_replace(mt.value, '_(morning|afternoon|evening)$', '') = ds.roster_ministry_type
          )
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

      SELECT DISTINCT si.uid AS user_id
      FROM swapped_in si
      WHERE si.uid IS NOT NULL
    )

  SELECT user_id FROM audition_users      WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM custom_service_users WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM team_builder_users   WHERE user_id IS NOT NULL
$$;
