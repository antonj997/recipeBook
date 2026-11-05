-- Sharing with people found by username. Every account with a username can be found by others
-- signed in (usernames are public by design); accounts without one are never listed. Sharing with
-- a listed account goes by its id, and the owner's list shows each recipient's current username.

create function public.search_usernames(query text)
returns table (user_id uuid, username text)
language sql stable security invoker set search_path = '' as $$
  with wanted as (
    select lower(ltrim(btrim(coalesce(query, '')), '@')) as q
  )
  select p.user_id, p.username
  from public.profiles p, wanted
  where wanted.q <> ''
    and p.user_id <> (select auth.uid())
    and strpos(p.username, wanted.q) > 0
  order by strpos(p.username, wanted.q), p.username
  limit 10;
$$;
revoke all on function public.search_usernames(text) from public, anon;
grant execute on function public.search_usernames(text) to authenticated;

-- Counts towards the same 30 attempts per hour as sharing by email or username.
create function private.share_recipe_with(recipe text, recipient uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  name text;
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
  if recipient = caller then return 'self'; end if;
  if not exists (select 1 from public.recipes r where r.user_id = caller and r.id = recipe and not r.deleted) then
    return 'not_found';
  end if;
  select p.username into name from public.profiles p where p.user_id = recipient;
  if name is null then return 'not_found'; end if;
  insert into public.recipe_shares as s (owner_id, recipe_id, recipient_id, label)
  values (caller, recipe, recipient, '@' || name)
  on conflict on constraint recipe_shares_pkey do nothing;
  return 'shared';
end;
$$;
revoke all on function private.share_recipe_with(text, uuid) from public, anon;
grant execute on function private.share_recipe_with(text, uuid) to authenticated;
create function public.share_recipe_with(recipe_id text, recipient uuid)
returns text language sql security invoker set search_path = '' as $$
  select private.share_recipe_with(recipe_id, recipient);
$$;
revoke all on function public.share_recipe_with(text, uuid) from public, anon;
grant execute on function public.share_recipe_with(text, uuid) to authenticated;

-- The owner's list with each recipient's current username; the label stays what the owner typed.
-- A new function beside recipe_recipients, so nothing in use is dropped.
create function public.recipe_people(recipe_id text)
returns table (recipient_id uuid, label text, username text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.recipient_id, s.label, p.username, s.created_at
  from public.recipe_shares s
  left join public.profiles p on p.user_id = s.recipient_id
  where s.owner_id = (select auth.uid()) and s.recipe_id = recipe_people.recipe_id
  order by s.created_at;
$$;
revoke all on function public.recipe_people(text) from public, anon;
grant execute on function public.recipe_people(text) to authenticated;

-- Which of your recipes are shared, so menus can say Manage sharing without asking each time.
create function public.my_shared_recipes()
returns table (recipe_id text, visibility text, recipients bigint)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.visibility,
    (select count(*) from public.recipe_shares s where s.owner_id = r.user_id and s.recipe_id = r.id)
  from public.recipes r
  where r.user_id = (select auth.uid()) and not r.deleted
    and (r.visibility = 'public'
         or exists (select 1 from public.recipe_shares s where s.owner_id = r.user_id and s.recipe_id = r.id));
$$;
revoke all on function public.my_shared_recipes() from public, anon;
grant execute on function public.my_shared_recipes() to authenticated;
