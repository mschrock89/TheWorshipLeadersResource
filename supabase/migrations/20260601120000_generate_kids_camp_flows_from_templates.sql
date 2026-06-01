-- Generate Kids Camp service flows from each campus Kids Camp template for Kids Camp custom services.
-- This keeps custom services usable even when they do not have a song set/draft set attached.

WITH latest_kids_camp_templates AS (
  SELECT DISTINCT ON (campus_id)
    id,
    campus_id
  FROM public.service_flow_templates
  WHERE ministry_type = 'kids_camp'
  ORDER BY campus_id, updated_at DESC
),
inserted_flows AS (
  INSERT INTO public.service_flows (
    campus_id,
    ministry_type,
    service_date,
    custom_service_id,
    created_from_template_id,
    created_by
  )
  SELECT
    cs.campus_id,
    'kids_camp',
    cs.service_date,
    cs.id,
    t.id,
    cs.created_by
  FROM public.custom_services cs
  JOIN latest_kids_camp_templates t
    ON t.campus_id = cs.campus_id
  WHERE cs.is_active = true
    AND (
      cs.ministry_type = 'kids_camp'
      OR cs.service_name ~* '\mkids\s*camp\M'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.service_flows sf
      WHERE sf.campus_id = cs.campus_id
        AND sf.ministry_type = 'kids_camp'
        AND sf.service_date = cs.service_date
        AND sf.custom_service_id = cs.id
    )
  RETURNING id, created_from_template_id
),
empty_existing_flows AS (
  SELECT
    sf.id,
    COALESCE(sf.created_from_template_id, t.id) AS created_from_template_id
  FROM public.service_flows sf
  JOIN public.custom_services cs
    ON cs.id = sf.custom_service_id
  JOIN latest_kids_camp_templates t
    ON t.campus_id = sf.campus_id
  WHERE sf.ministry_type = 'kids_camp'
    AND (
      cs.ministry_type = 'kids_camp'
      OR cs.service_name ~* '\mkids\s*camp\M'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.service_flow_items sfi
      WHERE sfi.service_flow_id = sf.id
    )
),
target_flows AS (
  SELECT id, created_from_template_id FROM inserted_flows
  UNION
  SELECT id, created_from_template_id FROM empty_existing_flows
)
INSERT INTO public.service_flow_items (
  service_flow_id,
  item_type,
  title,
  duration_seconds,
  sequence_order,
  song_id,
  song_key,
  vocalist_id
)
SELECT
  tf.id,
  CASE
    WHEN tfi.item_type = 'header' THEN 'header'
    ELSE 'item'
  END,
  tfi.title,
  tfi.default_duration_seconds,
  tfi.sequence_order,
  NULL,
  NULL,
  NULL
FROM target_flows tf
JOIN public.service_flow_template_items tfi
  ON tfi.template_id = tf.created_from_template_id
ORDER BY tf.id, tfi.sequence_order;
