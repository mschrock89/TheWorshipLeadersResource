-- Simpler RPC: draft sets only (use if full version fails in SQL Editor)
CREATE OR REPLACE FUNCTION public.get_prior_song_uses(
  _song_ids uuid[],
  _before_date date,
  _campus_ids uuid[] DEFAULT NULL,
  _ministry_types text[] DEFAULT NULL
)
RETURNS TABLE(song_id uuid, usage_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT dc.song_id, dc.cnt FROM draft_counts dc;
$$;

GRANT EXECUTE ON FUNCTION public.get_prior_song_uses(uuid[], date, uuid[], text[]) TO authenticated;
