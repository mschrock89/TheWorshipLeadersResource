create table if not exists public.covenant_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Team Covenant',
  description text,
  file_name text not null,
  storage_path text not null unique,
  version_label text not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.covenant_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.covenant_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  typed_name text not null,
  signed_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint covenant_signatures_document_user_key unique (document_id, user_id)
);

create index if not exists covenant_documents_active_idx
  on public.covenant_documents(is_active, created_at desc);

create index if not exists covenant_signatures_user_idx
  on public.covenant_signatures(user_id, signed_at desc);

drop trigger if exists trg_covenant_documents_updated_at on public.covenant_documents;
create trigger trg_covenant_documents_updated_at
before update on public.covenant_documents
for each row
execute function public.update_updated_at_column();

drop trigger if exists trg_covenant_signatures_updated_at on public.covenant_signatures;
create trigger trg_covenant_signatures_updated_at
before update on public.covenant_signatures
for each row
execute function public.update_updated_at_column();

alter table public.covenant_documents enable row level security;
alter table public.covenant_signatures enable row level security;

create policy "Authenticated users can view covenant documents"
on public.covenant_documents
for select
to authenticated
using (true);

create policy "Admins can manage covenant documents"
on public.covenant_documents
for all
to authenticated
using (has_role(auth.uid(), 'admin'::app_role))
with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Users can view their own covenant signatures"
on public.covenant_signatures
for select
to authenticated
using (
  auth.uid() = user_id
  or has_role(auth.uid(), 'admin'::app_role)
);

create policy "Users can create their own covenant signatures"
on public.covenant_signatures
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own covenant signatures"
on public.covenant_signatures
for update
to authenticated
using (
  auth.uid() = user_id
  or has_role(auth.uid(), 'admin'::app_role)
)
with check (
  auth.uid() = user_id
  or has_role(auth.uid(), 'admin'::app_role)
);

insert into storage.buckets (id, name, public)
values ('covenant_documents', 'covenant_documents', false)
on conflict (id) do nothing;

create policy "Authenticated users can read covenant documents storage"
on storage.objects
for select
to authenticated
using (bucket_id = 'covenant_documents');

create policy "Admins can upload covenant documents storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'covenant_documents'
  and has_role(auth.uid(), 'admin'::app_role)
);

create policy "Admins can update covenant documents storage"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'covenant_documents'
  and has_role(auth.uid(), 'admin'::app_role)
)
with check (
  bucket_id = 'covenant_documents'
  and has_role(auth.uid(), 'admin'::app_role)
);

create policy "Admins can delete covenant documents storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'covenant_documents'
  and has_role(auth.uid(), 'admin'::app_role)
);
