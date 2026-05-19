create table if not exists public.memory_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_study_goal integer not null default 5,
  study_stats jsonb not null default '{"cards":{},"sessions":[]}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.memory_user_state enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_user_state_daily_goal_range'
  ) then
    alter table public.memory_user_state
      add constraint memory_user_state_daily_goal_range
      check (daily_study_goal between 1 and 99);
  end if;
end
$$;

drop trigger if exists memory_user_state_set_updated_at on public.memory_user_state;

create trigger memory_user_state_set_updated_at
before update on public.memory_user_state
for each row
execute procedure public.set_memory_pairs_updated_at();

create index if not exists memory_user_state_updated_at_idx
on public.memory_user_state (updated_at desc);

drop policy if exists "Users can view their own memory user state" on public.memory_user_state;
create policy "Users can view their own memory user state"
on public.memory_user_state
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memory user state" on public.memory_user_state;
create policy "Users can insert their own memory user state"
on public.memory_user_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memory user state" on public.memory_user_state;
create policy "Users can update their own memory user state"
on public.memory_user_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memory user state" on public.memory_user_state;
create policy "Users can delete their own memory user state"
on public.memory_user_state
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can delete their own support inquiries" on public.support_inquiries;
create policy "Users can delete their own support inquiries"
on public.support_inquiries
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can delete their own app usage events" on public.app_usage_events;
create policy "Users can delete their own app usage events"
on public.app_usage_events
for delete
using (auth.uid() = user_id);
