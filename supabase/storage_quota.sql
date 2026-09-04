-- Storage quota tracking + enforcement, per membership tier.
-- Run this whole file in the Supabase SQL editor.
--
-- How it works:
--   1. storage_limits holds a per-tier byte cap: free gets 1GB, paid tiers
--      (dream/founding/lifetime) get 5GB. Edit the numbers below (or run an
--      UPDATE later) whenever you want to change them.
--   2. enforce_storage_quota() is a BEFORE INSERT trigger on storage.objects.
--      It blocks an upload server-side if it would push the uploader over
--      their tier's limit. This can't be bypassed from the client, since it
--      runs regardless of what code initiates the upload.
--   3. Uploads with no owner (e.g. your admin edge functions, which use the
--      service-role key) are skipped — the quota only applies to end-user
--      uploads, not admin/service uploads.
--   4. get_storage_usage() is an RPC the frontend can call to show
--      "X of Y used" for the signed-in user.

create table if not exists public.storage_limits (
  tier text primary key,
  limit_bytes bigint not null
);

insert into public.storage_limits (tier, limit_bytes) values
  ('free',     1073741824),  -- 1 GB
  ('dream',    5368709120),  -- 5 GB
  ('founding', 5368709120),  -- 5 GB
  ('lifetime', 5368709120)   -- 5 GB
on conflict (tier) do nothing;

create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_owner uuid;
  v_tier text;
  v_limit bigint;
  v_new_size bigint;
  v_current_total bigint;
begin
  v_owner := coalesce(new.owner_id::uuid, new.owner);

  if v_owner is null then
    return new; -- admin / service-role uploads aren't subject to a user quota
  end if;

  select membership_tier into v_tier
  from public."user-profiles"
  where id = v_owner;

  select limit_bytes into v_limit
  from public.storage_limits
  where tier = coalesce(v_tier, 'free');

  if v_limit is null then
    v_limit := 1073741824; -- fallback if tier is missing/unrecognized
  end if;

  v_new_size := coalesce((new.metadata->>'size')::bigint, 0);

  select coalesce(sum((metadata->>'size')::bigint), 0) into v_current_total
  from storage.objects
  where coalesce(owner_id::uuid, owner) = v_owner;

  if v_current_total + v_new_size > v_limit then
    raise exception 'Storage limit reached for your plan (% of % bytes used). Delete files or upgrade your plan for more space.', v_current_total, v_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_storage_quota on storage.objects;
create trigger trg_enforce_storage_quota
  before insert on storage.objects
  for each row
  execute function public.enforce_storage_quota();

create or replace function public.get_storage_usage()
returns table (bytes_used bigint, limit_bytes bigint)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_owner uuid := auth.uid();
  v_tier text;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select membership_tier into v_tier from public."user-profiles" where id = v_owner;

  return query
  select
    coalesce((select sum((metadata->>'size')::bigint) from storage.objects where coalesce(owner_id::uuid, owner) = v_owner), 0),
    coalesce((select limit_bytes from public.storage_limits where tier = coalesce(v_tier, 'free')), 2147483648);
end;
$$;

grant execute on function public.get_storage_usage() to authenticated;
