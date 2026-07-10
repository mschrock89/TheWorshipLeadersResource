-- My Church Resource hub foundation, part 1: ministries + memberships.
--
-- Adds a top-level ministry dimension (worship / students_hs / students_ms)
-- that the hub's Team Directory and dashboards key on. This is deliberately
-- distinct from the existing free-text ministry_type values, which describe
-- sub-teams and chat contexts (weekend, production, eon, encounter, ...)
-- rather than ministry identity.
--
-- Additive only: no existing table, column, or policy changes.

-- Org-admin check shared by hub policies. campus_admin is included so campus
-- admins can manage hub data; refine to campus scoping when the hub UI lands.
CREATE OR REPLACE FUNCTION public.user_is_org_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'campus_admin')
  )
$$;

-- Which roles lead which ministry. Mirrors the frontend role model:
-- hasStudentAppAdminRole (student_pastor / network_student_pastor) plus the
-- hands-on leader roles that record serving numbers and manage rosters.
CREATE OR REPLACE FUNCTION public.user_leads_ministry(_user_id UUID, _ministry_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_is_org_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        (_ministry_key = 'worship' AND ur.role::text IN ('network_worship_pastor', 'campus_worship_pastor'))
        OR (_ministry_key = 'students_hs' AND ur.role::text IN ('network_student_pastor', 'student_pastor', 'hs_leader'))
        OR (_ministry_key = 'students_ms' AND ur.role::text IN ('network_student_pastor', 'student_pastor', 'ms_leader', 'ms_leader_weekend'))
      )
  )
$$;

CREATE TABLE public.ministries (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  resource_app_key TEXT NOT NULL REFERENCES public.resource_apps(key) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ministries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ministries"
  ON public.ministries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Org admins can manage ministries"
  ON public.ministries FOR ALL
  TO authenticated
  USING (public.user_is_org_admin(auth.uid()))
  WITH CHECK (public.user_is_org_admin(auth.uid()));

INSERT INTO public.ministries (key, name, resource_app_key)
VALUES
  ('worship', 'Worship', 'worship'),
  ('students_hs', 'Students HS', 'students_hs'),
  ('students_ms', 'Students MS', 'students_ms')
ON CONFLICT (key) DO NOTHING;

-- Canonical person <> ministry <> campus membership. The hub's Team Directory
-- reads and manages this; branch apps show only their ministry's members.
CREATE TABLE public.ministry_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ministry_key TEXT NOT NULL REFERENCES public.ministries(key) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ministry_key, campus_id)
);

CREATE INDEX idx_ministry_memberships_ministry_campus
  ON public.ministry_memberships (ministry_key, campus_id);
CREATE INDEX idx_ministry_memberships_user
  ON public.ministry_memberships (user_id);

ALTER TABLE public.ministry_memberships ENABLE ROW LEVEL SECURITY;

-- Read stays open to signed-in users, matching the existing profiles policy
-- ("Users can view all profiles"); membership rows carry no sensitive content.
CREATE POLICY "Authenticated users can view ministry memberships"
  ON public.ministry_memberships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Ministry leaders can add memberships"
  ON public.ministry_memberships FOR INSERT
  TO authenticated
  WITH CHECK (public.user_leads_ministry(auth.uid(), ministry_key));

CREATE POLICY "Ministry leaders can remove memberships"
  ON public.ministry_memberships FOR DELETE
  TO authenticated
  USING (public.user_leads_ministry(auth.uid(), ministry_key));

CREATE OR REPLACE FUNCTION public.user_in_ministry(_user_id UUID, _ministry_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ministry_memberships
    WHERE user_id = _user_id AND ministry_key = _ministry_key
  ) OR public.user_leads_ministry(_user_id, _ministry_key)
$$;

-- ---------------------------------------------------------------------------
-- Backfill. Two deterministic sources:
--
-- 1. Team assignments (user_ministry_campuses.ministry_type). The student-app
--    mapping mirrors src/lib/studentFlow.ts: encounter -> HS, eon/eon_weekend
--    -> MS, student_camp -> both. Every other team type is a worship team.
-- 2. Roles, granted at each campus the user belongs to (user_campuses).
--
-- Users with no team assignment and no mapped role (e.g. plain 'student'
-- accounts, which carry no MS/HS signal) are intentionally left unassigned;
-- the hub directory is where those get resolved by hand.
-- ---------------------------------------------------------------------------

INSERT INTO public.ministry_memberships (user_id, ministry_key, campus_id)
SELECT DISTINCT umc.user_id, 'worship', umc.campus_id
FROM public.user_ministry_campuses umc
WHERE umc.ministry_type NOT IN ('encounter', 'eon', 'eon_weekend', 'student_camp')
ON CONFLICT (user_id, ministry_key, campus_id) DO NOTHING;

INSERT INTO public.ministry_memberships (user_id, ministry_key, campus_id)
SELECT DISTINCT umc.user_id, 'students_hs', umc.campus_id
FROM public.user_ministry_campuses umc
WHERE umc.ministry_type IN ('encounter', 'student_camp')
ON CONFLICT (user_id, ministry_key, campus_id) DO NOTHING;

INSERT INTO public.ministry_memberships (user_id, ministry_key, campus_id)
SELECT DISTINCT umc.user_id, 'students_ms', umc.campus_id
FROM public.user_ministry_campuses umc
WHERE umc.ministry_type IN ('eon', 'eon_weekend', 'student_camp')
ON CONFLICT (user_id, ministry_key, campus_id) DO NOTHING;

INSERT INTO public.ministry_memberships (user_id, ministry_key, campus_id)
SELECT DISTINCT ur.user_id, role_map.ministry_key, uc.campus_id
FROM public.user_roles ur
JOIN public.user_campuses uc ON uc.user_id = ur.user_id
JOIN (
  VALUES
    ('hs_leader', 'students_hs'),
    ('ms_leader', 'students_ms'),
    ('ms_leader_weekend', 'students_ms'),
    ('student_pastor', 'students_hs'),
    ('student_pastor', 'students_ms'),
    ('network_student_pastor', 'students_hs'),
    ('network_student_pastor', 'students_ms'),
    ('campus_worship_pastor', 'worship'),
    ('network_worship_pastor', 'worship')
) AS role_map(role, ministry_key) ON role_map.role = ur.role::text
ON CONFLICT (user_id, ministry_key, campus_id) DO NOTHING;
