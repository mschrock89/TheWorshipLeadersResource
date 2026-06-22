-- Comprehensively relax foreign keys that block deleting a user/profile.
--
-- The earlier targeted migration (20260622140000) fixed the known "who did this"
-- columns, but deleting an auth user can still fail with a foreign-key violation
-- if ANY other table references profiles(id) or auth.users(id) with the default
-- ON DELETE NO ACTION / RESTRICT rule (e.g. constraints added outside of these
-- migrations, or ones that were missed).
--
-- This migration scans every single-column foreign key that points at
-- public.profiles or auth.users and, where the delete rule still blocks
-- deletion, relaxes it:
--   * nullable column  -> ON DELETE SET NULL  (preserves the row, clears the ref)
--   * NOT NULL column  -> ON DELETE CASCADE   (row is user-owned; matches the
--                                              existing convention for user_id cols)
--
-- It is idempotent: rows that already use SET NULL / CASCADE are skipped.

DO $$
DECLARE
  r RECORD;
  new_action TEXT;
BEGIN
  FOR r IN
    SELECT
      con.conname                         AS constraint_name,
      con.conrelid::regclass::text        AS table_name,
      att.attname                         AS column_name,
      att.attnotnull                      AS is_not_null,
      con.confrelid::regclass::text       AS ref_table
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid
     AND att.attnum   = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
      AND con.confdeltype IN ('a', 'r')          -- a = NO ACTION, r = RESTRICT
      AND array_length(con.conkey, 1) = 1         -- single-column FKs only
  LOOP
    IF r.is_not_null THEN
      new_action := 'CASCADE';
    ELSE
      new_action := 'SET NULL';
    END IF;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I;', r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s;',
      r.table_name, r.constraint_name, r.column_name, r.ref_table, new_action
    );

    RAISE NOTICE 'Relaxed FK % on %.% -> % to ON DELETE %',
      r.constraint_name, r.table_name, r.column_name, r.ref_table, new_action;
  END LOOP;
END $$;
