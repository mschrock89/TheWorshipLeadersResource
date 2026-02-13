CREATE TABLE IF NOT EXISTS public.audition_setlist_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_set_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_audition_assignments_user
  ON public.audition_setlist_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_audition_assignments_set
  ON public.audition_setlist_assignments(draft_set_id);

ALTER TABLE public.audition_setlist_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assignees can view audition assignments" ON public.audition_setlist_assignments;
CREATE POLICY "Assignees can view audition assignments"
ON public.audition_setlist_assignments
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Leaders can manage audition assignments" ON public.audition_setlist_assignments;
CREATE POLICY "Leaders can manage audition assignments"
ON public.audition_setlist_assignments
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);

DROP POLICY IF EXISTS "Assigned users can view audition draft sets" ON public.draft_sets;
CREATE POLICY "Assigned users can view audition draft sets"
ON public.draft_sets
FOR SELECT
USING (
  ministry_type = 'audition'
  AND EXISTS (
    SELECT 1
    FROM public.audition_setlist_assignments asa
    WHERE asa.draft_set_id = draft_sets.id
      AND asa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Assigned users can view audition draft set songs" ON public.draft_set_songs;
CREATE POLICY "Assigned users can view audition draft set songs"
ON public.draft_set_songs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.draft_sets ds
    JOIN public.audition_setlist_assignments asa
      ON asa.draft_set_id = ds.id
    WHERE ds.id = draft_set_songs.draft_set_id
      AND ds.ministry_type = 'audition'
      AND asa.user_id = auth.uid()
  )
);

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
      WITH ds AS (
        SELECT campus_id, plan_date, ministry_type
        FROM draft_sets
        WHERE id = p_draft_set_id
      ),
      team AS (
        SELECT ts.team_id
        FROM team_schedule ts
        CROSS JOIN ds
        WHERE ts.schedule_date = ds.plan_date
          AND (ts.campus_id = ds.campus_id OR ts.campus_id IS NULL)
        ORDER BY (ts.campus_id IS NOT NULL) DESC
        LIMIT 1
      ),
      rot AS (
        SELECT array_agg(rp.id) AS ids
        FROM rotation_periods rp
        CROSS JOIN ds
        WHERE rp.campus_id = ds.campus_id
          AND ds.plan_date BETWEEN rp.start_date AND rp.end_date
      ),
      base_roster AS (
        SELECT tm.user_id, tm.ministry_types
        FROM team_members tm
        CROSS JOIN team
        CROSS JOIN rot
        WHERE tm.team_id = team.team_id
          AND tm.rotation_period_id = ANY(rot.ids)
          AND tm.user_id IS NOT NULL
      ),
      swapped_out AS (
        SELECT sr.requester_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.original_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
      ),
      swapped_in AS (
        SELECT sr.accepted_by_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.original_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.accepted_by_id IS NOT NULL
          AND sr.requester_id IN (SELECT user_id FROM base_roster)
        UNION
        SELECT sr.requester_id AS uid
        FROM swap_requests sr
        CROSS JOIN ds
        WHERE sr.swap_date = ds.plan_date
          AND sr.status = 'accepted'
          AND sr.swap_date IS NOT NULL
          AND sr.accepted_by_id IN (SELECT user_id FROM base_roster)
      ),
      effective_roster AS (
        SELECT br.user_id, br.ministry_types
        FROM base_roster br
        WHERE br.user_id NOT IN (SELECT uid FROM swapped_out)
        UNION
        SELECT si.uid AS user_id, NULL::text[] AS ministry_types
        FROM swapped_in si
        WHERE si.uid IS NOT NULL
      )
      SELECT 1
      FROM effective_roster er
      CROSS JOIN ds
      WHERE er.user_id = p_user_id
        AND (
          er.ministry_types IS NULL
          OR array_length(er.ministry_types, 1) IS NULL
          OR ds.ministry_type = ANY(er.ministry_types)
        )
    );
$$;

DROP POLICY IF EXISTS "Users can view their scheduled playlists" ON public.setlist_playlists;
CREATE POLICY "Users can view their scheduled playlists"
ON public.setlist_playlists
FOR SELECT
USING (
  (
    service_date >= CURRENT_DATE
    AND is_scheduled_for_service(auth.uid(), service_date, campus_id, ministry_type)
  )
  OR EXISTS (
    SELECT 1
    FROM public.audition_setlist_assignments asa
    WHERE asa.draft_set_id = setlist_playlists.draft_set_id
      AND asa.user_id = auth.uid()
  )
);
