-- Swap and cover requests are scoped to a campus + ministry assignment, not just
-- a shared team number. Team 4 at Murfreesboro Central is scheduled for Weekend
-- Worship, Production, and Video on the same date, so looking up ANY team_schedule
-- row for that team leaked Weekend Worship requests to people only assigned to
-- Production or Video. Store campus/ministry on the request and require the
-- viewer to be assigned to that ministry.

ALTER TABLE public.swap_requests
  ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ministry_type text;

CREATE INDEX IF NOT EXISTS swap_requests_campus_ministry_status_idx
  ON public.swap_requests (campus_id, ministry_type, status);

CREATE OR REPLACE FUNCTION public.inferred_swap_ministry_type(_position text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.normalize_position_token(_position) IN (
      'sound_tech',
      'foh',
      'front_of_house',
      'mon',
      'broadcast',
      'broadcast_mix',
      'audio_shadow',
      'lighting',
      'lights',
      'media',
      'lyrics',
      'propresenter',
      'producer',
      'stage_manager'
    ) THEN 'production'
    WHEN public.normalize_position_token(_position) IN (
      'tri_pod_camera',
      'camera_1',
      'camera_2',
      'camera_3',
      'camera_4',
      'camera_5',
      'camera_6',
      'hand_held_camera',
      'director',
      'director_2',
      'director_3',
      'director_4',
      'graphics',
      'graphics_2',
      'graphics_3',
      'graphics_4',
      'switcher',
      'switcher_2',
      'switcher_3',
      'switcher_4',
      'video_switcher',
      'other'
    ) THEN 'video'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.swap_ministry_types_match(_left text, _right text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    _left IS NOT NULL
    AND _right IS NOT NULL
    AND (
      _left = _right
      OR (
        _left IN ('weekend', 'weekend_team', 'sunday_am')
        AND _right IN ('weekend', 'weekend_team', 'sunday_am')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.resolve_swap_request_campus_ministry(
  _team_id uuid,
  _original_date date,
  _position text,
  _campus_id uuid DEFAULT NULL,
  _ministry_type text DEFAULT NULL
)
RETURNS TABLE(campus_id uuid, ministry_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH preferred AS (
    SELECT COALESCE(
      public.inferred_swap_ministry_type(_position),
      NULLIF(btrim(_ministry_type), '')
    ) AS ministry_type
  ),
  schedule_rows AS (
    SELECT
      ts.campus_id,
      ts.ministry_type,
      ts.created_at,
      CASE
        WHEN _campus_id IS NOT NULL AND ts.campus_id = _campus_id THEN 2
        WHEN ts.campus_id IS NULL THEN 1
        ELSE 0
      END AS campus_rank,
      CASE
        WHEN preferred.ministry_type IS NOT NULL
          AND public.swap_ministry_types_match(ts.ministry_type, preferred.ministry_type)
          THEN 2
        WHEN preferred.ministry_type IS NULL
          AND ts.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
          THEN 1
        ELSE 0
      END AS ministry_rank
    FROM public.team_schedule ts
    CROSS JOIN preferred
    WHERE ts.team_id = _team_id
      AND ts.schedule_date = _original_date
  ),
  best_schedule AS (
    SELECT schedule_rows.campus_id, schedule_rows.ministry_type
    FROM schedule_rows
    ORDER BY schedule_rows.ministry_rank DESC, schedule_rows.campus_rank DESC, schedule_rows.created_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT
    COALESCE(_campus_id, best_schedule.campus_id) AS campus_id,
    COALESCE(
      public.inferred_swap_ministry_type(_position),
      NULLIF(btrim(_ministry_type), ''),
      best_schedule.ministry_type
    ) AS ministry_type
  FROM (SELECT 1) AS seed
  LEFT JOIN best_schedule ON TRUE;
$$;

CREATE OR REPLACE FUNCTION public.trg_fill_swap_request_campus_ministry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved record;
BEGIN
  SELECT *
  INTO resolved
  FROM public.resolve_swap_request_campus_ministry(
    NEW.team_id,
    NEW.original_date,
    NEW.position,
    NEW.campus_id,
    NEW.ministry_type
  );

  NEW.campus_id := resolved.campus_id;
  NEW.ministry_type := resolved.ministry_type;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_swap_request_campus_ministry ON public.swap_requests;
CREATE TRIGGER trg_fill_swap_request_campus_ministry
BEFORE INSERT OR UPDATE OF team_id, original_date, position, campus_id, ministry_type
ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_fill_swap_request_campus_ministry();

-- Touch every row so the fill trigger backfills campus_id and ministry_type.
UPDATE public.swap_requests
SET position = position;

CREATE OR REPLACE FUNCTION public.viewer_can_manage_swap_ministry(
  _viewer_id uuid,
  _ministry_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_viewer_id, 'admin'::app_role)
    OR public.has_role(_viewer_id, 'campus_admin'::app_role)
    OR public.has_role(_viewer_id, 'campus_worship_pastor'::app_role)
    OR public.has_role(_viewer_id, 'network_worship_pastor'::app_role)
    OR public.has_role(_viewer_id, 'network_worship_leader'::app_role)
    OR public.has_role(_viewer_id, 'student_pastor'::app_role)
    OR public.has_role(_viewer_id, 'network_student_pastor'::app_role)
    OR public.has_role(_viewer_id, 'student_worship_pastor'::app_role)
    OR (
      COALESCE(_ministry_type, '') = 'video'
      AND public.has_role(_viewer_id, 'video_director'::app_role)
    )
    OR (
      COALESCE(_ministry_type, '') IN ('production', 'ms_hs_production', 'hs_production')
      AND public.has_role(_viewer_id, 'production_manager'::app_role)
    );
$$;

DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Assigned users can view accepted swaps in their campus ministry" ON public.swap_requests;
DROP POLICY IF EXISTS "Video directors can view all swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;
DROP FUNCTION IF EXISTS public.viewer_matches_swap_request_scope(uuid, uuid, date, text, boolean);

CREATE OR REPLACE FUNCTION public.viewer_matches_swap_request_scope(
  _viewer_id uuid,
  _team_id uuid,
  _original_date date,
  _position text,
  _require_position boolean DEFAULT false,
  _campus_id uuid DEFAULT NULL,
  _ministry_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT campus_id, ministry_type
    FROM public.resolve_swap_request_campus_ministry(
      _team_id,
      _original_date,
      _position,
      _campus_id,
      _ministry_type
    )
  )
  SELECT EXISTS (
    SELECT 1
    FROM scoped
    WHERE scoped.campus_id IS NOT NULL
      AND scoped.ministry_type IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_campus_ministry_positions ucmp
          WHERE ucmp.user_id = _viewer_id
            AND ucmp.campus_id = scoped.campus_id
            AND public.swap_ministry_types_match(ucmp.ministry_type, scoped.ministry_type)
            AND (
              NOT _require_position
              OR public.normalize_position_token(ucmp.position)
                = public.normalize_position_token(_position)
              OR (
                public.normalize_position_token(_position) IN (
                  'vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals'
                )
                AND public.normalize_position_token(ucmp.position) IN (
                  'vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals'
                )
              )
            )
        )
        OR (
          NOT _require_position
          AND EXISTS (
            SELECT 1
            FROM public.user_ministry_campuses umc
            WHERE umc.user_id = _viewer_id
              AND umc.campus_id = scoped.campus_id
              AND public.swap_ministry_types_match(umc.ministry_type, scoped.ministry_type)
          )
        )
      )
  );
$$;

CREATE POLICY "Users can view ministry-scoped swap requests"
ON public.swap_requests
FOR SELECT
USING (
  auth.uid() = requester_id
  OR auth.uid() = target_user_id
  OR auth.uid() = accepted_by_id
  OR (
    target_user_id IS NULL
    AND status = 'pending'::swap_request_status
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      true,
      campus_id,
      ministry_type
    )
  )
  OR (
    status = 'accepted'::swap_request_status
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      false,
      campus_id,
      ministry_type
    )
  )
  OR (
    public.viewer_can_manage_swap_ministry(auth.uid(), ministry_type)
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      false,
      campus_id,
      ministry_type
    )
  )
);

CREATE POLICY "Users can update relevant swap requests"
ON public.swap_requests
FOR UPDATE
USING (
  ((auth.uid() = requester_id) AND (status = 'pending'::swap_request_status))
  OR ((auth.uid() = target_user_id) AND (status = 'pending'::swap_request_status))
  OR (
    target_user_id IS NULL
    AND status = 'pending'::swap_request_status
    AND auth.uid() <> requester_id
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      true,
      campus_id,
      ministry_type
    )
  )
  OR (
    public.viewer_can_manage_swap_ministry(auth.uid(), ministry_type)
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      false,
      campus_id,
      ministry_type
    )
  )
)
WITH CHECK (
  ((auth.uid() = requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'cancelled'::swap_request_status])))
  OR ((auth.uid() <> requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'accepted'::swap_request_status, 'declined'::swap_request_status])))
  OR (
    public.viewer_can_manage_swap_ministry(auth.uid(), ministry_type)
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      false,
      campus_id,
      ministry_type
    )
  )
);

GRANT EXECUTE ON FUNCTION public.inferred_swap_ministry_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_ministry_types_match(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_swap_request_campus_ministry(uuid, date, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewer_can_manage_swap_ministry(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewer_matches_swap_request_scope(uuid, uuid, date, text, boolean, uuid, text) TO authenticated, service_role;
