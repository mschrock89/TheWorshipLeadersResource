-- Fix ambiguous column reference in get_prior_song_uses (Postgres 42702)
-- Unqualified `song_id` can collide with RETURNS TABLE output variable names in PL/pgSQL.
CREATE OR REPLACE FUNCTION public.get_prior_song_uses(
  _song_ids uuid[],
  _before_date date,
  _campus_ids uuid[] DEFAULT NULL,
  _ministry_types text[] DEFAULT NULL
)
RETURNS TABLE(song_id uuid, usage_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_service_plans boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'service_plans'
  ) INTO _has_service_plans;

  IF _has_service_plans THEN
    RETURN QUERY
    WITH prior_plans AS (
      SELECT sp.id
      FROM service_plans sp
      WHERE sp.plan_date < _before_date
        AND (_campus_ids IS NULL OR sp.campus_id = ANY(_campus_ids) OR (sp.campus_id IS NULL AND _campus_ids IS NOT NULL))
        AND (
          _ministry_types IS NULL
          OR (
            CASE
              WHEN lower(sp.service_type_name) LIKE '%eon%' THEN 'eon'
              WHEN lower(sp.service_type_name) LIKE '%encounter%' THEN 'encounter'
              WHEN lower(sp.service_type_name) LIKE '%evident%' THEN 'evident'
              WHEN lower(sp.service_type_name) ~ ' er |^er | er$' THEN 'er'
              ELSE 'weekend'
            END
          ) = ANY(_ministry_types)
        )
    ),
    plan_counts AS (
      SELECT ps.song_id, count(*)::bigint AS cnt
      FROM plan_songs ps
      JOIN prior_plans pp ON ps.plan_id = pp.id
      WHERE ps.song_id = ANY(_song_ids)
      GROUP BY ps.song_id
    ),
    prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    ),
    combined AS (
      SELECT pc.song_id AS song_id, pc.cnt AS cnt
      FROM plan_counts pc
      UNION ALL
      SELECT dc.song_id AS song_id, dc.cnt AS cnt
      FROM draft_counts dc
    )
    SELECT c.song_id AS song_id, sum(c.cnt)::bigint AS usage_count
    FROM combined c
    GROUP BY c.song_id;
  ELSE
    RETURN QUERY
    WITH prior_drafts AS (
      SELECT ds.id
      FROM draft_sets ds
      WHERE ds.plan_date < _before_date
        AND ds.status = 'published'
        AND (_campus_ids IS NULL OR ds.campus_id = ANY(_campus_ids))
        AND (_ministry_types IS NULL OR ds.ministry_type = ANY(_ministry_types))
    ),
    draft_counts AS (
      SELECT dss.song_id, count(*)::bigint AS cnt
      FROM draft_set_songs dss
      JOIN prior_drafts pd ON dss.draft_set_id = pd.id
      WHERE dss.song_id = ANY(_song_ids)
      GROUP BY dss.song_id
    )
    SELECT dc.song_id AS song_id, dc.cnt AS usage_count
    FROM draft_counts dc;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_prior_song_uses(uuid[], date, uuid[], text[]) TO authenticated;
