// deno test --allow-read --allow-env --allow-net --no-lock supabase/tests/cookbook-sync.test.mjs
// Real PostgreSQL in WASM applies the actual cookbook migrations; no live database is touched.
import { PGlite } from 'npm:@electric-sql/pglite@0.5.10';
import assert from 'node:assert/strict';

const migrations = new URL('../migrations/', import.meta.url);
const user = 'a8a9dfba-3182-4cbb-a808-936fb0372034';
const tables = ['recipes', 'collections', 'shopping_items'];
const payloads = {
  recipes: (id) => ({ id, title: 'Soup', ingredients: [], instructions: [] }),
  collections: (id) => ({ id, name: 'Dinner', sortOrder: 0 }),
  shopping_items: (id) => ({ id, text: '2 onions', checked: false }),
};

async function database({ updatedAt = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function auth.jwt() returns jsonb language sql as 'select ''{}''::jsonb';
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql
      as 'select string_to_array(name, ''/'')';
  `);
  for (const file of ['20260930070934_private_cookbooks.sql', '20261024230433_shopping_items.sql'])
    await db.exec(await Deno.readTextFile(new URL(file, migrations)));
  await db.query('insert into auth.users(id) values ($1)', [user]);
  if (updatedAt) await db.exec(await Deno.readTextFile(new URL(syncMigration(), migrations)));
  return db;
}
function syncMigration() {
  const file = [...Deno.readDirSync(migrations)]
    .map((entry) => entry.name)
    .find((name) => name.endsWith('_cookbook_updated_at.sql'));
  assert.ok(file, 'the updated_at migration exists');
  return file;
}
async function put(db, table, id, extra = '') {
  await db.query(
    `insert into public.${table}(user_id, id, payload${extra ? ', updated_at' : ''})
     values ($1, $2, $3${extra ? ', $4' : ''})
     on conflict (user_id, id) do update set payload = excluded.payload${extra ? ', updated_at = excluded.updated_at' : ''}`,
    extra ? [user, id, JSON.stringify(payloads[table](id)), extra] : [user, id, JSON.stringify(payloads[table](id))],
  );
}
async function stamp(db, table, id) {
  const { rows } = await db.query(`select updated_at from public.${table} where user_id = $1 and id = $2`, [user, id]);
  return new Date(rows[0].updated_at).getTime();
}

Deno.test('stamps every insert and update with server time, ignoring client values', async () => {
  const db = await database();
  try {
    for (const table of tables) {
      const before = Date.now() - 60_000;
      await put(db, table, 'a', '2000-01-01T00:00:00Z');
      const inserted = await stamp(db, table, 'a');
      assert.ok(inserted > before, `${table} insert uses server time`);
      await new Promise((resolve) => setTimeout(resolve, 15));
      await put(db, table, 'a', '2000-01-01T00:00:00Z');
      assert.ok((await stamp(db, table, 'a')) > inserted, `${table} update moves the stamp forward`);
    }
  } finally {
    await db.close();
  }
});

Deno.test('tombstones are stamped too, so other devices learn about deletions', async () => {
  const db = await database();
  try {
    await put(db, 'recipes', 'gone');
    const first = await stamp(db, 'recipes', 'gone');
    await new Promise((resolve) => setTimeout(resolve, 15));
    await db.query(`update public.recipes set deleted = true, payload = null where id = 'gone'`);
    assert.ok((await stamp(db, 'recipes', 'gone')) > first);
  } finally {
    await db.close();
  }
});

Deno.test('rows that existed before the migration get a timestamp', async () => {
  const db = await database({ updatedAt: false });
  try {
    for (const table of tables) await put(db, table, 'old');
    await db.exec(await Deno.readTextFile(new URL(syncMigration(), migrations)));
    for (const table of tables) assert.ok((await stamp(db, table, 'old')) > 0);
  } finally {
    await db.close();
  }
});

Deno.test('a keyset page after a cursor reads the owner index in order', async () => {
  const db = await database();
  try {
    for (const table of tables) {
      for (const id of ['b', 'a', 'c']) await put(db, table, id);
      await db.exec('set enable_seqscan = off');
      const query = `select id from public.${table}
        where user_id = $1 and (updated_at, id) > ($2::timestamptz, $3)
        order by updated_at, id limit 500`;
      const plan = (await db.query('explain ' + query, [user, '1970-01-01', ''])).rows
        .map((row) => row['QUERY PLAN'])
        .join('\n');
      assert.match(plan, new RegExp(`${table}_user_updated`), plan);
      const page = (await db.query(query, [user, '1970-01-01', ''])).rows.map((row) => row.id);
      assert.deepEqual(page, ['b', 'a', 'c']);
      await db.exec('reset enable_seqscan');
    }
  } finally {
    await db.close();
  }
});

Deno.test('clients cannot call the trigger function directly', async () => {
  const db = await database();
  try {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', 'private.touch_updated_at()', 'execute') as allowed`,
    );
    assert.equal(rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
