create table if not exists public.memory_folders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id text not null default 'root',
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.memory_pairs
  add column if not exists folder_id text not null default 'root';

alter table public.memory_folders enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_folders_name_not_empty'
  ) then
    alter table public.memory_folders
      add constraint memory_folders_name_not_empty
      check (length(trim(name)) > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_folders_parent_not_self'
  ) then
    alter table public.memory_folders
      add constraint memory_folders_parent_not_self
      check (parent_id <> id);
  end if;
end
$$;

drop trigger if exists memory_folders_set_updated_at on public.memory_folders;

create trigger memory_folders_set_updated_at
before update on public.memory_folders
for each row
execute procedure public.set_memory_pairs_updated_at();

create index if not exists memory_pairs_user_id_folder_id_idx
on public.memory_pairs (user_id, folder_id);

create index if not exists memory_folders_user_id_parent_id_idx
on public.memory_folders (user_id, parent_id);

create unique index if not exists memory_folders_user_parent_lower_name_idx
on public.memory_folders (user_id, parent_id, lower(name));

drop policy if exists "Users can view their own memory folders" on public.memory_folders;
create policy "Users can view their own memory folders"
on public.memory_folders
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memory folders" on public.memory_folders;
create policy "Users can insert their own memory folders"
on public.memory_folders
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memory folders" on public.memory_folders;
create policy "Users can update their own memory folders"
on public.memory_folders
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memory folders" on public.memory_folders;
create policy "Users can delete their own memory folders"
on public.memory_folders
for delete
using (auth.uid() = user_id);
