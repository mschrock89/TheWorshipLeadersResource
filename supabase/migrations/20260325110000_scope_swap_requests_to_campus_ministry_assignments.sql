-- Scope swap and cover request visibility to the request's campus/ministry assignment.
-- This closes the broad accepted-request read policy and ensures open requests only
-- surface to users who can actually serve within the same campus/ministry context.

CREATE OR REPLACE FUNCTION public.viewer_matches_swap_request_scope(
  _viewer_id uuid,
  _team_id uuid,
  _original_date date,
  _position text,
  _require_position boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_schedule ts
    WHERE ts.team_id = _team_id
      AND ts.schedule_date = _original_date
      AND ts.campus_id IS NOT NULL
      AND ts.ministry_type IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_campus_ministry_positions ucmp
          WHERE ucmp.user_id = _viewer_id
            AND ucmp.campus_id = ts.campus_id
            AND (
              ucmp.ministry_type = ts.ministry_type
              OR (
                ts.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
                AND ucmp.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
              )
            )
            AND (
              NOT _require_position
              OR ucmp.position = _position
              OR (
                _position IN ('vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals')
                AND ucmp.position IN ('vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals')
              )
            )
        )
        OR (
          NOT _require_position
          AND EXISTS (
            SELECT 1
            FROM public.user_ministry_campuses umc
            WHERE umc.user_id = _viewer_id
              AND umc.campus_id = ts.campus_id
              AND (
                umc.ministry_type = ts.ministry_type
                OR (
                  ts.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
                  AND umc.ministry_type IN ('weekend', 'weekend_team', 'sunday_am')
                )
              )
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view relevant swap requests" ON public.swap_requests;

CREATE POLICY "Users can view relevant swap requests"
ON public.swap_requests
FOR SELECT
USING (
  auth.uid() = requester_id
  OR auth.uid() = target_user_id
  OR auth.uid() = accepted_by_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    target_user_id IS NULL
    AND status = 'pending'::swap_request_status
    AND public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      true
    )
  )
);

DROP POLICY IF EXISTS "Users can update relevant swap requests" ON public.swap_requests;

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
      true
    )
  )
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  ((auth.uid() = requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'cancelled'::swap_request_status])))
  OR ((auth.uid() <> requester_id) AND (status = ANY (ARRAY['pending'::swap_request_status, 'accepted'::swap_request_status, 'declined'::swap_request_status])))
  OR has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Leaders can view accepted swaps for their campus" ON public.swap_requests;
DROP POLICY IF EXISTS "All users can view accepted swaps for roster display" ON public.swap_requests;

CREATE POLICY "Assigned users can view accepted swaps in their campus ministry"
ON public.swap_requests
FOR SELECT
USING (
  status = 'accepted'::swap_request_status
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid() = requester_id
    OR auth.uid() = target_user_id
    OR auth.uid() = accepted_by_id
    OR public.viewer_matches_swap_request_scope(
      auth.uid(),
      team_id,
      original_date,
      position,
      false
    )
  )
);
