-- Permissions foundation, part 1: make role permissions DATA instead of code.
--
-- Today "who can do what" is spread across (a) hasRole() OR-chains in useAuth,
-- (b) RLS policies, (c) hardcoded person checks (approver UUID, "eli"/"christian"
-- first-name match), and (d) resource_app helpers. This migration introduces one
-- source of truth so an admin UI can edit permissions without code changes:
--   capabilities             -- the catalog of gate-able actions (dev-owned)
--   role_capabilities        -- role -> capability grants (the editable matrix)
--   user_capability_overrides-- per-user grant/revoke (replaces the name hack)
--   setlist_approval_rules   -- who approves / what auto-publishes (replaces UUID)
-- plus has_capability(), mirroring has_role()'s SECURITY DEFINER shape so RLS and
-- the frontend can both trust it.
--
-- The seeds below reproduce CURRENT behavior exactly. Nothing is granted or
-- revoked here; later migrations flip enforcement points over to has_capability.

-- ---------------------------------------------------------------------------
-- 1. Capability catalog. Dev-owned vocabulary; admins toggle grants, not this.
-- ---------------------------------------------------------------------------
CREATE TABLE public.capabilities (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.capabilities (key, label, category, description) VALUES
  ('admin_full',              'Full admin access',            'Admin',  'Unrestricted access. Break-glass grant kept alongside role=admin until cutover.'),
  ('admin_tools',             'Access Admin Tools',           'Admin',  'Open the Admin Tools page and its system controls.'),
  ('manage_permissions',      'Manage permissions',           'Admin',  'Open and edit the permissions admin UI.'),
  ('leader_access',           'Leadership views',             'Team',   'See leadership-only dashboards and rosters.'),
  ('manage_team',             'Manage team / Team Builder',   'Team',   'Build teams, manage rotations, fill roles.'),
  ('switch_campus_chat',      'Switch campus in chat',        'Team',   'View and post to other campuses'' chat channels.'),
  ('plan_set',                'Plan / create sets',           'Sets',   'Create and edit draft sets in Set Builder.'),
  ('view_all_setlists',       'View all setlists',            'Sets',   'See every setlist, not just ones you are rostered for.'),
  ('video_director_tools',    'Video Director tools',         'Content','Access video-director features.'),
  ('production_manager_tools','Production Manager tools',      'Content','Access production-manager features.'),
  ('weekend_rundown',         'Weekend / Wednesday Rundown',  'Content','Access and review the post-service rundown.'),
  ('publish_set_without_approval','Publish sets without approval','Sets','This person''s sets auto-publish regardless of ministry (replaces the "Eli"/"Christian" name match).');

-- ---------------------------------------------------------------------------
-- 2. Role -> capability grants. THE matrix the admin UI edits.
--    resource_app: 'all' | 'worship' | 'students_hs' | 'students_ms' | 'my_church_resource'
-- ---------------------------------------------------------------------------
CREATE TABLE public.role_capabilities (
  role           app_role NOT NULL,
  capability_key TEXT NOT NULL REFERENCES public.capabilities(key) ON DELETE CASCADE,
  resource_app   TEXT NOT NULL DEFAULT 'all',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, capability_key, resource_app)
);

-- admin_full: admin everywhere; student pastors act as admins INSIDE the student
-- apps only (mirrors hasStudentAppAdminRole in src/lib/resourceApp.ts).
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'admin_full', 'all'),
  ('student_pastor',        'admin_full', 'students_hs'),
  ('student_pastor',        'admin_full', 'students_ms'),
  ('network_student_pastor','admin_full', 'students_hs'),
  ('network_student_pastor','admin_full', 'students_ms');

-- admin_tools: same shape as admin_full (isAdmin gates the page).
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'admin_tools', 'all'),
  ('student_pastor',        'admin_tools', 'students_hs'),
  ('student_pastor',        'admin_tools', 'students_ms'),
  ('network_student_pastor','admin_tools', 'students_hs'),
  ('network_student_pastor','admin_tools', 'students_ms');

-- manage_permissions: admins only to start.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin', 'manage_permissions', 'all');

-- leader_access: useAuth isLeader set.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'leader_access', 'all'),
  ('campus_admin',          'leader_access', 'all'),
  ('campus_worship_pastor', 'leader_access', 'all'),
  ('network_student_pastor','leader_access', 'all'),
  ('student_pastor',        'leader_access', 'all'),
  ('student_worship_pastor','leader_access', 'all'),
  ('childrens_pastor',      'leader_access', 'all'),
  ('network_worship_pastor','leader_access', 'all'),
  ('network_worship_leader','leader_access', 'all');

-- manage_team: isLeader set + video_director + production_manager.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'manage_team', 'all'),
  ('campus_admin',          'manage_team', 'all'),
  ('campus_worship_pastor', 'manage_team', 'all'),
  ('network_student_pastor','manage_team', 'all'),
  ('student_pastor',        'manage_team', 'all'),
  ('student_worship_pastor','manage_team', 'all'),
  ('childrens_pastor',      'manage_team', 'all'),
  ('network_worship_pastor','manage_team', 'all'),
  ('network_worship_leader','manage_team', 'all'),
  ('video_director',        'manage_team', 'all'),
  ('production_manager',    'manage_team', 'all');

-- switch_campus_chat: isLeader set MINUS student_worship_pastor (matches useAuth).
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'switch_campus_chat', 'all'),
  ('campus_admin',          'switch_campus_chat', 'all'),
  ('campus_worship_pastor', 'switch_campus_chat', 'all'),
  ('network_student_pastor','switch_campus_chat', 'all'),
  ('student_pastor',        'switch_campus_chat', 'all'),
  ('childrens_pastor',      'switch_campus_chat', 'all'),
  ('network_worship_pastor','switch_campus_chat', 'all'),
  ('network_worship_leader','switch_campus_chat', 'all');

-- plan_set: draft_sets INSERT policy.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'plan_set', 'all'),
  ('campus_admin',          'plan_set', 'all'),
  ('network_worship_leader','plan_set', 'all'),
  ('network_worship_pastor','plan_set', 'all'),
  ('campus_worship_pastor', 'plan_set', 'all'),
  ('student_worship_pastor','plan_set', 'all'),
  ('video_director',        'plan_set', 'all'),
  ('production_manager',    'plan_set', 'all');

-- view_all_setlists: canViewAllSetlists set (includes campus_pastor).
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'view_all_setlists', 'all'),
  ('campus_admin',          'view_all_setlists', 'all'),
  ('campus_worship_pastor', 'view_all_setlists', 'all'),
  ('network_student_pastor','view_all_setlists', 'all'),
  ('student_pastor',        'view_all_setlists', 'all'),
  ('student_worship_pastor','view_all_setlists', 'all'),
  ('childrens_pastor',      'view_all_setlists', 'all'),
  ('network_worship_pastor','view_all_setlists', 'all'),
  ('network_worship_leader','view_all_setlists', 'all'),
  ('campus_pastor',         'view_all_setlists', 'all');

-- video / production tools.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',          'video_director_tools',     'all'),
  ('video_director', 'video_director_tools',     'all'),
  ('admin',          'production_manager_tools', 'all'),
  ('production_manager', 'production_manager_tools', 'all');

-- weekend_rundown: WEEKEND_RUNDOWN_ADMIN_ROLES (admin, campus_admin) plus student
-- app admins inside the student apps.
INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'weekend_rundown', 'all'),
  ('campus_admin',          'weekend_rundown', 'all'),
  ('student_pastor',        'weekend_rundown', 'students_hs'),
  ('student_pastor',        'weekend_rundown', 'students_ms'),
  ('network_student_pastor','weekend_rundown', 'students_hs'),
  ('network_student_pastor','weekend_rundown', 'students_ms');

-- ---------------------------------------------------------------------------
-- 3. Per-user overrides. granted=true adds a capability; granted=false revokes.
--    Seeds the current "Eli"/"Christian" direct-publish exception as explicit,
--    named grants of plan-set-without-approval (handled via setlist rules below,
--    but the override table is where any future per-person exception belongs).
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_capability_overrides (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES public.capabilities(key) ON DELETE CASCADE,
  resource_app   TEXT NOT NULL DEFAULT 'all',
  granted        BOOLEAN NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, capability_key, resource_app)
);

-- Freeze the current runtime first-name bypass ("eli"/"christian") into explicit
-- stored grants, ONCE. This reproduces exactly who is exempt today; going forward
-- the admin UI edits these rows instead of the code matching on names. Kyle (the
-- approver) also published directly, so grant him the same explicit capability.
-- Guarded against auth.users FK: only backfill overrides for ids that are real
-- auth users, so a missing/renamed account can't roll back the whole migration.
INSERT INTO public.user_capability_overrides (user_id, capability_key, resource_app, granted, note)
SELECT p.id, 'publish_set_without_approval', 'all', true,
       'Backfilled from prior first-name direct-publish exception.'
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE lower(split_part(trim(p.full_name), ' ', 1)) IN ('eli', 'christian')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_capability_overrides (user_id, capability_key, resource_app, granted, note)
SELECT '22c10f05-955a-498c-b18f-2ac570868b35', 'publish_set_without_approval', 'all', true,
       'Backfilled: prior approver published directly.'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '22c10f05-955a-498c-b18f-2ac570868b35')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Setlist approval routing. Replaces APPROVER_USER_ID + the hardcoded
--    DIRECT_PUBLISH_MINISTRY_TYPES / first-name bypass in useSetlistApprovals.
--    Match precedence (most specific wins): campus+ministry > campus > ministry > default.
-- ---------------------------------------------------------------------------
CREATE TABLE public.setlist_approval_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_app      TEXT NOT NULL DEFAULT 'worship',
  campus_id         UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type     TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approver_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One partial unique index per specificity level (NULLs are not unique otherwise).
CREATE UNIQUE INDEX setlist_approval_rules_scope_idx
  ON public.setlist_approval_rules (resource_app, COALESCE(campus_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(ministry_type, '*'));

-- Default worship rule: approval required, routed to Kyle Elkins (the current
-- hardcoded approver). Kept as data so a future admin can change the approver.
-- The approver is resolved via a subselect so a missing auth user yields NULL
-- (an unassigned-but-valid default) instead of an FK error that rolls back.
INSERT INTO public.setlist_approval_rules (resource_app, campus_id, ministry_type, requires_approval, approver_user_id, note) VALUES
  ('worship', NULL, NULL, true,
   (SELECT id FROM auth.users WHERE id = '22c10f05-955a-498c-b18f-2ac570868b35'),
   'Default: mirrors previous hardcoded approver.');

-- Ministries that previously auto-published (DIRECT_PUBLISH_MINISTRY_TYPES).
INSERT INTO public.setlist_approval_rules (resource_app, campus_id, ministry_type, requires_approval, approver_user_id, note) VALUES
  ('worship', NULL, 'kids_camp',   false, NULL, 'Previously auto-published.'),
  ('worship', NULL, 'encounter',   false, NULL, 'Previously auto-published.'),
  ('worship', NULL, 'eon',         false, NULL, 'Previously auto-published.'),
  ('worship', NULL, 'eon_weekend', false, NULL, 'Previously auto-published.');

-- ---------------------------------------------------------------------------
-- 5. has_capability(): the one helper RLS and the frontend both trust.
--    Mirrors has_role()'s SECURITY DEFINER + pinned search_path shape.
--    Explicit revoke beats any grant; a matching override or role grant allows.
--    admin_full is kept as a break-glass superset until cutover.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_capability(_user_id UUID, _cap TEXT, _app TEXT DEFAULT 'all')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.user_capability_overrides o
      WHERE o.user_id = _user_id
        AND o.capability_key = _cap
        AND o.resource_app IN (_app, 'all')
        AND o.granted = false
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_capability_overrides o
        WHERE o.user_id = _user_id
          AND o.capability_key = _cap
          AND o.resource_app IN (_app, 'all')
          AND o.granted = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_capabilities rc ON rc.role = ur.role
        WHERE ur.user_id = _user_id
          AND rc.capability_key = _cap
          AND rc.resource_app IN (_app, 'all')
      )
      -- Break-glass: full admins pass every capability check until cutover.
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_capabilities rc ON rc.role = ur.role
        WHERE ur.user_id = _user_id
          AND rc.capability_key = 'admin_full'
          AND rc.resource_app IN (_app, 'all')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS: reference data is readable by authenticated users (the frontend
--    resolves each user's effective capabilities client-side); only full admins
--    may edit. has_capability itself is SECURITY DEFINER so it bypasses these.
-- ---------------------------------------------------------------------------
ALTER TABLE public.capabilities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_capabilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_capability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_approval_rules    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capabilities readable by authenticated" ON public.capabilities
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "role_capabilities readable by authenticated" ON public.role_capabilities
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "approval rules readable by authenticated" ON public.setlist_approval_rules
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Overrides: the owner may read their own; admins read all.
CREATE POLICY "overrides readable by owner or admin" ON public.user_capability_overrides
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Only full admins edit any of it (has_role kept here to avoid a chicken-and-egg
-- dependency on has_capability while permissions data is still being seeded).
CREATE POLICY "role_capabilities admin write" ON public.role_capabilities
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "overrides admin write" ON public.user_capability_overrides
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "approval rules admin write" ON public.setlist_approval_rules
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
