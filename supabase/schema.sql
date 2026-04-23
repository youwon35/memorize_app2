create extension if not exists pgcrypto;

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

drop trigger if exists memory_pairs_set_updated_at on public.memory_pairs;

create trigger memory_pairs_set_updated_at
before update on public.memory_pairs
for each row
execute procedure public.set_memory_pairs_updated_at();

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
  sender_email text,
  reply_email text not null,
  message text not null,
  status text not null default 'received',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

