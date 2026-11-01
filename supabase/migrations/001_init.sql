-- The System: per-user progress, reminders, private proof photos and AI limits.
-- Row Level Security means each signed-in person can only ever touch their own rows.

create table if not exists public.player_docs (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 40),
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.player_docs enable row level security;
create policy "own docs: read" on public.player_docs for select to authenticated using (auth.uid() = user_id);
create policy "own docs: add" on public.player_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "own docs: change" on public.player_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own docs: remove" on public.player_docs for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.player_docs to authenticated;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "own subs: read" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "own subs: add" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "own subs: change" on public.push_subscriptions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subs: remove" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  morning text not null default '08:00',
  evening text not null default '21:00',
  tz text not null default 'UTC',
  summary jsonb,
  last_morning_on text,
  last_evening_on text
);
alter table public.notification_prefs enable row level security;
create policy "own prefs: read" on public.notification_prefs for select to authenticated using (auth.uid() = user_id);
create policy "own prefs: add" on public.notification_prefs for insert to authenticated with check (auth.uid() = user_id);
create policy "own prefs: change" on public.notification_prefs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.notification_prefs to authenticated;

-- AI use is counted per person per day, so one account cannot use up the shared free quota.
-- Nobody can touch this table from the app; only the server function can.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calls integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.bump_ai_usage(uid uuid, max_calls integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  insert into public.ai_usage as u (user_id, day, calls) values (uid, current_date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1 where u.calls < max_calls
  returning calls into used;
  return used is not null;
end $$;
revoke all on function public.bump_ai_usage(uuid, integer) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, integer) to service_role;

-- Lists proof photos past their keep date, so the reminder job can delete them and stay inside the free 1 GB.
create or replace function public.expired_proofs(keep_days integer, max_rows integer)
returns setof text language sql security definer set search_path = storage, public as $$
  select name from storage.objects
  where bucket_id = 'proofs' and created_at < now() - make_interval(days => keep_days)
  order by created_at limit max_rows
$$;
revoke all on function public.expired_proofs(integer, integer) from public, anon, authenticated;
grant execute on function public.expired_proofs(integer, integer) to service_role;

-- Private proof photos: each person's files live in a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "own proofs: read" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own proofs: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own proofs: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
