create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profiles enable row level security;

create table if not exists public.memory_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_a text not null,
  prompt_b text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.memory_pairs enable row level security;

create or replace function public.set_memory_pairs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profiles
    where profiles.id = check_user_id
      and profiles.role = 'admin'
  );
$$;

drop trigger if exists memory_pairs_set_updated_at on public.memory_pairs;

create trigger memory_pairs_set_updated_at
before update on public.memory_pairs
for each row
execute procedure public.set_memory_pairs_updated_at();

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute procedure public.set_memory_pairs_updated_at();

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user_profile();

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
on public.user_profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
on public.user_profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
on public.user_profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can view their own memory pairs" on public.memory_pairs;
create policy "Users can view their own memory pairs"
on public.memory_pairs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memory pairs" on public.memory_pairs;
create policy "Users can insert their own memory pairs"
on public.memory_pairs
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memory pairs" on public.memory_pairs;
create policy "Users can update their own memory pairs"
on public.memory_pairs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memory pairs" on public.memory_pairs;
create policy "Users can delete their own memory pairs"
on public.memory_pairs
for delete
using (auth.uid() = user_id);

create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default '기타',
  sender_email text,
  reply_email text not null,
  message text not null,
  status text not null default 'received',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.support_inquiries
  add column if not exists category text not null default '기타';

alter table public.support_inquiries enable row level security;

drop trigger if exists support_inquiries_set_updated_at on public.support_inquiries;

create trigger support_inquiries_set_updated_at
before update on public.support_inquiries
for each row
execute procedure public.set_memory_pairs_updated_at();

drop policy if exists "Users can view their own support inquiries" on public.support_inquiries;
create policy "Users can view their own support inquiries"
on public.support_inquiries
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own support inquiries" on public.support_inquiries;
create policy "Users can insert their own support inquiries"
on public.support_inquiries
for insert
with check (auth.uid() = user_id);

drop policy if exists "Admins can view all support inquiries" on public.support_inquiries;
create policy "Admins can view all support inquiries"
on public.support_inquiries
for select
using (public.is_admin());

drop policy if exists "Admins can update all support inquiries" on public.support_inquiries;
create policy "Admins can update all support inquiries"
on public.support_inquiries
for update
using (public.is_admin())
with check (public.is_admin());

