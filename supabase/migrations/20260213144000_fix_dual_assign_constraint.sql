DO $$
DECLARE
  c RECORD;
BEGIN
  -- Remove any old unique constraint that only allows one row per user per service/date.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'custom_service_assignments'
      AND con.contype = 'u'
      AND con.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'custom_service_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'assignment_date'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'user_id')
      ]
  LOOP
    EXECUTE format('ALTER TABLE public.custom_service_assignments DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- Ensure unique per user+role per custom service occurrence.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'custom_service_assignments'
      AND con.contype = 'u'
      AND con.conname = 'custom_service_assignments_unique_member_role_per_service'
  ) THEN
    ALTER TABLE public.custom_service_assignments
      ADD CONSTRAINT custom_service_assignments_unique_member_role_per_service
      UNIQUE(custom_service_id, assignment_date, user_id, role);
  END IF;
END
$$;
