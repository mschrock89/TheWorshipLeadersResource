-- Fix "You're Serving Today!" reminders notifying the wrong people on the wrong day.
--
-- Symptom: a production/FOH volunteer on a team (e.g. Austin Kursave on Team 1)
-- received a "serving today" push on a weekday, even though his production
-- assignment is actually the upcoming weekend. Team 1 merely had *some* schedule
-- row that day for a different ministry.
--
-- Root cause: the daily reminder (notify-schedule-reminder) and the video reminder
-- call get_roster_notifiable_user_ids with p_ministry_type = NULL, which disabled
-- the ministry filter completely. A member was then treated as "scheduled" for a
-- date whenever *any* team_schedule row existed for their team on that date, even
-- if the row's ministry_type had nothing to do with the member's ministry.
--
-- The Calendar UI already does the right thing (src/hooks/useMyTeamAssignments.tsx
-- assignmentMatchesMinistryTypes): a member only counts as scheduled on rows whose
-- ministry aligns with theirs. Production lights up on production rows, video on
-- video rows, and the weekend worship aliases (weekend / sunday_am / weekend_team /
-- speaker) are interchangeable with each other.
--
-- This migration carries each matched schedule row's ministry_type through the
-- roster CTEs and matches it against the member's ministry_types per row, so the
-- reminder uses the dates the member is actually scheduled -- regardless of whether
-- a p_ministry_type filter was supplied.

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
      SELECT unnest(ARRAY['weekend', 'sunday_am', 'weekend_team', 'speaker']) AS value
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
        esr.schedule_date,
        esr.ministry_type AS schedule_ministry_type
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
        tdo.schedule_date,
        esr.ministry_type AS schedule_ministry_type
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
        ba.ministry_types, ba.service_day, ba.team_id, ba.schedule_date,
        ba.schedule_ministry_type
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
        dov.ministry_types, dov.service_day, dov.team_id, dov.schedule_date,
        dov.schedule_ministry_type
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
        -- Match the member's ministry to THIS schedule row's ministry, mirroring
        -- the Calendar UI (assignmentMatchesMinistryTypes). Members with no ministry
        -- tags match any row; weekend aliases are interchangeable; production/video
        -- only match their own rows. This holds even when p_ministry_type is NULL.
        AND (
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

      UNION

      SELECT DISTINCT si.uid AS user_id
      FROM swapped_in si
      WHERE si.uid IS NOT NULL
    )

  SELECT user_id FROM roster_users WHERE user_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_roster_notifiable_user_ids(date, uuid, text)
  TO authenticated, service_role;
