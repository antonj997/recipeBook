-- Created with `supabase migration new timer_reminder_presence`.
-- Source only: extends the existing queue without changing its deployed migration.
-- The original deadline stays fixed; only next_attempt_at and notification_stage advance.
alter table private.timer_push_jobs add column notification_stage text not null default 'initial'
  check (notification_stage in ('initial', 'reminder'));

create table private.timer_push_presence (
  user_id uuid not null,
  device_id uuid not null,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  tab_id uuid not null,
  visible_until timestamptz not null,
  primary key (user_id, device_id, tab_id),
  foreign key (user_id, device_id) references private.timer_push_devices(user_id, device_id) on delete cascade
);
create index timer_push_presence_expiry on private.timer_push_presence(visible_until);
alter table private.timer_push_presence enable row level security;
revoke all on private.timer_push_presence from public, anon, authenticated, service_role;

-- No user-facing table access; all presence writes pass the existing verified session gate.
create or replace function private.timer_alerts_manage(p_action text, p_user uuid, p_session uuid, p_device uuid, p_payload jsonb)
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
  if p_action not in ('register', 'sync', 'disable', 'presence') then raise exception 'TIMER_ACTION'; end if;
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
      delete from private.timer_push_presence where user_id = owner.user_id and device_id = owner.device_id;
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
    delete from private.timer_push_presence where user_id = p_user and device_id = p_device
      and (session_id <> p_session or current_device.subscription is distinct from p_payload or not coalesce(current_device.enabled, false));
    return jsonb_build_object('ok', true);
  end if;

  if p_action = 'disable' then
    -- A delayed cleanup from an older session must never disable a new registration.
    if current_device.session_id = p_session then
      delete from private.timer_push_presence where user_id = p_user and device_id = p_device;
      update private.timer_push_devices set enabled = false, endpoint = null, endpoint_hash = null, subscription = null, updated_at = now()
        where user_id = p_user and device_id = p_device;
      update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
        where user_id = p_user and device_id = p_device;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if not coalesce(current_device.enabled, false) or current_device.session_id <> p_session then raise exception 'TIMER_DEVICE'; end if;
  if p_action = 'presence' then
    if jsonb_typeof(p_payload) is distinct from 'object'
      or jsonb_typeof(p_payload->'visible') is distinct from 'boolean'
      or coalesce(p_payload->>'tabId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'TIMER_PRESENCE';
    end if;
    delete from private.timer_push_presence where visible_until <= now();
    if (p_payload->>'visible')::boolean then
      if not exists (select 1 from private.timer_push_presence
        where user_id = p_user and device_id = p_device and tab_id = (p_payload->>'tabId')::uuid)
        and (select count(*) from private.timer_push_presence where user_id = p_user and device_id = p_device) >= 32 then
        raise exception 'TIMER_LIMIT_TABS';
      end if;
      insert into private.timer_push_presence(user_id, device_id, session_id, tab_id, visible_until)
        values (p_user, p_device, p_session, (p_payload->>'tabId')::uuid, now() + interval '25 seconds')
        on conflict (user_id, device_id, tab_id) do update set
          session_id = excluded.session_id, visible_until = excluded.visible_until;
    else
      delete from private.timer_push_presence where user_id = p_user and device_id = p_device
        and session_id = p_session and tab_id = (p_payload->>'tabId')::uuid;
    end if;
    return jsonb_build_object('ok', true);
  end if;
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
      end if;
    end if;
    -- A newer sync revision can describe the same running timer. Preserve delivery
    -- progress and its active claim; refreshing a page must never rearm a sent alert.
    if target_state = 'pending' and existing.session_id = p_session and existing.deadline = target_deadline
      and existing.step_fingerprint = fingerprint and existing.definition_seconds = (item->>'definitionSeconds')::integer
      and existing.recipe_id = item->>'recipeId' and existing.step_index = (item->>'index')::integer then
      update private.timer_push_jobs set revision = (item->>'revision')::bigint, updated_at = now() where id = existing.id;
      if existing.state in ('pending', 'sending') then scheduled := scheduled + 1; end if;
      continue;
    end if;
    if target_state = 'pending' then scheduled := scheduled + 1; end if;
    insert into private.timer_push_jobs(user_id, device_id, session_id, key_hash, timer_key, recipe_id, step_index,
      definition_seconds, step_fingerprint, revision, deadline, state, next_attempt_at)
    values (p_user, p_device, p_session, key_digest, item->>'key', item->>'recipeId', (item->>'index')::integer,
      (item->>'definitionSeconds')::integer, fingerprint, (item->>'revision')::bigint, target_deadline, target_state, target_deadline)
    on conflict (user_id, device_id, key_hash) do update set
      session_id = excluded.session_id, timer_key = excluded.timer_key, recipe_id = excluded.recipe_id,
      step_index = excluded.step_index, definition_seconds = excluded.definition_seconds, step_fingerprint = excluded.step_fingerprint,
      revision = excluded.revision, deadline = excluded.deadline, state = excluded.state, next_attempt_at = excluded.next_attempt_at,
      notification_stage = 'initial', attempts = 0, claim_token = null, lease_until = null, updated_at = now()
    where timer_push_jobs.revision < excluded.revision;
  end loop;
  if (select count(*) from private.timer_push_jobs where user_id = p_user and device_id = p_device and state in ('pending', 'sending')) > 100 then
    raise exception 'TIMER_LIMIT_JOBS';
  end if;
  return jsonb_build_object('ok', true, 'scheduled', scheduled, 'unavailable', unavailable);
end;
$$;


-- Retain cancellation revisions: an old request with a future deadline must stay cancelled.
-- Expired deadlines cannot be rearmed by sync (its existing five-minute admission limit).
create function private.timer_alerts_cleanup()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.timer_push_presence where visible_until <= now();
  delete from private.timer_push_jobs where deadline < now() - interval '1 hour';
end;
$$;

create or replace function private.timer_alerts_claim()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.timer_alerts_cleanup();
  -- Late/abandoned initial alerts are consumed, never retried into the reminder window.
  -- Clear the old token even when its lease is still live: its acknowledgement is stale.
  update private.timer_push_jobs set notification_stage = 'reminder', state = 'pending', attempts = 0,
    next_attempt_at = deadline + interval '60 seconds', claim_token = null, lease_until = null, updated_at = now()
    where notification_stage = 'initial' and state in ('pending', 'sending')
      and (deadline + interval '60 seconds' <= now()
        or (attempts >= 3 and (state = 'pending' or lease_until <= now())));
  update private.timer_push_jobs set state = 'failed', next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
    where notification_stage = 'reminder' and state in ('pending', 'sending')
      and (deadline + interval '6 minutes' < now()
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

create or replace function private.timer_alerts_authorize(p_id uuid, p_revision bigint, p_claim uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job private.timer_push_jobs%rowtype;
  device private.timer_push_devices%rowtype;
  recipe jsonb;
  snapshot jsonb;
  delivery_at timestamptz;
begin
  -- Same-run syncs may advance revision while this exact claim is in flight.
  -- Every restart/cancellation clears its token, so an older run still cannot match.
  select * into job from private.timer_push_jobs where id = p_id and revision >= p_revision and claim_token = p_claim
    and state = 'sending' and lease_until > now() for update;
  if not found then return null; end if;
  select * into device from private.timer_push_devices where user_id = job.user_id and device_id = job.device_id;
  select payload into recipe from public.recipes where user_id = job.user_id and id = job.recipe_id and not deleted;
  snapshot := private.timer_step_snapshot(recipe, job.step_index);
  delivery_at := job.deadline + case when job.notification_stage = 'reminder' then interval '60 seconds' else interval '0 seconds' end;
  if not coalesce(device.enabled, false) or device.session_id <> job.session_id
    or not private.timer_session_valid(job.user_id, job.session_id)
    or snapshot is null or encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') is distinct from job.step_fingerprint then
    update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now() where id = p_id;
    return null;
  end if;
  -- Apple requires a visible notification for every push. Suppress at the server,
  -- before releasing credentials, while this exact device/session has a visible tab.
  if (job.notification_stage = 'initial' and job.deadline + interval '60 seconds' <= now())
    or delivery_at < now() - interval '5 minutes'
    or exists (select 1 from private.timer_push_presence p
      where p.user_id = job.user_id and p.device_id = job.device_id and p.session_id = job.session_id and p.visible_until > now()) then
    perform private.timer_alerts_finish(p_id, p_revision, p_claim, 'consumed', 0);
    return null;
  end if;
  return jsonb_build_object('id', job.id, 'claim_token', job.claim_token, 'revision', p_revision,
    'timer_key', job.timer_key, 'key_hash', job.key_hash, 'recipe_id', job.recipe_id, 'step_index', job.step_index,
    'subscription', device.subscription, 'deadline', job.deadline, 'delivery_at', delivery_at,
    'notification_stage', job.notification_stage, 'attempts', job.attempts);
end;
$$;

create or replace function private.timer_alerts_finish(p_id uuid, p_revision bigint, p_claim uuid, p_outcome text, p_delay integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job private.timer_push_jobs%rowtype; expires_at timestamptz;
begin
  select * into job from private.timer_push_jobs where id = p_id and revision >= p_revision and claim_token = p_claim
    and state = 'sending' and lease_until > now() for update;
  if not found then return false; end if;
  expires_at := job.deadline + case when job.notification_stage = 'initial' then interval '60 seconds' else interval '6 minutes' end;
  if p_outcome = 'expired' then
    update private.timer_push_devices set enabled = false, endpoint = null, endpoint_hash = null, subscription = null, updated_at = now()
      where user_id = job.user_id and device_id = job.device_id and session_id = job.session_id;
    delete from private.timer_push_presence where user_id = job.user_id and device_id = job.device_id and session_id = job.session_id;
    update private.timer_push_jobs set state = 'cancelled', deadline = null, next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now()
      where user_id = job.user_id and device_id = job.device_id;
  elsif p_outcome = 'retry' and job.attempts < 3 and expires_at > now() then
    update private.timer_push_jobs set state = 'pending',
      next_attempt_at = least(expires_at, now() + make_interval(secs => greatest(15, least(p_delay, 60)))),
      claim_token = null, lease_until = null, updated_at = now() where id = p_id;
  elsif job.notification_stage = 'initial' then
    update private.timer_push_jobs set notification_stage = 'reminder', state = 'pending', attempts = 0,
      next_attempt_at = deadline + interval '60 seconds', claim_token = null, lease_until = null, updated_at = now() where id = p_id;
  else
    update private.timer_push_jobs set state = case when p_outcome in ('sent', 'consumed') then 'sent' else 'failed' end,
      next_attempt_at = null, claim_token = null, lease_until = null, updated_at = now() where id = p_id;
  end if;
  return true;
end;
$$;

create or replace function private.dispatch_timer_alerts()
returns bigint language plpgsql security definer set search_path = '' as $$
declare dispatcher_secret text; project_url text; request_id bigint;
begin
  perform private.timer_alerts_cleanup();
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

-- CREATE OR REPLACE retains the existing service-only RPC grants.
revoke all on function private.timer_alerts_cleanup() from public, anon, authenticated, service_role;
