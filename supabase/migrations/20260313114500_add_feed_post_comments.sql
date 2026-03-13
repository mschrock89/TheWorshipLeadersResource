create table if not exists public.feed_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_post_comments_post_id_idx
  on public.feed_post_comments(post_id, created_at asc);

create trigger trg_feed_post_comments_updated_at
before update on public.feed_post_comments
for each row
execute function public.update_updated_at_column();

alter table public.feed_post_comments enable row level security;

create policy "Authenticated users can view feed comments"
  on public.feed_post_comments
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can create feed comments"
  on public.feed_post_comments
  for insert
  with check (
    auth.uid() = user_id
    and auth.uid() is not null
  );

create policy "Users can update their own feed comments"
  on public.feed_post_comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own comments or admins can delete any"
  on public.feed_post_comments
  for delete
  using (
    auth.uid() = user_id
    or has_role(auth.uid(), 'admin'::app_role)
  );

alter publication supabase_realtime add table public.feed_post_comments;
