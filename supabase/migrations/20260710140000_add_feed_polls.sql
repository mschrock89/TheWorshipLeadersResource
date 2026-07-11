-- Add poll posts to The Feed (GroupMe-style: question + 2-10 options + votes).

alter table public.feed_posts
  drop constraint if exists feed_posts_category_check;

alter table public.feed_posts
  add constraint feed_posts_category_check
  check (category = any (array['blog'::text, 'scripture'::text, 'video'::text, 'poll'::text]));

create table if not exists public.feed_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  label text not null check (char_length(btrim(label)) > 0 and char_length(label) <= 160),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  option_id uuid not null references public.feed_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists feed_poll_options_post_id_idx
  on public.feed_poll_options(post_id, sort_order);

create index if not exists feed_poll_votes_post_id_idx
  on public.feed_poll_votes(post_id);

create index if not exists feed_poll_votes_option_id_idx
  on public.feed_poll_votes(option_id);

create trigger trg_feed_poll_votes_updated_at
before update on public.feed_poll_votes
for each row
execute function public.update_updated_at_column();

alter table public.feed_poll_options enable row level security;
alter table public.feed_poll_votes enable row level security;

create policy "Authenticated users can view feed poll options"
  on public.feed_poll_options
  for select
  using (auth.uid() is not null);

create policy "Feed publishers can insert poll options"
  on public.feed_poll_options
  for insert
  with check (
    exists (
      select 1
      from public.feed_posts fp
      where fp.id = post_id
        and fp.created_by = auth.uid()
        and (
          public.has_capability(auth.uid(), 'post_feed', fp.resource_app_key)
          or (
            fp.campus_id is not null
            and fp.camp_instance_id is null
            and exists (
              select 1
              from public.user_roles ur
              where ur.user_id = auth.uid()
                and ur.role = 'campus_admin'
                and ur.admin_campus_id = fp.campus_id
            )
          )
        )
    )
  );

create policy "Feed publishers can delete poll options"
  on public.feed_poll_options
  for delete
  using (
    exists (
      select 1
      from public.feed_posts fp
      where fp.id = post_id
        and public.has_capability(auth.uid(), 'post_feed', fp.resource_app_key)
    )
  );

create policy "Authenticated users can view feed poll votes"
  on public.feed_poll_votes
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can cast feed poll votes"
  on public.feed_poll_votes
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.feed_poll_options fo
      where fo.id = option_id
        and fo.post_id = post_id
    )
  );

create policy "Users can change their feed poll votes"
  on public.feed_poll_votes
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.feed_poll_options fo
      where fo.id = option_id
        and fo.post_id = post_id
    )
  );

create policy "Users can remove their feed poll votes"
  on public.feed_poll_votes
  for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.feed_poll_options;
alter publication supabase_realtime add table public.feed_poll_votes;

notify pgrst, 'reload schema';
