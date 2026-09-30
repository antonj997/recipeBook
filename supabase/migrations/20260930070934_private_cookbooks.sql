-- Private cookbooks. Text IDs preserve existing device backups as well as UUID recipes.
create table public.recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  payload jsonb,
  photos jsonb not null default '{}'::jsonb check (jsonb_typeof(photos) = 'object'),
  deleted boolean not null default false,
  primary key (user_id, id),
  check (deleted or coalesce((payload is not null and jsonb_typeof(payload) = 'object'
    and payload->>'id' = id and length(payload->>'title') > 0
    and jsonb_typeof(payload->'ingredients') = 'array'
    and jsonb_typeof(payload->'instructions') = 'array'), false))
);
create table public.collections (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  payload jsonb,
  photos jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  primary key (user_id, id),
  check (deleted or coalesce((payload is not null and jsonb_typeof(payload) = 'object'
    and payload->>'id' = id and length(payload->>'name') > 0
    and jsonb_typeof(payload->'sortOrder') = 'number'), false))
);
alter table public.recipes enable row level security;
alter table public.collections enable row level security;
revoke all on public.recipes, public.collections from anon, authenticated;
grant select, insert, update on public.recipes, public.collections to authenticated;
create policy "Own recipes" on public.recipes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own collections" on public.collections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- The owner-first primary keys also index all account-scoped queries.
-- Tombstones keep another device from resurrecting recipes deleted while it was offline.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 1500000, array['image/jpeg'])
on conflict (id) do nothing;
create policy "Read own recipe photos" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Add own recipe photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Update own recipe photos" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Global, atomic per-account import limits, rather than a per-function-instance counter.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.recipe_import_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  photo boolean not null,
  window_start timestamptz not null,
  requests integer not null,
  primary key (user_id, photo)
);
alter table private.recipe_import_limits enable row level security;
revoke all on private.recipe_import_limits from public, anon, authenticated;
create function private.claim_recipe_import(is_photo boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  allowed integer := case when is_photo then 150 else 30 end;
  affected integer;
begin
  if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return false;
  end if;
  insert into private.recipe_import_limits as limits (user_id, photo, window_start, requests)
  values (caller, is_photo, date_trunc('hour', now()), 1)
  on conflict (user_id, photo) do update
  set window_start = excluded.window_start,
      requests = case when limits.window_start = excluded.window_start then limits.requests + 1 else 1 end
  where limits.window_start <> excluded.window_start or limits.requests < allowed;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function private.claim_recipe_import(boolean) from public, anon;
grant execute on function private.claim_recipe_import(boolean) to authenticated;
-- The exposed wrapper uses caller privileges; privileged work stays in a private schema.
create function public.claim_recipe_import(photo boolean default false)
returns boolean language sql security invoker set search_path = '' as $$
  select private.claim_recipe_import(photo);
$$;
revoke all on function public.claim_recipe_import(boolean) from public, anon;
grant execute on function public.claim_recipe_import(boolean) to authenticated;
