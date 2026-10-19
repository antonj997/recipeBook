-- Created with `supabase migration new timer_push_alerts`.
-- Source only. Deployment also requires Edge secrets and the two named Vault entries.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to service_role;

create table private.timer_push_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  session_id uuid not null,
  endpoint text,
  endpoint_hash text unique,
  subscription jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id),
  check (not enabled or (endpoint is not null and subscription is not null))
);
create table private.timer_push_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null,
  session_id uuid not null,
  key_hash text not null,
  timer_key text not null check (octet_length(timer_key) between 1 and 1000),
  recipe_id text not null check (octet_length(recipe_id) between 1 and 200),
  step_index integer not null check (step_index between 0 and 9999),
  definition_seconds integer not null check (definition_seconds between 1 and 604800),
  step_fingerprint text,
  revision bigint not null check (revision between 0 and 9007199254740991),
  deadline timestamptz,
  state text not null check (state in ('pending', 'sending', 'cancelled', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz,
  claim_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, device_id, key_hash),
  foreign key (user_id, device_id) references private.timer_push_devices(user_id, device_id) on delete cascade
);
create index timer_push_jobs_due on private.timer_push_jobs(next_attempt_at)
  where state in ('pending', 'sending');
alter table private.timer_push_devices enable row level security;
alter table private.timer_push_jobs enable row level security;
revoke all on private.timer_push_devices, private.timer_push_jobs from public, anon, authenticated, service_role;

-- The only privileged reads needed are sessions/users and the private queue.
-- All exposed RPC wrappers below are invokers executable exclusively by service_role.
create function private.timer_session_valid(p_user uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = p_session and s.user_id = p_user
      and not coalesce(u.is_anonymous, false)
      and (s.not_after is null or s.not_after > now())
  );
$$;

-- No recipe text is copied to the queue: only this snapshot's SHA256 digest persists.
-- The presence bit preserves the difference between automatic and disabled timers.
create function private.timer_step_snapshot(p_payload jsonb, p_index integer)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_payload->'instructions'->p_index) = 'string' then
    jsonb_build_array(
      p_payload->'instructions'->p_index,
      p_payload->'stepDetails'->p_index->'title',
      p_payload->'stepDetails'->p_index->'section',
      coalesce((p_payload->'stepDetails'->p_index) ? 'timerSeconds', false),
      p_payload->'stepDetails'->p_index->'timerSeconds'
    ) else null end;
$$;

create function private.timer_alerts_manage(p_action text, p_user uuid, p_session uuid, p_device uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner private.timer_push_devices%rowtype;
  current_device private.timer_push_devices%rowtype;
  item jsonb;
  recipe jsonb;
  snapshot jsonb;
  fingerprint text;
  key_digest text;
  endpoint_digest text;
  target_deadline timestamptz;
  target_state text;
  scheduled integer := 0;
  unavailable jsonb := '[]'::jsonb;
  existing private.timer_push_jobs%rowtype;
begin
  if p_user is null or p_session is null or p_device is null or not private.timer_session_valid(p_user, p_session) then
    raise exception 'TIMER_SESSION';
  end if;
  if p_action not in ('register', 'sync', 'disable') then raise exception 'TIMER_ACTION'; end if;
  -- Serialize per-account device/active-job limits, including concurrent requests.
  -- Endpoint registration also serializes globally before taking the account lock.
  if p_action = 'register' then
    if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload->>'endpoint') not between 1 and 4096
      or jsonb_typeof(p_payload->'keys') <> 'object' then raise exception 'TIMER_SUBSCRIPTION'; end if;
    endpoint_digest := encode(sha256(convert_to(p_payload->>'endpoint', 'UTF8')), 'hex');
    perform pg_advisory_xact_lock(hashtextextended('timer-endpoint:' || endpoint_digest, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('timer-user:' || p_user::text, 0));
  select * into current_device from private.timer_push_devices where user_id = p_user and device_id = p_device for update;

  if p_action = 'register' then
    select * into owner from private.timer_push_devices where endpoint_hash = endpoint_digest for update;
    if found and (owner.user_id <> p_user or owner.device_id <> p_device) then
      if owner.subscription->'keys' is distinct from p_payload->'keys'
        or (owner.user_id <> p_user and private.timer_session_valid(owner.user_id, owner.session_id)) then
        raise exception 'TIMER_ENDPOINT';
      end if;
      update private.timer_push_devices set enabled = false, endpoint = null, endpoint_hash = null, subscription = null, updated_at = now()
        where user_id = owner.user_id and device_id = owner.device_id;
      update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
        where user_id = owner.user_id and device_id = owner.device_id;
    end if;
    if not coalesce(current_device.enabled, false)
      and (select count(*) from private.timer_push_devices where user_id = p_user and enabled) >= 10 then
      raise exception 'TIMER_LIMIT_DEVICES';
    end if;
    if current_device.session_id is distinct from p_session
      or current_device.subscription is distinct from p_payload then
      update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
        where user_id = p_user and device_id = p_device;
    end if;
    insert into private.timer_push_devices(user_id, device_id, session_id, endpoint, endpoint_hash, subscription)
      values (p_user, p_device, p_session, p_payload->>'endpoint', endpoint_digest, p_payload)
      on conflict (user_id, device_id) do update set
        session_id = excluded.session_id, endpoint = excluded.endpoint, endpoint_hash = excluded.endpoint_hash,
        subscription = excluded.subscription, enabled = true, updated_at = now();
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'disable' then
    -- A delayed cleanup from an older session must never disable a new registration.
    if current_device.session_id = p_session then
      update private.timer_push_devices set enabled = false, endpoint = null, endpoint_hash = null, subscription = null, updated_at = now()
        where user_id = p_user and device_id = p_device;
      update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
        where user_id = p_user and device_id = p_device;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if not coalesce(current_device.enabled, false) or current_device.session_id <> p_session then raise exception 'TIMER_DEVICE'; end if;
  if jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) > 100 then raise exception 'TIMER_LIMIT_BATCH'; end if;
  for item in select value from jsonb_array_elements(p_payload) loop
    if jsonb_typeof(item) <> 'object' or octet_length(item->>'key') not between 1 and 1000
      or octet_length(item->>'recipeId') not between 1 and 200
      or (item->>'index')::integer not between 0 and 9999
      or (item->>'definitionSeconds')::integer not between 1 and 604800
      or (item->>'revision')::bigint not between 0 and 9007199254740991
      or not (item ? 'deadline') then raise exception 'TIMER_PAYLOAD'; end if;
    key_digest := encode(sha256(convert_to(item->>'key', 'UTF8')), 'hex');
    select * into existing from private.timer_push_jobs where user_id = p_user and device_id = p_device and key_hash = key_digest for update;
    if found and existing.revision >= (item->>'revision')::bigint then
      if existing.revision = (item->>'revision')::bigint and existing.state in ('pending', 'sending') then scheduled := scheduled + 1; end if;
      continue;
    end if;
    target_deadline := null;
    target_state := 'cancelled';
    fingerprint := null;
    if item->'deadline' <> 'null'::jsonb then
      target_deadline := to_timestamp((item->>'deadline')::numeric / 1000);
      if target_deadline > now() + interval '7 days' then raise exception 'TIMER_DEADLINE'; end if;
      select payload into recipe from public.recipes where user_id = p_user and id = item->>'recipeId' and not deleted;
      snapshot := private.timer_step_snapshot(recipe, (item->>'index')::integer);
      if snapshot is null or snapshot is distinct from item->'snapshot' or target_deadline < now() - interval '5 minutes' then
        unavailable := unavailable || jsonb_build_array(jsonb_build_object('key', item->>'key', 'reason', 'Recipe or timer changes are not synced.'));
        target_deadline := null;
      else
        fingerprint := encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex');
        target_state := 'pending';
        scheduled := scheduled + 1;
      end if;
    end if;
    insert into private.timer_push_jobs(user_id, device_id, session_id, key_hash, timer_key, recipe_id, step_index,
      definition_seconds, step_fingerprint, revision, deadline, state, next_attempt_at)
    values (p_user, p_device, p_session, key_digest, item->>'key', item->>'recipeId', (item->>'index')::integer,
      (item->>'definitionSeconds')::integer, fingerprint, (item->>'revision')::bigint, target_deadline, target_state, target_deadline)
    on conflict (user_id, device_id, key_hash) do update set
      session_id = excluded.session_id, timer_key = excluded.timer_key, recipe_id = excluded.recipe_id,
      step_index = excluded.step_index, definition_seconds = excluded.definition_seconds, step_fingerprint = excluded.step_fingerprint,
      revision = excluded.revision, deadline = excluded.deadline, state = excluded.state, next_attempt_at = excluded.next_attempt_at,
      attempts = 0, claim_token = null, lease_until = null, updated_at = now()
    where timer_push_jobs.revision < excluded.revision;
  end loop;
  if (select count(*) from private.timer_push_jobs where user_id = p_user and device_id = p_device and state in ('pending', 'sending')) > 100 then
    raise exception 'TIMER_LIMIT_JOBS';
  end if;
  return jsonb_build_object('ok', true, 'scheduled', scheduled, 'unavailable', unavailable);
end;
$$;

create function private.timer_alerts_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  -- Fail closed on abandoned final attempts and timers more than five minutes late.
  update private.timer_push_jobs set state = 'failed', next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
    where state in ('pending', 'sending') and (deadline < now() - interval '5 minutes'
      or (attempts >= 3 and (state = 'pending' or lease_until <= now())));
  with due as (
    select id from private.timer_push_jobs
    where state in ('pending', 'sending') and next_attempt_at <= now() and attempts < 3
      and (state = 'pending' or lease_until <= now())
    order by next_attempt_at, id limit 20 for update skip locked
  ), claimed as (
    update private.timer_push_jobs j set state = 'sending', attempts = attempts + 1,
      claim_token = gen_random_uuid(), lease_until = now() + interval '2 minutes', updated_at = now()
    from due where j.id = due.id returning j.id, j.revision, j.claim_token
  ) select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) into result from claimed;
  return result;
end;
$$;

create function private.timer_alerts_authorize(p_id uuid, p_revision bigint, p_claim uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job private.timer_push_jobs%rowtype;
  device private.timer_push_devices%rowtype;
  recipe jsonb;
  snapshot jsonb;
begin
  select * into job from private.timer_push_jobs where id = p_id and revision = p_revision and claim_token = p_claim
    and state = 'sending' and lease_until > now() for update;
  if not found then return null; end if;
  select * into device from private.timer_push_devices where user_id = job.user_id and device_id = job.device_id;
  select payload into recipe from public.recipes where user_id = job.user_id and id = job.recipe_id and not deleted;
  snapshot := private.timer_step_snapshot(recipe, job.step_index);
  if not coalesce(device.enabled, false) or device.session_id <> job.session_id
    or not private.timer_session_valid(job.user_id, job.session_id)
    or snapshot is null or encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') is distinct from job.step_fingerprint
    or job.deadline < now() - interval '5 minutes' then
    update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now() where id = p_id;
    return null;
  end if;
  return jsonb_build_object('id', job.id, 'claim_token', job.claim_token, 'revision', job.revision,
    'timer_key', job.timer_key, 'key_hash', job.key_hash, 'recipe_id', job.recipe_id, 'step_index', job.step_index,
    'subscription', device.subscription, 'deadline', job.deadline, 'attempts', job.attempts);
end;
$$;

create function private.timer_alerts_finish(p_id uuid, p_revision bigint, p_claim uuid, p_outcome text, p_delay integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job private.timer_push_jobs%rowtype;
begin
  select * into job from private.timer_push_jobs where id = p_id and revision = p_revision and claim_token = p_claim and state = 'sending' and lease_until > now() for update;
  if not found then return false; end if;
  if p_outcome = 'expired' then
    -- Remove dead credentials while preserving job revisions and cancellation tombstones.
    update private.timer_push_devices set enabled = false, endpoint = null, endpoint_hash = null, subscription = null, updated_at = now()
      where user_id = job.user_id and device_id = job.device_id and session_id = job.session_id;
    update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
      where user_id = job.user_id and device_id = job.device_id;
  elsif p_outcome = 'retry' and job.attempts < 3 and job.deadline >= now() - interval '5 minutes' then
    update private.timer_push_jobs set state = 'pending', next_attempt_at = now() + make_interval(secs => greatest(15, least(p_delay, 60))),
      claim_token = null, lease_until = null, updated_at = now() where id = p_id;
  else
    update private.timer_push_jobs set state = case when p_outcome = 'sent' then 'sent' else 'failed' end,
      next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now() where id = p_id;
  end if;
  return true;
end;
$$;

create function public.timer_alerts_manage(p_action text, p_user uuid, p_session uuid, p_device uuid, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.timer_alerts_manage(p_action, p_user, p_session, p_device, p_payload);
$$;
create function public.timer_alerts_claim()
returns jsonb language sql security invoker set search_path = '' as $$ select private.timer_alerts_claim(); $$;
create function public.timer_alerts_authorize(p_id uuid, p_revision bigint, p_claim uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select private.timer_alerts_authorize(p_id, p_revision, p_claim); $$;
create function public.timer_alerts_finish(p_id uuid, p_revision bigint, p_claim uuid, p_outcome text, p_delay integer)
returns boolean language sql security invoker set search_path = '' as $$ select private.timer_alerts_finish(p_id, p_revision, p_claim, p_outcome, p_delay); $$;

revoke all on function private.timer_session_valid(uuid, uuid), private.timer_step_snapshot(jsonb, integer),
  private.timer_alerts_manage(text, uuid, uuid, uuid, jsonb), private.timer_alerts_claim(),
  private.timer_alerts_authorize(uuid, bigint, uuid), private.timer_alerts_finish(uuid, bigint, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.timer_alerts_manage(text, uuid, uuid, uuid, jsonb), public.timer_alerts_claim(),
  public.timer_alerts_authorize(uuid, bigint, uuid), public.timer_alerts_finish(uuid, bigint, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function private.timer_alerts_manage(text, uuid, uuid, uuid, jsonb), private.timer_alerts_claim(),
  private.timer_alerts_authorize(uuid, bigint, uuid), private.timer_alerts_finish(uuid, bigint, uuid, text, integer),
  public.timer_alerts_manage(text, uuid, uuid, uuid, jsonb), public.timer_alerts_claim(),
  public.timer_alerts_authorize(uuid, bigint, uuid), public.timer_alerts_finish(uuid, bigint, uuid, text, integer)
  to service_role;

-- Enable supported hosted extensions; unavailable local runtimes retain the source queue.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    execute 'create extension if not exists supabase_vault with schema vault';
  end if;
end;
$$;

create function private.dispatch_timer_alerts()
returns bigint language plpgsql security definer set search_path = '' as $$
declare dispatcher_secret text; project_url text; request_id bigint;
begin
  if not exists (select 1 from private.timer_push_jobs where state in ('pending', 'sending') and next_attempt_at <= now()
    and (state = 'pending' or lease_until <= now())) then return null; end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return null; end if;
  select decrypted_secret into dispatcher_secret from vault.decrypted_secrets where name = 'recipebook_timer_dispatch_secret';
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'recipebook_timer_project_url';
  -- A separate 256-bit random secret, never the service key, and a trusted hosted URL.
  if dispatcher_secret is null or length(dispatcher_secret) < 43
    or project_url is null or project_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' then return null; end if;
  select net.http_post(url := project_url || '/functions/v1/timer-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatcher_secret),
    body := '{"action":"dispatch"}'::jsonb, timeout_milliseconds := 60000) into request_id;
  return request_id;
end;
$$;
revoke all on function private.dispatch_timer_alerts() from public, anon, authenticated, service_role;

do $$
begin
  if to_regnamespace('cron') is not null and to_regnamespace('net') is not null and to_regclass('vault.decrypted_secrets') is not null then
    perform cron.schedule('recipe-timer-alerts', '10 seconds', 'select private.dispatch_timer_alerts();');
  end if;
end;
$$;

-- The browser must not claim alerts are armed when the dispatcher is unconfigured.
-- Only the Edge function can ask; neither the Vault value nor its digest is returned.
create function private.timer_alerts_ready(p_project_url text, p_secret_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare stored_secret text; stored_url text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('cron.job') is null then return false; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then return false; end if;
  select decrypted_secret into stored_secret from vault.decrypted_secrets where name = 'recipebook_timer_dispatch_secret';
  select decrypted_secret into stored_url from vault.decrypted_secrets where name = 'recipebook_timer_project_url';
  return coalesce(length(stored_secret) >= 43 and stored_url = p_project_url
    and stored_url ~ '^https://[a-z0-9]+[.]supabase[.]co$'
    and encode(sha256(convert_to(stored_secret, 'UTF8')), 'hex') = p_secret_hash
    and exists (select 1 from cron.job where jobname = 'recipe-timer-alerts' and active and schedule = '10 seconds'
      and command = 'select private.dispatch_timer_alerts();'), false);
end;
$$;
create function public.timer_alerts_ready(p_project_url text, p_secret_hash text)
returns boolean language sql security invoker set search_path = '' as $$ select private.timer_alerts_ready(p_project_url, p_secret_hash); $$;
revoke all on function private.timer_alerts_ready(text, text), public.timer_alerts_ready(text, text) from public, anon, authenticated;
grant execute on function private.timer_alerts_ready(text, text), public.timer_alerts_ready(text, text) to service_role;
