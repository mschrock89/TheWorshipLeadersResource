create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('blog', 'scripture', 'video')),
  title text not null,
  body text,
  scripture_reference text,
  youtube_url text,
  youtube_video_id text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists feed_posts_created_at_idx
  on public.feed_posts(created_at desc);

create index if not exists feed_post_likes_post_id_idx
  on public.feed_post_likes(post_id);

create trigger trg_feed_posts_updated_at
before update on public.feed_posts
for each row
execute function public.update_updated_at_column();

alter table public.feed_posts enable row level security;
alter table public.feed_post_likes enable row level security;

create policy "Authenticated users can view feed posts"
  on public.feed_posts
  for select
  using (auth.uid() is not null);

create policy "Admins can insert feed posts"
  on public.feed_posts
  for insert
  with check (
    auth.uid() = created_by
    and has_role(auth.uid(), 'admin'::app_role)
  );

create policy "Admins can update feed posts"
  on public.feed_posts
  for update
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can delete feed posts"
  on public.feed_posts
  for delete
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Authenticated users can view feed likes"
  on public.feed_post_likes
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can like posts"
  on public.feed_post_likes
  for insert
  with check (
    auth.uid() = user_id
    and auth.uid() is not null
  );

create policy "Users can remove their own likes"
  on public.feed_post_likes
  for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.feed_posts;
alter publication supabase_realtime add table public.feed_post_likes;
