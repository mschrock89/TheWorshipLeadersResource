-- Custom Team Builder teams (Fall Kickoff, and anything else that is not a shared
-- rotation team) belong to one campus and one ministry. Shared teams such as
-- Team 1 stay campus-wide and keep using the ministry name filter.

ALTER TABLE public.worship_teams
  ADD COLUMN IF NOT EXISTS campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ministry_type text;

CREATE INDEX IF NOT EXISTS worship_teams_campus_ministry_idx
  ON public.worship_teams (campus_id, ministry_type)
  WHERE campus_id IS NOT NULL;

COMMENT ON COLUMN public.worship_teams.campus_id IS
  'Campus a custom team belongs to. NULL for shared rotation teams.';
COMMENT ON COLUMN public.worship_teams.ministry_type IS
  'Ministry a custom team belongs to. NULL for shared rotation teams.';

CREATE OR REPLACE FUNCTION public.normalize_worship_team_ministry(ministry text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN ministry IS NULL OR btrim(ministry) = '' OR ministry = 'all' THEN NULL
    WHEN ministry IN ('weekend', 'weekend_team', 'sunday_am', 'production') THEN 'weekend'
    WHEN ministry = 'hs_production' THEN 'encounter'
    WHEN ministry = 'ms_hs_production' THEN 'ms_hs'
    WHEN ministry = 'photo_team' THEN 'creative'
    WHEN ministry ~ '^(kids_camp|student_camp)_(morning|afternoon|evening)$'
      THEN regexp_replace(ministry, '_(morning|afternoon|evening)$', '')
    ELSE ministry
  END;
$$;

CREATE OR REPLACE FUNCTION public.primary_worship_team_ministry(ministry_types text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_worship_team_ministry(chosen)
  FROM (
    SELECT COALESCE(
      (
        SELECT m
        FROM unnest(COALESCE(NULLIF(ministry_types, '{}'::text[]), ARRAY['weekend']::text[])) AS m
        WHERE m NOT IN ('production', 'video', 'hs_production', 'ms_hs_production', 'photo_team')
        ORDER BY m
        LIMIT 1
      ),
      (
        SELECT m
        FROM unnest(COALESCE(NULLIF(ministry_types, '{}'::text[]), ARRAY['weekend']::text[])) AS m
        ORDER BY m
        LIMIT 1
      )
    ) AS chosen
  ) picked;
$$;

CREATE OR REPLACE FUNCTION public.is_shared_rotation_team_name(team_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(team_name, ''))) IN (
      'team 1',
      'team 2',
      'team 3',
      'team 4',
      'simple worship',
      '5th sunday',
      'evening a',
      'evening b',
      'combined',
      'hospitality',
      'hype',
      'prayer',
      'cafe'
    )
    OR COALESCE(team_name, '') ~* '\m(team[[:space:]]*|t)[1-9][0-9]*\M';
$$;

DO $$
DECLARE
  team_row record;
  scope_row record;
  primary_campus uuid;
  primary_ministry text;
  cloned_team_id uuid;
BEGIN
  CREATE TEMP TABLE custom_team_scope_uses ON COMMIT DROP AS
  SELECT team_id, campus_id, ministry_type, count(*)::int AS uses
  FROM (
    SELECT tm.team_id,
           rp.campus_id,
           public.primary_worship_team_ministry(tm.ministry_types) AS ministry_type
    FROM public.team_members tm
    JOIN public.rotation_periods rp ON rp.id = tm.rotation_period_id
    WHERE rp.campus_id IS NOT NULL

    UNION ALL

    SELECT tmo.team_id,
           rp.campus_id,
           public.primary_worship_team_ministry(tmo.ministry_types) AS ministry_type
    FROM public.team_member_date_overrides tmo
    JOIN public.rotation_periods rp ON rp.id = tmo.rotation_period_id
    WHERE rp.campus_id IS NOT NULL

    UNION ALL

    SELECT ts.team_id,
           ts.campus_id,
           COALESCE(public.normalize_worship_team_ministry(ts.ministry_type), 'weekend') AS ministry_type
    FROM public.team_schedule ts
    WHERE ts.campus_id IS NOT NULL
  ) scoped
  WHERE ministry_type IS NOT NULL
  GROUP BY team_id, campus_id, ministry_type;

  FOR team_row IN
    SELECT wt.id
    FROM public.worship_teams wt
    WHERE wt.campus_id IS NULL
      AND wt.ministry_type IS NULL
      AND NOT public.is_shared_rotation_team_name(wt.name)
      AND EXISTS (
        SELECT 1
        FROM custom_team_scope_uses scope
        WHERE scope.team_id = wt.id
      )
  LOOP
    SELECT scope.campus_id, scope.ministry_type
    INTO primary_campus, primary_ministry
    FROM custom_team_scope_uses scope
    WHERE scope.team_id = team_row.id
    ORDER BY scope.uses DESC, scope.campus_id, scope.ministry_type
    LIMIT 1;

    FOR scope_row IN
      SELECT scope.campus_id, scope.ministry_type
      FROM custom_team_scope_uses scope
      WHERE scope.team_id = team_row.id
        AND (scope.campus_id, scope.ministry_type) IS DISTINCT FROM (primary_campus, primary_ministry)
      ORDER BY scope.uses DESC, scope.campus_id, scope.ministry_type
    LOOP
      INSERT INTO public.worship_teams (
        name,
        color,
        icon,
        resource_app_key,
        template_config,
        campus_id,
        ministry_type
      )
      SELECT
        wt.name,
        wt.color,
        wt.icon,
        wt.resource_app_key,
        wt.template_config,
        scope_row.campus_id,
        scope_row.ministry_type
      FROM public.worship_teams wt
      WHERE wt.id = team_row.id
      RETURNING id INTO cloned_team_id;

      UPDATE public.team_members tm
      SET team_id = cloned_team_id
      FROM public.rotation_periods rp
      WHERE tm.rotation_period_id = rp.id
        AND tm.team_id = team_row.id
        AND rp.campus_id = scope_row.campus_id
        AND public.primary_worship_team_ministry(tm.ministry_types) = scope_row.ministry_type;

      UPDATE public.team_member_date_overrides tmo
      SET team_id = cloned_team_id
      FROM public.rotation_periods rp
      WHERE tmo.rotation_period_id = rp.id
        AND tmo.team_id = team_row.id
        AND rp.campus_id = scope_row.campus_id
        AND public.primary_worship_team_ministry(tmo.ministry_types) = scope_row.ministry_type;

      UPDATE public.team_schedule ts
      SET team_id = cloned_team_id
      WHERE ts.team_id = team_row.id
        AND ts.campus_id = scope_row.campus_id
        AND COALESCE(public.normalize_worship_team_ministry(ts.ministry_type), 'weekend') = scope_row.ministry_type;

      UPDATE public.gap_requests gr
      SET team_id = cloned_team_id
      WHERE gr.team_id = team_row.id
        AND gr.campus_id = scope_row.campus_id
        AND public.normalize_worship_team_ministry(gr.ministry_type) = scope_row.ministry_type;

      UPDATE public.swap_requests sr
      SET team_id = cloned_team_id
      WHERE sr.team_id = team_row.id
        AND sr.campus_id = scope_row.campus_id
        AND public.normalize_worship_team_ministry(sr.ministry_type) = scope_row.ministry_type;

      INSERT INTO public.team_template_configs (
        team_id,
        campus_id,
        ministry_type,
        template_config,
        created_at,
        updated_at
      )
      SELECT
        cloned_team_id,
        ttc.campus_id,
        ttc.ministry_type,
        ttc.template_config,
        ttc.created_at,
        ttc.updated_at
      FROM public.team_template_configs ttc
      WHERE ttc.team_id = team_row.id
        AND ttc.campus_id IS NOT DISTINCT FROM scope_row.campus_id
        AND public.normalize_worship_team_ministry(ttc.ministry_type) = scope_row.ministry_type;

      DELETE FROM public.team_template_configs ttc
      WHERE ttc.team_id = team_row.id
        AND ttc.campus_id IS NOT DISTINCT FROM scope_row.campus_id
        AND public.normalize_worship_team_ministry(ttc.ministry_type) = scope_row.ministry_type;

      INSERT INTO public.team_period_locks (team_id, rotation_period_id, locked_at, locked_by)
      SELECT cloned_team_id, l.rotation_period_id, l.locked_at, l.locked_by
      FROM public.team_period_locks l
      JOIN public.rotation_periods rp ON rp.id = l.rotation_period_id
      WHERE l.team_id = team_row.id
        AND rp.campus_id = scope_row.campus_id
      ON CONFLICT (team_id, rotation_period_id) DO NOTHING;

      INSERT INTO public.team_period_hides (team_id, rotation_period_id, hidden_at, hidden_by)
      SELECT cloned_team_id, h.rotation_period_id, h.hidden_at, h.hidden_by
      FROM public.team_period_hides h
      JOIN public.rotation_periods rp ON rp.id = h.rotation_period_id
      WHERE h.team_id = team_row.id
        AND rp.campus_id = scope_row.campus_id
      ON CONFLICT (team_id, rotation_period_id) DO NOTHING;

      IF scope_row.campus_id IS DISTINCT FROM primary_campus THEN
        DELETE FROM public.team_period_locks l
        USING public.rotation_periods rp
        WHERE l.rotation_period_id = rp.id
          AND l.team_id = team_row.id
          AND rp.campus_id = scope_row.campus_id;

        DELETE FROM public.team_period_hides h
        USING public.rotation_periods rp
        WHERE h.rotation_period_id = rp.id
          AND h.team_id = team_row.id
          AND rp.campus_id = scope_row.campus_id;
      END IF;

      UPDATE public.team_rotation_drafts d
      SET assignments = (
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN elem->>'team_id' = team_row.id::text
                THEN jsonb_set(elem, '{team_id}', to_jsonb(cloned_team_id::text))
              ELSE elem
            END
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(d.assignments::jsonb) elem
      )
      WHERE d.campus_id = scope_row.campus_id
        AND public.normalize_worship_team_ministry(d.ministry_type) = scope_row.ministry_type
        AND jsonb_typeof(d.assignments::jsonb) = 'array';
    END LOOP;

    UPDATE public.worship_teams
    SET campus_id = primary_campus,
        ministry_type = primary_ministry
    WHERE id = team_row.id;
  END LOOP;
END $$;

DROP FUNCTION public.primary_worship_team_ministry(text[]);
DROP FUNCTION public.normalize_worship_team_ministry(text);
DROP FUNCTION public.is_shared_rotation_team_name(text);
