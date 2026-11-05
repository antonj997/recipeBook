-- Recipe sharing. A recipe can be public (anyone can find and read it, even signed out) or shared
-- with chosen accounts. Read access is granted here, in row-level security, so the private
-- cookbook stays the only copy: recipients always read the owner's latest version and save their
-- own copy in the app. Writes stay owner-only. Sync pulls filter on user_id, so recipes shared
-- with an account never enter its own cookbook.

-- Public usernames. Optional, lowercase, and unique; email addresses are never exposed.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,24}$')
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;
create policy "Read usernames" on public.profiles for select to anon, authenticated using (true);
create policy "Own username" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Change own username" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Remove own username" on public.profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Sync upserts never send visibility, so editing a recipe on any device keeps it shared.
alter table public.recipes add column visibility text not null default 'private'
  check (visibility in ('private', 'public'));
create index recipes_public_updated on public.recipes (updated_at desc, user_id desc, id desc)
  where visibility = 'public' and not deleted;

create table public.recipe_shares (
  owner_id uuid not null,
  recipe_id text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  -- What the owner typed (an email or @username), so the owner's list never reveals more.
  label text not null default '' check (length(label) <= 320),
  created_at timestamptz not null default now(),
  primary key (owner_id, recipe_id, recipient_id),
  foreign key (owner_id, recipe_id) references public.recipes(user_id, id) on delete cascade
);
create index recipe_shares_recipient on public.recipe_shares (recipient_id, created_at desc);
alter table public.recipe_shares enable row level security;
revoke all on public.recipe_shares from anon, authenticated;
grant select, delete on public.recipe_shares to authenticated;
create policy "Read own shares" on public.recipe_shares for select to authenticated
  using ((select auth.uid()) in (owner_id, recipient_id));
create policy "Owner removes shares" on public.recipe_shares for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Moderation and limits live in the private schema, out of the API's reach.
create table private.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table private.hidden_recipes (
  owner_id uuid not null,
  recipe_id text not null,
  primary key (owner_id, recipe_id),
  foreign key (owner_id, recipe_id) references public.recipes(user_id, id) on delete cascade
);
create table private.share_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
alter table private.admins enable row level security;
alter table private.hidden_recipes enable row level security;
alter table private.share_limits enable row level security;
revoke all on private.admins, private.hidden_recipes, private.share_limits from public, anon, authenticated;

create function private.caller_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = (select auth.uid()));
$$;
-- A hidden public recipe leaves Discover and its public link; admins still see it to undo that.
create function private.publicly_listed(owner uuid, recipe text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from private.hidden_recipes h where h.owner_id = owner and h.recipe_id = recipe)
    or private.caller_is_admin();
$$;
create function private.is_hidden(owner uuid, recipe text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.hidden_recipes h where h.owner_id = owner and h.recipe_id = recipe);
$$;
revoke all on function private.caller_is_admin(), private.publicly_listed(uuid, text), private.is_hidden(uuid, text)
  from public;
grant usage on schema private to anon;
grant execute on function private.caller_is_admin(), private.publicly_listed(uuid, text), private.is_hidden(uuid, text)
  to anon, authenticated;

-- anon had no access to recipes at all; it may now read, and only through the policy below.
grant select on public.recipes to anon;
create policy "Public recipes" on public.recipes for select to anon, authenticated
  using (not deleted and visibility = 'public' and private.publicly_listed(user_id, id));
create policy "Recipes shared with me" on public.recipes for select to authenticated using (
  not deleted and exists (
    select 1 from public.recipe_shares s
    where s.owner_id = recipes.user_id and s.recipe_id = recipes.id and s.recipient_id = (select auth.uid())
  )
);

-- A photo is readable when a recipe the caller may read points at exactly that file. The subquery
-- runs as the caller, so the recipe policies above decide.
create policy "Read shared recipe photos" on storage.objects for select to anon, authenticated using (
  bucket_id = 'recipe-photos' and exists (
    select 1 from public.recipes r
    where r.user_id::text = (storage.foldername(name))[1]
      and (r.photos->>'cover' = name
           or exists (select 1 from jsonb_each_text(coalesce(r.photos->'steps', '{}'::jsonb)) s
                      where s.value = name))
  )
);

create function public.username_available(name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select name ~ '^[a-z0-9._]{3,24}$' and not exists (
    select 1 from public.profiles p where p.username = name and p.user_id is distinct from (select auth.uid())
  );
$$;

-- Finds the recipient by exact email (case-insensitive) or username. Every attempt counts towards
-- 30 per hour, so the answer cannot be used to sweep through addresses.
create function private.share_recipe(recipe text, recipient text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  cleaned text := btrim(recipient);
  target uuid;
  affected integer;
begin
  if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into private.share_limits as limits (user_id, window_start, requests)
  values (caller, date_trunc('hour', now()), 1)
  on conflict (user_id) do update
  set window_start = excluded.window_start,
      requests = case when limits.window_start = excluded.window_start then limits.requests + 1 else 1 end
  where limits.window_start <> excluded.window_start or limits.requests < 30;
  get diagnostics affected = row_count;
  if affected = 0 then return 'limited'; end if;
  if not exists (select 1 from public.recipes r where r.user_id = caller and r.id = recipe and not r.deleted) then
    return 'not_found';
  end if;
  if position('@' in cleaned) > 1 then
    select u.id into target from auth.users u where lower(u.email) = lower(cleaned);
  else
    select p.user_id into target from public.profiles p where p.username = lower(ltrim(cleaned, '@'));
  end if;
  if target is null then return 'not_found'; end if;
  if target = caller then return 'self'; end if;
  insert into public.recipe_shares as s (owner_id, recipe_id, recipient_id, label)
  values (caller, recipe, target, left(cleaned, 320))
  on conflict on constraint recipe_shares_pkey do update set label = excluded.label;
  return 'shared';
end;
$$;
revoke all on function private.share_recipe(text, text) from public, anon;
grant execute on function private.share_recipe(text, text) to authenticated;
create function public.share_recipe(recipe_id text, recipient text)
returns text language sql security invoker set search_path = '' as $$
  select private.share_recipe(recipe_id, recipient);
$$;
revoke all on function public.share_recipe(text, text) from public, anon;
grant execute on function public.share_recipe(text, text) to authenticated;

create function public.recipe_recipients(recipe_id text)
returns table (recipient_id uuid, label text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.recipient_id, s.label, s.created_at from public.recipe_shares s
  where s.owner_id = (select auth.uid()) and s.recipe_id = recipe_recipients.recipe_id
  order by s.created_at;
$$;
revoke all on function public.recipe_recipients(text) from public, anon;
grant execute on function public.recipe_recipients(text) to authenticated;

create function public.shared_with_me()
returns table (owner_id uuid, recipe_id text, payload jsonb, photos jsonb, username text, shared_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select r.user_id, r.id, r.payload, r.photos, p.username, s.created_at
  from public.recipe_shares s
  join public.recipes r on r.user_id = s.owner_id and r.id = s.recipe_id and not r.deleted
  left join public.profiles p on p.user_id = s.owner_id
  where s.recipient_id = (select auth.uid())
  order by s.created_at desc;
$$;
revoke all on function public.shared_with_me() from public, anon;
grant execute on function public.shared_with_me() to authenticated;

-- Pages of 24, newest change first. The title search escapes LIKE wildcards.
create function public.discover_recipes(
  query text default '', after_at timestamptz default null, after_owner uuid default null, after_id text default null
)
returns table (owner_id uuid, recipe_id text, payload jsonb, photos jsonb, username text, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select r.user_id, r.id, r.payload, r.photos, p.username, r.updated_at
  from public.recipes r
  left join public.profiles p on p.user_id = r.user_id
  where r.visibility = 'public' and not r.deleted
    and not private.is_hidden(r.user_id, r.id)
    and (coalesce(query, '') = '' or r.payload->>'title' ilike
         '%' || replace(replace(replace(query, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (after_at is null or (r.updated_at, r.user_id, r.id) < (after_at, after_owner, after_id))
  order by r.updated_at desc, r.user_id desc, r.id desc
  limit 24;
$$;
grant execute on function public.discover_recipes(text, timestamptz, uuid, text) to anon, authenticated;

create function public.shared_recipe(owner uuid, recipe_id text)
returns table (owner_id uuid, recipe_id text, payload jsonb, photos jsonb, username text, visibility text, hidden boolean)
language sql stable security invoker set search_path = '' as $$
  select r.user_id, r.id, r.payload, r.photos, p.username, r.visibility,
    case when r.user_id = (select auth.uid()) or private.caller_is_admin() then private.is_hidden(r.user_id, r.id) end
  from public.recipes r
  left join public.profiles p on p.user_id = r.user_id
  where r.user_id = shared_recipe.owner and r.id = shared_recipe.recipe_id and not r.deleted;
$$;
grant execute on function public.shared_recipe(uuid, text) to anon, authenticated;

create function public.is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.caller_is_admin();
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function private.set_recipe_hidden(owner uuid, recipe text, hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.caller_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if hide then
    insert into private.hidden_recipes(owner_id, recipe_id) values (owner, recipe) on conflict do nothing;
  else
    delete from private.hidden_recipes h where h.owner_id = owner and h.recipe_id = recipe;
  end if;
end;
$$;
revoke all on function private.set_recipe_hidden(uuid, text, boolean) from public, anon;
grant execute on function private.set_recipe_hidden(uuid, text, boolean) to authenticated;
create function public.set_recipe_hidden(owner uuid, recipe_id text, hidden boolean)
returns void language sql security invoker set search_path = '' as $$
  select private.set_recipe_hidden(owner, recipe_id, hidden);
$$;
revoke all on function public.set_recipe_hidden(uuid, text, boolean) from public, anon;
grant execute on function public.set_recipe_hidden(uuid, text, boolean) to authenticated;
