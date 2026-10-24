-- Private per-account shopping contributions. Durable tombstones prevent offline resurrection.
create table public.shopping_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200 and length(btrim(id)) > 0),
  payload jsonb,
  deleted boolean not null default false,
  primary key (user_id, id),
  constraint shopping_items_payload_valid check (
    deleted or coalesce((
      payload is not null
      and jsonb_typeof(payload) = 'object'
      and jsonb_typeof(payload->'id') = 'string'
      and payload->>'id' = id
      and jsonb_typeof(payload->'text') = 'string'
      and length(payload->>'text') between 1 and 2000
      and length(btrim(payload->>'text')) > 0
      and jsonb_typeof(payload->'checked') = 'boolean'
    ), false)
  )
);

alter table public.shopping_items enable row level security;
revoke all on public.shopping_items from public, anon, authenticated;
grant select, insert, update on public.shopping_items to authenticated;

create policy "Read own shopping items" on public.shopping_items
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Add own shopping items" on public.shopping_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own shopping items" on public.shopping_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No DELETE grant or policy: clients persist deleted=true with a null payload instead.
-- The owner-first primary key also indexes account-scoped reads; source recipe titles
-- are snapshots inside payload, with no foreign key to recipes, so deletion is safe.
