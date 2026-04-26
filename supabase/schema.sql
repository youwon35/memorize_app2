create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_role_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_role_check
      check (role in ('user', 'admin'));
  end if;
end
$$;

create table if not exists public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null default 'app_open',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.app_usage_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_usage_events_event_type_check'
  ) then
    alter table public.app_usage_events
      add constraint app_usage_events_event_type_check
      check (event_type in ('app_open'));
  end if;
end
$$;

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

create or replace function public.get_admin_dashboard_metrics()
returns table (
  total_users bigint,
  active_users_30d bigint,
  monthly_app_opens_30d bigint,
  avg_cards_per_user numeric,
  avg_opens_per_active_user numeric,
  return_rate_7d numeric,
  inquiries_last_24h bigint,
  received_inquiries bigint,
  reviewing_inquiries bigint,
  resolved_inquiries bigint,
  unresolved_inquiries bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with card_counts as (
    select
      profiles.id,
      count(pairs.id)::numeric as card_count
    from public.user_profiles profiles
    left join public.memory_pairs pairs
      on pairs.user_id = profiles.id
    group by profiles.id
  ),
  active_users as (
    select distinct events.user_id
    from public.app_usage_events events
    where events.created_at >= timezone('utc', now()) - interval '30 days'
  ),
  active_users_7d as (
    select
      events.user_id,
      count(distinct timezone('utc', events.created_at)::date)::numeric as active_days
    from public.app_usage_events events
    where events.created_at >= timezone('utc', now()) - interval '7 days'
    group by events.user_id
  ),
  open_counts as (
    select
      events.user_id,
      count(*)::numeric as open_count
    from public.app_usage_events events
    where events.created_at >= timezone('utc', now()) - interval '30 days'
    group by events.user_id
  )
  select
    (select count(*) from public.user_profiles)::bigint as total_users,
    (select count(*) from active_users)::bigint as active_users_30d,
    (
      select count(*)
      from public.app_usage_events events
      where events.created_at >= timezone('utc', now()) - interval '30 days'
    )::bigint as monthly_app_opens_30d,
    round(coalesce((select avg(card_count) from card_counts), 0), 2) as avg_cards_per_user,
    round(coalesce((select avg(open_count) from open_counts), 0), 2) as avg_opens_per_active_user,
    round(
      coalesce(
        (
          select
            100 * count(*)::numeric / nullif((select count(*) from active_users_7d), 0)
          from active_users_7d
          where active_days >= 2
        ),
        0
      ),
      1
    ) as return_rate_7d,
    (
      select count(*)
      from public.support_inquiries inquiries
      where inquiries.created_at >= timezone('utc', now()) - interval '24 hours'
    )::bigint as inquiries_last_24h,
    (
      select count(*)
      from public.support_inquiries inquiries
      where inquiries.status = 'received'
    )::bigint as received_inquiries,
    (
      select count(*)
      from public.support_inquiries inquiries
      where inquiries.status = 'reviewing'
    )::bigint as reviewing_inquiries,
    (
      select count(*)
      from public.support_inquiries inquiries
      where inquiries.status = 'resolved'
    )::bigint as resolved_inquiries,
    (
      select count(*)
      from public.support_inquiries inquiries
      where inquiries.status <> 'resolved'
    )::bigint as unresolved_inquiries;
end;
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

insert into public.user_profiles (id, email)
select users.id, users.email
from auth.users users
on conflict (id) do update
  set email = excluded.email,
      updated_at = timezone('utc', now());

create index if not exists app_usage_events_created_at_idx
on public.app_usage_events (created_at desc);

create index if not exists app_usage_events_user_id_created_at_idx
on public.app_usage_events (user_id, created_at desc);

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
on public.user_profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
on public.user_profiles
for insert
with check (auth.uid() = id and role = 'user');

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
on public.user_profiles
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and (role = 'user' or public.is_admin(auth.uid()))
);

drop policy if exists "Admins can view all profiles" on public.user_profiles;
create policy "Admins can view all profiles"
on public.user_profiles
for select
using (public.is_admin());

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

create index if not exists support_inquiries_status_created_at_idx
on public.support_inquiries (status, created_at desc);

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

drop policy if exists "Users can insert their own app usage events" on public.app_usage_events;
create policy "Users can insert their own app usage events"
on public.app_usage_events
for insert
with check (auth.uid() = user_id and event_type = 'app_open');

drop policy if exists "Admins can view all app usage events" on public.app_usage_events;
create policy "Admins can view all app usage events"
on public.app_usage_events
for select
using (public.is_admin());

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

