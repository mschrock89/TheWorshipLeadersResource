-- Ensure google_integrations has a usable unique key for upsert(onConflict: "user_id")

-- Keep only the newest row per user_id if duplicates exist.
delete from public.google_integrations gi
using public.google_integrations newer
where gi.user_id = newer.user_id
  and (
    gi.updated_at < newer.updated_at
    or (gi.updated_at = newer.updated_at and gi.id::text < newer.id::text)
  );

-- Enforce uniqueness on user_id so upsert(onConflict: "user_id") works.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_integrations_user_id_key'
      and conrelid = 'public.google_integrations'::regclass
  ) then
    alter table public.google_integrations
      add constraint google_integrations_user_id_key unique (user_id);
  end if;
end
$$;
