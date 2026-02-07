-- Create a function to calculate song statistics server-side
CREATE OR REPLACE FUNCTION public.get_songs_with_stats()
RETURNS TABLE (
  id uuid,
  pco_song_id text,
  title text,
  author text,
  ccli_number text,
  created_at timestamptz,
  updated_at timestamptz,
  usage_count bigint,
  first_used date,
  last_used date,
  upcoming_uses bigint,
  usages jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT current_date AS d
  ),
  song_usages AS (
    SELECT 
      ps.song_id,
      sp.plan_date,
      sp.campus_id,
      sp.service_type_name
    FROM plan_songs ps
    JOIN service_plans sp ON ps.plan_id = sp.id
  ),
  song_stats AS (
    SELECT 
      su.song_id,
      COUNT(*) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS usage_count,
      MIN(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS first_used,
      MAX(su.plan_date) FILTER (WHERE su.plan_date < (SELECT d FROM today)) AS last_used,
      COUNT(*) FILTER (WHERE su.plan_date >= (SELECT d FROM today)) AS upcoming_uses,
      jsonb_agg(
        jsonb_build_object(
          'plan_date', su.plan_date,
          'campus_id', su.campus_id,
          'service_type_name', su.service_type_name
        )
      ) AS usages
    FROM song_usages su
    GROUP BY su.song_id
  )
  SELECT 
    s.id,
    s.pco_song_id,
    s.title,
    s.author,
    s.ccli_number,
    s.created_at,
    s.updated_at,
    COALESCE(ss.usage_count, 0) AS usage_count,
    ss.first_used,
    ss.last_used,
    COALESCE(ss.upcoming_uses, 0) AS upcoming_uses,
    COALESCE(ss.usages, '[]'::jsonb) AS usages
  FROM songs s
  LEFT JOIN song_stats ss ON s.id = ss.song_id
  ORDER BY s.title;
$$;