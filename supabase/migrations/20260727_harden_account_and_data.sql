-- Post-release security hardening for account deletion and user-provided data.
-- Run once in the Supabase SQL editor before releasing the matching app update.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_pairs_prompt_length'
  ) then
    alter table public.memory_pairs
      add constraint memory_pairs_prompt_length
      check (
        char_length(trim(prompt_a)) between 1 and 300
        and char_length(trim(prompt_b)) between 1 and 300
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'memory_folders_name_length'
  ) then
    alter table public.memory_folders
      add constraint memory_folders_name_length
      check (char_length(trim(name)) between 1 and 100) not valid;
  end if;
end
$$;

alter table public.support_inquiries
  alter column category set default 'other';

update public.support_inquiries
set category = 'other'
where category not in ('bug', 'feature', 'other');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_inquiries_category_check'
  ) then
    alter table public.support_inquiries
      add constraint support_inquiries_category_check
      check (category in ('bug', 'feature', 'other')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_inquiries_status_check'
  ) then
    alter table public.support_inquiries
      add constraint support_inquiries_status_check
      check (status in ('received', 'reviewing', 'resolved')) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_inquiries_content_length'
  ) then
    alter table public.support_inquiries
      add constraint support_inquiries_content_length
      check (
        char_length(trim(reply_email)) between 3 and 254
        and char_length(trim(message)) between 1 and 4000
        and (sender_email is null or char_length(trim(sender_email)) between 3 and 254)
      ) not valid;
  end if;
end
$$;

alter function public.handle_new_user_profile() set search_path = '';
alter function public.is_admin(uuid) set search_path = '';
alter function public.get_admin_dashboard_metrics() set search_path = '';

create or replace function public.delete_current_user_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_account_id uuid := auth.uid();
begin
  if current_account_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;

  delete from auth.users
  where id = current_account_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'account not found';
  end if;
end;
$$;

create or replace function public.can_submit_support_inquiry()
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select count(*) < 5
  from public.support_inquiries inquiries
  where inquiries.user_id = auth.uid()
    and inquiries.created_at >= timezone('utc', now()) - interval '1 hour';
$$;

drop policy if exists "Users can insert their own profile"
on public.user_profiles;

create policy "Users can insert their own profile"
on public.user_profiles
for insert
with check (
  auth.uid() = id
  and role = 'user'
  and (
    email is null
    or email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "Users can update their own profile"
on public.user_profiles;

create policy "Users can update their own profile"
on public.user_profiles
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and (role = 'user' or public.is_admin(auth.uid()))
  and (
    email is null
    or email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "Users can insert their own support inquiries"
on public.support_inquiries;

create policy "Users can insert their own support inquiries"
on public.support_inquiries
for insert
with check (
  auth.uid() = user_id
  and status = 'received'
  and category in ('bug', 'feature', 'other')
  and public.can_submit_support_inquiry()
  and char_length(trim(reply_email)) between 3 and 254
  and char_length(trim(message)) between 1 and 4000
  and (
    sender_email is null
    or sender_email = (auth.jwt() ->> 'email')
  )
);

revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.get_admin_dashboard_metrics() from public, anon;
grant execute on function public.get_admin_dashboard_metrics() to authenticated;
revoke execute on function public.can_submit_support_inquiry() from public, anon;
grant execute on function public.can_submit_support_inquiry() to authenticated;
revoke execute on function public.delete_current_user_account() from public, anon;
grant execute on function public.delete_current_user_account() to authenticated;
