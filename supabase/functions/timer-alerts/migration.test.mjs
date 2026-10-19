// Deno test --allow-read --allow-env --allow-net --no-lock migration.test.mjs
// Real PostgreSQL in WASM; no Docker, live database, or recipe contents required.
import { PGlite } from 'npm:@electric-sql/pglite@0.5.10';
import assert from 'node:assert/strict';

const migrationUrl = new URL('../../migrations/20261019110511_timer_push_alerts.sql', import.meta.url);
const user = 'a8a9dfba-3182-4cbb-a808-936fb0372034';
const otherUser = '64cc2d88-453d-4a3a-8d8b-c2ca83961f58';
const session = 'e9634a1c-905c-46b2-92d4-d444e4e081a0';
const otherSession = '4d69f629-1435-4dd1-af63-aa0e7e71c95f';
const device = 'c472dffb-dd4b-4a2f-9f3f-e88918596e40';
const otherDevice = 'b7719499-9338-4f59-b3be-54cb15c24001';
const payload = { id: 'soup', instructions: ['Rest for 1 minute.'], stepDetails: [{ section: 'Serve', timerSeconds: 60 }] };
const endpoint = 'https://fcm.googleapis.com/fcm/send/fixture';
const subscription = { endpoint, keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } };
const snapshot = ['Rest for 1 minute.', null, 'Serve', true, 60];

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create table public.recipes(user_id uuid, id text, payload jsonb, deleted boolean default false, primary key(user_id,id));
  `);
  await db.exec(await Deno.readTextFile(migrationUrl));
  await db.query('insert into auth.users(id) values ($1), ($2)', [user, otherUser]);
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2),($3,$4)', [session, user, otherSession, otherUser]);
  await db.query('insert into public.recipes(user_id,id,payload) values ($1,$2,$3)', [user, 'soup', JSON.stringify(payload)]);
  return db;
}
async function manage(db, action, value = {}, who = user, sid = session, did = device) {
  const result = await db.query('select public.timer_alerts_manage($1,$2,$3,$4,$5) as value', [action, who, sid, did, JSON.stringify(value)]);
  return result.rows[0].value;
}
function timer(revision, deadline = Date.now() - 1000) {
  return { key: '["soup",0,3276812606]', recipeId: 'soup', index: 0, definitionSeconds: 60, revision, deadline, snapshot };
}
async function claim(db) { return (await db.query('select public.timer_alerts_claim() as value')).rows[0].value; }
async function authorize(db, item) {
  return (await db.query('select public.timer_alerts_authorize($1,$2,$3) as value', [item.id, item.revision, item.claim_token])).rows[0].value;
}

Deno.test('cancel tombstones and equal revisions prevent delayed requests from reviving a job', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    assert.equal((await manage(db, 'sync', [timer(10)])).scheduled, 1);
    await manage(db, 'sync', [timer(12, null)]);
    await manage(db, 'sync', [timer(11)]);
    await manage(db, 'sync', [timer(12)]);
    assert.deepEqual(await claim(db), []);
    assert.equal((await db.query('select revision, state from private.timer_push_jobs')).rows[0].revision, 12);
    await manage(db, 'sync', [timer(13)]);
    assert.equal((await claim(db)).length, 1);
  } finally { await db.close(); }
});

Deno.test('claims exclude another worker and stale revisions cannot authorize or acknowledge', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    await manage(db, 'sync', [timer(10)]);
    const [first] = await claim(db);
    assert.equal((await authorize(db, first)).recipe_id, 'soup');
    assert.deepEqual(await claim(db), []);
    await manage(db, 'sync', [timer(11, null)]);
    assert.equal(await authorize(db, first), null);
    await db.query("select public.timer_alerts_finish($1,$2,$3,'sent',0)", [first.id, first.revision, first.claim_token]);
    assert.equal((await db.query('select state from private.timer_push_jobs')).rows[0].state, 'cancelled');
  } finally { await db.close(); }
});

Deno.test('revoked sessions, deleted recipes and edited timer definitions stop delivery', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    await manage(db, 'sync', [timer(10)]);
    const [first] = await claim(db);
    await db.query("update public.recipes set payload=jsonb_set(payload,'{stepDetails,0,timerSeconds}','120')");
    assert.equal(await authorize(db, first), null);
    await db.query('update public.recipes set payload=$1', [JSON.stringify(payload)]);
    await manage(db, 'sync', [timer(11)]);
    const [second] = await claim(db);
    await db.query('update public.recipes set deleted=true');
    assert.equal(await authorize(db, second), null);
    await db.query('update public.recipes set deleted=false');
    await manage(db, 'sync', [timer(12)]);
    const [third] = await claim(db);
    await db.query('delete from auth.sessions where id=$1', [session]);
    assert.equal(await authorize(db, third), null);
    await assert.rejects(manage(db, 'sync', [timer(13)]), /TIMER_SESSION/);
  } finally { await db.close(); }
});

Deno.test('missing or changed server snapshot is explicitly unavailable', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    const wrong = { ...timer(1), snapshot: ['unsynced edit', null, 'Serve', true, 60] };
    const result = await manage(db, 'sync', [wrong]);
    assert.equal(result.scheduled, 0);
    assert.equal(result.unavailable.length, 1);
    assert.deepEqual(await claim(db), []);
    await manage(db, 'sync', [timer(1)]);
    assert.deepEqual(await claim(db), []);
    assert.equal((await manage(db, 'sync', [timer(2)])).scheduled, 1);
    assert.equal((await claim(db)).length, 1);
  } finally { await db.close(); }
});

Deno.test('endpoint ownership cannot be shared across active accounts and revoked owners transfer safely', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    await assert.rejects(manage(db, 'register', subscription, otherUser, otherSession, otherDevice), /TIMER_ENDPOINT/);
    await db.query('delete from auth.sessions where id=$1', [session]);
    await manage(db, 'register', subscription, otherUser, otherSession, otherDevice);
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_devices where enabled')).rows[0].total, 1);
  } finally { await db.close(); }
});

Deno.test('service RPCs and private data grant no access to public client roles', async () => {
  const db = await database();
  try {
    // Existing cookbook helpers already give authenticated schema usage.
    await db.exec('grant usage on schema private to authenticated');
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query('select * from private.timer_push_devices'), /permission denied/);
      await assert.rejects(db.query('select public.timer_alerts_claim()'), /permission denied/);
      await assert.rejects(db.query("select public.timer_alerts_ready('https://projectref.supabase.co','digest')"), /permission denied/);
      await assert.rejects(manage(db, 'register', subscription), /permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

Deno.test('readiness requires a matching Vault secret, URL and active cron job', async () => {
  const db = await database();
  try {
    const ready = async () => (await db.query("select public.timer_alerts_ready('https://projectref.supabase.co', encode(sha256(convert_to(repeat('x',64),'UTF8')),'hex')) as value")).rows[0].value;
    assert.equal(await ready(), false);
    await db.exec(`
      create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
      create schema cron; create table cron.job(jobname text, active boolean, schedule text, command text);
      create schema net;
      create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as 'select 1::bigint';
      insert into vault.decrypted_secrets values ('recipebook_timer_dispatch_secret', repeat('x',64)), ('recipebook_timer_project_url','https://projectref.supabase.co');
      insert into cron.job values ('recipe-timer-alerts',true,'10 seconds','select private.dispatch_timer_alerts();');
    `);
    assert.equal(await ready(), true);
    await db.exec('update cron.job set active=false');
    assert.equal(await ready(), false);
    await db.exec('update cron.job set active=true');
    await db.exec("update vault.decrypted_secrets set decrypted_secret='different' where name='recipebook_timer_dispatch_secret'");
    assert.equal(await ready(), false);
  } finally { await db.close(); }
});

Deno.test('device and active-job limits are atomic across separate sync batches', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    for (let i = 1; i < 10; i++) await manage(db, 'register', { ...subscription, endpoint: endpoint + '/' + i }, user, session, crypto.randomUUID());
    await assert.rejects(manage(db, 'register', { ...subscription, endpoint: endpoint + '/11' }, user, session, crypto.randomUUID()), /TIMER_LIMIT_DEVICES/);
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_devices where enabled')).rows[0].total, 10);
    await db.query('update public.recipes set payload=$1', [JSON.stringify({ ...payload, instructions: Array(101).fill(payload.instructions[0]), stepDetails: Array(101).fill(payload.stepDetails[0]) })]);
    const timers = Array.from({ length: 101 }, (_, index) => ({ ...timer(1), index, key: JSON.stringify(['soup', index, 3276812606]) }));
    await manage(db, 'sync', timers.slice(0, 100));
    await assert.rejects(manage(db, 'sync', [timers[100]]), /TIMER_LIMIT_JOBS/);
    assert.equal((await db.query("select count(*)::int as total from private.timer_push_jobs where state='pending'")).rows[0].total, 100);
    await manage(db, 'sync', [{ ...timers[0], revision: 2, deadline: null }, timers[100]]);
    assert.equal((await db.query("select count(*)::int as total from private.timer_push_jobs where state='pending'")).rows[0].total, 100);
  } finally { await db.close(); }
});

Deno.test('expired leases replace claim tokens and delivery attempts stop at three', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    await manage(db, 'sync', [timer(1)]);
    const [first] = await claim(db);
    await db.exec("update private.timer_push_jobs set lease_until=now()-interval '1 second'");
    const [second] = await claim(db);
    assert.notEqual(first.claim_token, second.claim_token);
    assert.equal(await authorize(db, first), null);
    assert.equal((await authorize(db, second)).attempts, 2);
    await db.query("select public.timer_alerts_finish($1,$2,$3,'retry',0)", [second.id, second.revision, second.claim_token]);
    await db.exec("update private.timer_push_jobs set next_attempt_at=now()-interval '1 second'");
    const [third] = await claim(db);
    assert.equal((await authorize(db, third)).attempts, 3);
    await db.query("select public.timer_alerts_finish($1,$2,$3,'retry',0)", [third.id, third.revision, third.claim_token]);
    assert.deepEqual(await claim(db), []);
    assert.equal((await db.query('select state from private.timer_push_jobs')).rows[0].state, 'failed');
  } finally { await db.close(); }
});

Deno.test('expired subscription credentials are removed and photo edits do not cancel valid steps', async () => {
  const db = await database();
  try {
    await manage(db, 'register', subscription);
    await manage(db, 'sync', [timer(1)]);
    const [item] = await claim(db);
    await db.query("update public.recipes set payload=jsonb_set(payload,'{stepDetails,0,imageDataUrl}','\"data:image/jpeg;base64,fixture\"')");
    assert.ok(await authorize(db, item));
    await db.query("select public.timer_alerts_finish($1,$2,$3,'expired',0)", [item.id, item.revision, item.claim_token]);
    const [stored] = (await db.query('select enabled,subscription,endpoint,endpoint_hash from private.timer_push_devices')).rows;
    assert.deepEqual(stored, { enabled: false, subscription: null, endpoint: null, endpoint_hash: null });
    assert.equal(await authorize(db, item), null);
    assert.equal((await db.query('select revision,state from private.timer_push_jobs')).rows[0].revision, 1);
  } finally { await db.close(); }
});
