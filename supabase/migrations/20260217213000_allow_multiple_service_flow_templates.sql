-- Allow multiple templates per campus/ministry in Service Flow Templates.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname
  INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'service_flow_templates'
    AND c.contype = 'u'
    AND (
      SELECT array_agg(att.attname::text ORDER BY att.attname::text)
      FROM unnest(c.conkey) AS ck(attnum)
      JOIN pg_attribute att
        ON att.attrelid = c.conrelid
       AND att.attnum = ck.attnum
    ) = ARRAY['campus_id', 'ministry_type']::text[];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.service_flow_templates DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_flow_templates_campus_ministry_name
  ON public.service_flow_templates(campus_id, ministry_type, name);
