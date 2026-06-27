-- Authoritative roster lookup for DATE-based push notifications (reminders).
--
-- Unlike get_setlist_notifiable_user_ids (which is keyed off a draft set and
-- expands the weekend Sat<->Sun pair), this function answers a simpler question:
--   "Who is on the effective roster for a given calendar date, campus and
--    ministry type?"
--
-- It is the single source of truth for the serving-today reminder and the
-- Video team's 10-days-out reminder. It applies rotation periods, service-day
-- matching, date overrides and accepted swaps, mirroring the setlist RPC.
--
-- Parameters:
--   p_schedule_date  the exact date to evaluate (no weekend-pair expansion)
--   p_campus_id      campus filter; NULL also matches campus-agnostic rows
--   p_ministry_type  ministry filter; NULL = every ministry scheduled that day.
--                    When a weekend alias is passed, all weekend aliases match.

CREATE OR REPLACE FUNCTION public.get_roster_notifiable_user_ids(
  p_schedule_date date,
  p_campus_id uuid DEFAULT NULL,
  p_ministry_type text DEFAULT NULL
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
    weekend_aliases AS (
      SELECT unnest(ARRAY['weekend', 'sunday_am', 'weekend_team']) AS value
    ),
    support_ministries AS (
      SELECT unnest(ARRAY['production', 'video']) AS value
    ),

    -- The single date we are evaluating, plus its expected service_day label.
    target AS (
      SELECT
        p_schedule_date AS service_date,
        CASE
          WHEN EXTRACT(DOW FROM p_schedule_date) = 6 THEN 'saturday'
          WHEN EXTRACT(DOW FROM p_schedule_date) = 0 THEN 'sunday'
          ELSE NULL
        END AS service_day
    ),

    eligible_schedule_rows AS (
      SELECT DISTINCT ts.team_id, ts.schedule_date, ts.ministry_type
      FROM team_schedule ts
      WHERE ts.schedule_date = p_schedule_date
        AND (p_campus_id IS NULL OR ts.campus_id = p_campus_id OR ts.campus_id IS NULL)
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

    rot AS (
      SELECT array_agg(rp.id) AS ids
      FROM rotation_periods rp
      WHERE (p_campus_id IS NULL OR rp.campus_id = p_campus_id)
        AND p_schedule_date BETWEEN rp.start_date AND rp.end_date
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
          OR tm.service_day = (SELECT service_day FROM target)
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
        ON esr.team_id       = tdo.team_id
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
      SELECT sr.requester_id AS uid, sr.position
      FROM swap_requests sr
      WHERE sr.original_date = p_schedule_date
        AND sr.status = 'accepted'
        AND sr.team_id IN (SELECT team_id FROM eligible_schedule_rows)
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.requester_id AND br.position = sr.position
        )
      UNION
      SELECT sr.accepted_by_id AS uid, sr.position
      FROM swap_requests sr
      WHERE sr.swap_date = p_schedule_date
        AND sr.status        = 'accepted'
        AND sr.accepted_by_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.accepted_by_id AND br.position = sr.position
        )
    ),

    swapped_in AS (
      SELECT sr.accepted_by_id AS uid
      FROM swap_requests sr
      WHERE sr.original_date = p_schedule_date
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
      WHERE sr.swap_date = p_schedule_date
        AND sr.status    = 'accepted'
        AND EXISTS (
          SELECT 1 FROM base_roster br
          WHERE br.user_id = sr.accepted_by_id AND br.position = sr.position
        )
    ),

    roster_users AS (
      SELECT DISTINCT br.user_id
      FROM base_roster br
      WHERE NOT EXISTS (
          SELECT 1 FROM swapped_out so
          WHERE so.uid = br.user_id AND so.position = br.position
        )
        AND (
          br.service_day IS NULL
          OR br.service_day = (SELECT service_day FROM target)
        )
        AND (
          p_ministry_type IS NULL
          OR br.ministry_types IS NULL
          OR array_length(br.ministry_types, 1) IS NULL
          OR p_ministry_type = ANY(br.ministry_types)
          OR (
            p_ministry_type IN (SELECT value FROM weekend_aliases)
            AND EXISTS (
              SELECT 1 FROM unnest(br.ministry_types) AS mt(value)
              WHERE mt.value IN (SELECT value FROM weekend_aliases)
            )
          )
          OR (
            p_ministry_type IN (SELECT value FROM support_ministries)
            AND p_ministry_type = ANY(br.ministry_types)
          )
        )

      UNION

      SELECT DISTINCT si.uid AS user_id
      FROM swapped_in si
      WHERE si.uid IS NOT NULL
    )

  SELECT user_id FROM roster_users WHERE user_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_roster_notifiable_user_ids(date, uuid, text)
  TO authenticated, service_role;
