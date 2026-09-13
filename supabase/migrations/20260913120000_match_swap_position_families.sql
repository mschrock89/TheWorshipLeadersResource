-- Open ("ask my position group") swap/cover requests store Team Builder slot
-- labels on swap_requests.position ("Vocalist 1", "EG 2", "Tri-Pod Camera 1").
-- Campus assignments in user_campus_ministry_positions store the family label
-- ("Vocalist", "EG 1", "Tri-Pod Camera"). Visibility required an exact token
-- match, so the rest of the position group never saw the request.
--
-- Canonicalize both sides into a position family before comparing.

CREATE OR REPLACE FUNCTION public.canonical_swap_position(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  token text := public.normalize_position_token(p_value);
BEGIN
  IF token = '' THEN
    RETURN '';
  END IF;

  IF token IN ('vocalist', 'lead_vocals', 'harmony_vocals', 'background_vocals', 'vocals')
     OR token ~ '^vocalist_[0-9]+$' THEN
    RETURN 'vocalist';
  END IF;

  IF token IN ('electric_guitar', 'electric')
     OR token ~ '^electric_[0-9]+$'
     OR token ~ '^eg_?[0-9]+$' THEN
    RETURN 'electric_guitar';
  END IF;

  IF token IN ('acoustic_guitar', 'acoustic')
     OR token ~ '^acoustic_[0-9]+$'
     OR token ~ '^ag_?[0-9]+$' THEN
    RETURN 'acoustic_guitar';
  END IF;

  IF token IN ('sound_tech', 'foh', 'front_of_house') THEN
    RETURN 'sound_tech';
  END IF;

  IF token IN ('media', 'lyrics', 'propresenter') THEN
    RETURN 'media';
  END IF;

  IF token IN ('lighting', 'lights') THEN
    RETURN 'lighting';
  END IF;

  IF token IN ('announcement', 'announcements') THEN
    RETURN 'announcement';
  END IF;

  IF token IN ('closing_prayer', 'closer') THEN
    RETURN 'closing_prayer';
  END IF;

  IF token IN ('broadcast', 'broadcast_mix') THEN
    RETURN 'broadcast';
  END IF;

  IF token = 'tri_pod_camera'
     OR token ~ '^tri_pod_camera_[0-9]+$'
     OR token ~ '^camera_[0-9]+$' THEN
    RETURN 'tri_pod_camera';
  END IF;

  IF token = 'hand_held_camera' OR token ~ '^hand_held_camera_[0-9]+$' THEN
    RETURN 'hand_held_camera';
  END IF;

  IF token = 'director' OR token ~ '^director_[0-9]+$' THEN
    RETURN 'director';
  END IF;

  IF token = 'graphics' OR token ~ '^graphics_[0-9]+$' THEN
    RETURN 'graphics';
  END IF;

  IF token IN ('switcher', 'video_switcher') OR token ~ '^switcher_[0-9]+$' THEN
    RETURN 'switcher';
  END IF;

  RETURN token;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_positions_match(_left text, _right text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    public.canonical_swap_position(_left) <> ''
    AND public.canonical_swap_position(_left) = public.canonical_swap_position(_right);
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
        _left IN ('weekend', 'weekend_team', 'sunday_am', 'speaker')
        AND _right IN ('weekend', 'weekend_team', 'sunday_am', 'speaker')
      )
    );
$$;

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
              OR public.swap_positions_match(ucmp.position, _position)
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

GRANT EXECUTE ON FUNCTION public.canonical_swap_position(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.swap_positions_match(text, text) TO authenticated, service_role;
