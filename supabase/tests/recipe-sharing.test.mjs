// deno test --allow-read --allow-env --allow-net --no-lock supabase/tests/recipe-sharing.test.mjs
// Real PostgreSQL in WASM applies the actual migrations and checks who can read what, as each role.
import { PGlite } from 'npm:@electric-sql/pglite@0.5.10';
import assert from 'node:assert/strict';

const migrations = new URL('../migrations/', import.meta.url);
const owner = '11111111-1111-4111-8111-111111111111';
const friend = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const admin = '44444444-4444-4444-8444-444444444444';

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql as 'select ''{}''::jsonb';
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql
      as 'select string_to_array(name, ''/'')';
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to anon, authenticated;
    grant select on storage.objects to anon, authenticated;
  `);
  const files = [...Deno.readDirSync(migrations)]
    .map((entry) => entry.name)
    // Timer alerts need Supabase's own auth tables; sharing builds on the cookbook alone.
    .filter((name) => /_(private_cookbooks|shopping_items|cookbook_updated_at|recipe_sharing)\.sql$/.test(name))
    .sort();
  for (const file of files) await db.exec(await Deno.readTextFile(new URL(file, migrations)));
  await db.query(
    `insert into auth.users(id, email) values
       ($1, 'owner@example.com'), ($2, 'Friend@Example.com'), ($3, 'stranger@example.com'), ($4, 'admin@example.com')`,
    [owner, friend, stranger, admin],
  );
  await db.query('insert into private.admins(user_id) values ($1)', [admin]);
  return db;
}

/** Run one statement as an API role, with auth.uid() returning `uid`. */
function as(db, role, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('test.uid', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${role}`);
    return (await tx.query(sql, params)).rows;
  });
}
const user = (db, uid, sql, params) => as(db, 'authenticated', uid, sql, params);
const anon = (db, sql, params) => as(db, 'anon', null, sql, params);

async function recipe(db, id, { by = owner, visibility = 'private', deleted = false, title = 'Soup', photos = {} } = {}) {
  await db.query(
    `insert into public.recipes(user_id, id, payload, photos, deleted, visibility) values ($1, $2, $3, $4, $5, $6)`,
    [by, id, deleted ? null : JSON.stringify({ id, title, ingredients: [], instructions: [] }), JSON.stringify(photos), deleted, visibility],
  );
}
const ids = (rows) => rows.map((row) => row.id ?? row.recipe_id).sort();
async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message)));
}

Deno.test('anon reads only public, unhidden, live recipes', async () => {
  const db = await database();
  try {
    await recipe(db, 'private');
    await recipe(db, 'public', { visibility: 'public' });
    await recipe(db, 'hidden', { visibility: 'public' });
    await recipe(db, 'deleted', { visibility: 'public', deleted: true });
    await db.query(`insert into private.hidden_recipes(owner_id, recipe_id) values ($1, 'hidden')`, [owner]);
    assert.deepEqual(ids(await anon(db, 'select id from public.recipes')), ['public']);
    assert.deepEqual(ids(await user(db, stranger, 'select id from public.recipes')), ['public']);
    await rejects(anon(db, `insert into public.recipes(user_id, id, payload) values ($1, 'x', '{}')`, [owner]), /permission denied/);
  } finally {
    await db.close();
  }
});

Deno.test('a recipient reads what was shared with them and nothing else', async () => {
  const db = await database();
  try {
    await recipe(db, 'shared');
    await recipe(db, 'other');
    assert.equal((await user(db, owner, `select public.share_recipe('shared', 'friend@example.com') as r`))[0].r, 'shared');
    assert.deepEqual(ids(await user(db, friend, 'select id from public.recipes')), ['shared']);
    assert.deepEqual(ids(await user(db, stranger, 'select id from public.recipes')), []);
    assert.deepEqual(ids(await user(db, friend, 'select * from public.shared_with_me()')), ['shared']);
    assert.deepEqual(
      (await user(db, owner, `select label from public.recipe_recipients('shared')`)).map((row) => row.label),
      ['friend@example.com'],
    );
    assert.deepEqual(await user(db, stranger, `select * from public.recipe_recipients('shared')`), []);
    // The friend's sync pull filters on its own account and never sees the shared recipe.
    assert.deepEqual(ids(await user(db, friend, 'select id from public.recipes where user_id = $1', [friend])), []);
    await user(db, owner, `delete from public.recipe_shares where recipe_id = 'shared' and recipient_id = $1`, [friend]);
    assert.deepEqual(ids(await user(db, friend, 'select id from public.recipes')), []);
  } finally {
    await db.close();
  }
});

Deno.test('photos follow recipe visibility', async () => {
  const db = await database();
  try {
    const cover = `${owner}/cover.jpg`;
    const step = `${owner}/step.jpg`;
    const loose = `${owner}/loose.jpg`;
    const secret = `${owner}/secret.jpg`;
    await recipe(db, 'public', { visibility: 'public', photos: { cover, steps: { 0: step } } });
    await recipe(db, 'private', { photos: { cover: secret } });
    for (const name of [cover, step, loose, secret])
      await db.query(`insert into storage.objects(bucket_id, name) values ('recipe-photos', $1)`, [name]);
    const readable = async (rows) => rows.map((row) => row.name).sort();
    assert.deepEqual(await readable(await anon(db, 'select name from storage.objects')), [cover, step].sort());
    assert.deepEqual(await readable(await user(db, stranger, 'select name from storage.objects')), [cover, step].sort());
    assert.equal((await user(db, owner, 'select name from storage.objects')).length, 4);
    await db.query(`update public.recipes set deleted = true, payload = null where id = 'public'`);
    assert.deepEqual(await anon(db, 'select name from storage.objects'), []);
  } finally {
    await db.close();
  }
});

Deno.test('only the owner can publish or share', async () => {
  const db = await database();
  try {
    await recipe(db, 'mine');
    const changed = await user(db, stranger, `update public.recipes set visibility = 'public' where id = 'mine' returning id`);
    assert.equal(changed.length, 0);
    assert.equal((await user(db, stranger, `select public.share_recipe('mine', 'friend@example.com') as r`))[0].r, 'not_found');
    await rejects(
      user(db, stranger, `insert into public.recipe_shares(owner_id, recipe_id, recipient_id) values ($1, 'mine', $2)`, [owner, stranger]),
      /permission denied/,
    );
    const published = await user(db, owner, `update public.recipes set visibility = 'public' where id = 'mine' returning id`);
    assert.equal(published.length, 1);
    await rejects(user(db, owner, `update public.recipes set visibility = 'everyone' where id = 'mine'`), /check/);
  } finally {
    await db.close();
  }
});

Deno.test('usernames are unique regardless of case and validated', async () => {
  const db = await database();
  try {
    const set = (uid, name) => user(db, uid, 'insert into public.profiles(user_id, username) values ($1, $2)', [uid, name]);
    await rejects(set(owner, 'Anna'), /check/);
    await rejects(set(owner, 'a!'), /check/);
    await set(owner, 'anna');
    await rejects(set(friend, 'anna'), /duplicate|unique/);
    await rejects(user(db, friend, 'insert into public.profiles(user_id, username) values ($1, $2)', [owner, 'bob']), /row-level security|duplicate/);
    assert.equal((await user(db, friend, `select public.username_available('anna') as ok`))[0].ok, false);
    assert.equal((await user(db, owner, `select public.username_available('anna') as ok`))[0].ok, true);
    assert.equal((await user(db, friend, `select public.username_available('a!') as ok`))[0].ok, false);
    assert.equal((await anon(db, 'select username from public.profiles'))[0].username, 'anna');
  } finally {
    await db.close();
  }
});

Deno.test('share_recipe resolves email and username, and limits attempts', async () => {
  const db = await database();
  try {
    await recipe(db, 'soup');
    await db.query(`insert into public.profiles(user_id, username) values ($1, 'stranger')`, [stranger]);
    const share = async (recipient) =>
      (await user(db, owner, 'select public.share_recipe($1, $2) as r', ['soup', recipient]))[0].r;
    assert.equal(await share('FRIEND@example.com'), 'shared');
    assert.equal(await share('@stranger'), 'shared');
    assert.equal(await share('owner@example.com'), 'self');
    assert.equal(await share('nobody@example.com'), 'not_found');
    assert.equal(await share('nobody'), 'not_found');
    for (let i = 5; i < 30; i++) await share('nobody');
    assert.equal(await share('nobody'), 'limited');
    await rejects(anon(db, `select public.share_recipe('soup', 'friend@example.com')`), /permission denied/);
  } finally {
    await db.close();
  }
});

Deno.test('hidden recipes leave Discover but stay with recipients, and only admins hide', async () => {
  const db = await database();
  try {
    await recipe(db, 'soup', { visibility: 'public' });
    await user(db, owner, `select public.share_recipe('soup', 'friend@example.com')`);
    await rejects(user(db, stranger, `select public.set_recipe_hidden($1, 'soup', true)`, [owner]), /forbidden/);
    assert.equal((await user(db, stranger, 'select public.is_admin() as a'))[0].a, false);
    assert.equal((await user(db, admin, 'select public.is_admin() as a'))[0].a, true);
    await user(db, admin, `select public.set_recipe_hidden($1, 'soup', true)`, [owner]);
    assert.deepEqual(await anon(db, 'select * from public.discover_recipes()'), []);
    assert.deepEqual(await anon(db, `select * from public.shared_recipe($1, 'soup')`, [owner]), []);
    assert.deepEqual(ids(await user(db, friend, 'select id from public.recipes')), ['soup']);
    const seen = await user(db, admin, `select hidden from public.shared_recipe($1, 'soup')`, [owner]);
    assert.equal(seen[0].hidden, true);
    await user(db, admin, `select public.set_recipe_hidden($1, 'soup', false)`, [owner]);
    assert.deepEqual(ids(await anon(db, 'select * from public.discover_recipes()')), ['soup']);
  } finally {
    await db.close();
  }
});

Deno.test('discover pages and searches public recipes', async () => {
  const db = await database();
  try {
    await db.exec(`insert into public.profiles(user_id, username) values ('${owner}', 'anna')`);
    for (let i = 0; i < 30; i++)
      await recipe(db, `r${String(i).padStart(2, '0')}`, { visibility: 'public', title: i === 7 ? 'Tomato SOUP' : 'Bread' });
    await recipe(db, 'secret', { title: 'Soup' });
    const first = await anon(db, 'select * from public.discover_recipes()');
    assert.equal(first.length, 24);
    assert.equal(first[0].username, 'anna');
    const last = first.at(-1);
    const second = await anon(db, 'select * from public.discover_recipes($1, $2, $3, $4)', [
      '',
      last.updated_at,
      last.owner_id,
      last.recipe_id,
    ]);
    assert.equal(second.length, 6);
    assert.equal(new Set([...first, ...second].map((row) => row.recipe_id)).size, 30);
    assert.deepEqual(ids(await anon(db, `select * from public.discover_recipes('soup')`)), ['r07']);
    assert.deepEqual(ids(await anon(db, `select * from public.discover_recipes('%')`)), []);
  } finally {
    await db.close();
  }
});

Deno.test('a sync upsert keeps visibility, and shared_recipe returns the author', async () => {
  const db = await database();
  try {
    await recipe(db, 'soup', { visibility: 'public' });
    await user(
      db,
      owner,
      `insert into public.recipes(user_id, id, payload) values ($1, 'soup', $2)
       on conflict (user_id, id) do update set payload = excluded.payload`,
      [owner, JSON.stringify({ id: 'soup', title: 'Better soup', ingredients: [], instructions: [] })],
    );
    const [row] = await anon(db, `select * from public.shared_recipe($1, 'soup')`, [owner]);
    assert.equal(row.visibility, 'public');
    assert.equal(row.payload.title, 'Better soup');
    assert.equal(row.username, null);
    assert.equal(row.hidden, null);
  } finally {
    await db.close();
  }
});
