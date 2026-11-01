-- Private notes on each Live service-flow line.
-- Each person only sees and edits their own notes.
-- Admins, production managers, and video directors get this from the
-- permissions matrix (live_line_notes). Production and video volunteers get
-- it from their campus assignment, because those teams are not roles.
-- An explicit user override revoke blocks both paths.

INSERT INTO public.capabilities (key, label, category, description) VALUES
  (
    'live_line_notes',
    'Live line notes',
    'Content',
    'Add a private note on each Live service-flow line. Each person only sees their own. Production and video volunteers at a campus can use this from their team assignment; other roles are granted here.'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin', 'live_line_notes', 'all'),
  ('production_manager', 'live_line_notes', 'all'),
  ('video_director', 'live_line_notes', 'all')
ON CONFLICT (role, capability_key, resource_app) DO NOTHING;

-- Assignment-only check. Does not use user_can_access_*_live, because those
-- also return true for admin, production_manager, and video_director. Role
-- access stays on the capability so the permissions matrix can change it.
CREATE OR REPLACE FUNCTION public.user_can_use_live_line_notes(_user_id uuid, _campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.user_capability_overrides o
      WHERE o.user_id = _user_id
        AND o.capability_key = 'live_line_notes'
        AND o.granted = false
        AND (o.expires_at IS NULL OR o.expires_at > now())
    )
    AND (
      public.has_capability(_user_id, 'live_line_notes')
      OR EXISTS (
        SELECT 1
        FROM public.user_ministry_campuses umc
        WHERE umc.user_id = _user_id
          AND umc.campus_id = _campus_id
          AND umc.ministry_type IN ('production', 'ms_hs_production', 'hs_production', 'video')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_campus_ministry_positions ucmp
        WHERE ucmp.user_id = _user_id
          AND ucmp.campus_id = _campus_id
          AND (
            ucmp.ministry_type IN ('production', 'ms_hs_production', 'hs_production', 'video')
            OR ucmp.position IN (
              'sound_tech',
              'mon',
              'producer',
              'lighting',
              'media',
              'broadcast',
              'audio_shadow',
              'tri_pod_camera',
              'tri_pod_camera_1',
              'tri_pod_camera_2',
              'tri_pod_camera_3',
              'tri_pod_camera_4',
              'hand_held_camera',
              'hand_held_camera_1',
              'hand_held_camera_2',
              'hand_held_camera_3',
              'hand_held_camera_4',
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
              'switcher_4'
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_use_live_line_notes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_use_live_line_notes(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.live_line_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_flow_item_id uuid NOT NULL REFERENCES public.service_flow_items(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_flow_item_id)
);

CREATE INDEX IF NOT EXISTS live_line_notes_user_item_idx
  ON public.live_line_notes (user_id, service_flow_item_id);

CREATE TRIGGER trg_live_line_notes_updated_at
BEFORE UPDATE ON public.live_line_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_line_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_line_notes TO authenticated;
GRANT ALL ON public.live_line_notes TO service_role;

CREATE POLICY "Users can view their live line notes"
  ON public.live_line_notes
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_flow_items item
      JOIN public.service_flows flow ON flow.id = item.service_flow_id
      WHERE item.id = service_flow_item_id
        AND public.user_can_use_live_line_notes(auth.uid(), flow.campus_id)
    )
  );

CREATE POLICY "Users can add their live line notes"
  ON public.live_line_notes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_flow_items item
      JOIN public.service_flows flow ON flow.id = item.service_flow_id
      WHERE item.id = service_flow_item_id
        AND public.user_can_use_live_line_notes(auth.uid(), flow.campus_id)
    )
  );

CREATE POLICY "Users can update their live line notes"
  ON public.live_line_notes
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_flow_items item
      JOIN public.service_flows flow ON flow.id = item.service_flow_id
      WHERE item.id = service_flow_item_id
        AND public.user_can_use_live_line_notes(auth.uid(), flow.campus_id)
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_flow_items item
      JOIN public.service_flows flow ON flow.id = item.service_flow_id
      WHERE item.id = service_flow_item_id
        AND public.user_can_use_live_line_notes(auth.uid(), flow.campus_id)
    )
  );

CREATE POLICY "Users can delete their live line notes"
  ON public.live_line_notes
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.service_flow_items item
      JOIN public.service_flows flow ON flow.id = item.service_flow_id
      WHERE item.id = service_flow_item_id
        AND public.user_can_use_live_line_notes(auth.uid(), flow.campus_id)
    )
  );

ALTER TABLE public.live_line_notes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'live_line_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_line_notes;
  END IF;
END $$;
