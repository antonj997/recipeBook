-- Incremental sync. Every row carries the server time of its last change, so a device can pull
-- only rows changed after its cursor instead of the whole cookbook. The trigger ignores any
-- client value. now() is the transaction start, so a transaction that commits late can carry an
-- earlier stamp than rows already pulled: clients re-read a short overlap before their cursor,
-- which is harmless because applying an unchanged row changes nothing.
create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

alter table public.recipes add column updated_at timestamptz not null default now();
alter table public.collections add column updated_at timestamptz not null default now();
alter table public.shopping_items add column updated_at timestamptz not null default now();

create trigger touch_updated_at before insert or update on public.recipes
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before insert or update on public.collections
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before insert or update on public.shopping_items
  for each row execute function private.touch_updated_at();

-- Keyset pages: where user_id = ? and (updated_at, id) > (?, ?) order by updated_at, id.
create index recipes_user_updated on public.recipes (user_id, updated_at, id);
create index collections_user_updated on public.collections (user_id, updated_at, id);
create index shopping_items_user_updated on public.shopping_items (user_id, updated_at, id);
