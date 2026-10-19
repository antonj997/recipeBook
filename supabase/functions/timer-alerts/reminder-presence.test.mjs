// Real PostgreSQL/WASM tests; no hosted project, credentials, or network delivery.
import { PGlite } from 'npm:@electric-sql/pglite@0.5.10';
import assert from 'node:assert/strict';

const user = 'a8a9dfba-3182-4cbb-a808-936fb0372034';
const session = 'e9634a1c-905c-46b2-92d4-d444e4e081a0';
const device = 'c472dffb-dd4b-4a2f-9f3f-e88918596e40';
const tab = 'b7719499-9338-4f59-b3be-54cb15c24001';
const otherTab = '6b425748-ce9b-4280-aed9-a8783d0bed48';
const nextSession = '4d69f629-1435-4dd1-af63-aa0e7e71c95f';
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture', keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) } };
const recipe = { instructions: ['Rest for 1 minute.'], stepDetails: [{ section: 'Serve', timerSeconds: 60 }] };
const timer = (revision = 1, deadline = Date.now() - 1000) => ({ key: '["soup",0,3276812606]', recipeId: 'soup', index: 0,
  definitionSeconds: 60, revision, deadline, snapshot: ['Rest for 1 minute.', null, 'Serve', true, 60] });

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, is_anonymous boolean default false);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users, not_after timestamptz);
    create table public.recipes(user_id uuid, id text, payload jsonb, deleted boolean default false, primary key(user_id,id));`);
  for (const name of ['20261019110511_timer_push_alerts.sql', '20261019173330_timer_reminder_presence.sql']) {
    await db.exec(await Deno.readTextFile(new URL('../../migrations/' + name, import.meta.url)));
  }
  await db.query('insert into auth.users(id) values ($1)', [user]);
  await db.query('insert into auth.sessions(id,user_id) values ($1,$2),($3,$2)', [session,user,nextSession]);
  await db.query("insert into public.recipes(user_id,id,payload) values ($1,'soup',$2)", [user,JSON.stringify(recipe)]);
  await manage(db, 'register', subscription);
  return db;
}
const manage = async (db, action, payload = {}, sid = session, did = device) =>
  (await db.query('select public.timer_alerts_manage($1,$2,$3,$4,$5) as value', [action,user,sid,did,JSON.stringify(payload)])).rows[0].value;
const claim = async (db) => (await db.query('select public.timer_alerts_claim() as value')).rows[0].value;
const authorize = async (db,item) => (await db.query('select public.timer_alerts_authorize($1,$2,$3) as value', [item.id,item.revision,item.claim_token])).rows[0].value;
const finish = async (db,item,outcome='sent') => (await db.query('select public.timer_alerts_finish($1,$2,$3,$4,15) as value', [item.id,item.revision,item.claim_token,outcome])).rows[0].value;
const job = async (db) => (await db.query('select * from private.timer_push_jobs')).rows[0];
async function reminderDue(db) {
  await db.exec("update private.timer_push_jobs set deadline=now()-interval '61 seconds', next_attempt_at=now()-interval '1 second'");
}

Deno.test('sent initial advances to exactly one reminder at original deadline plus sixty seconds', async () => {
  const db = await database();
  try {
    const original = timer();
    await manage(db,'sync',[original]);
    const [initial] = await claim(db);
    assert.equal((await authorize(db,initial)).notification_stage, 'initial');
    assert.equal(await finish(db,initial), true);
    const stored = await job(db);
    assert.equal(stored.notification_stage, 'reminder');
    assert.equal(stored.attempts, 0);
    assert.equal(stored.next_attempt_at.getTime() - stored.deadline.getTime(), 60000);
    assert.deepEqual(await claim(db), []);
    await manage(db,'sync',[original]);
    assert.equal((await job(db)).notification_stage, 'reminder');
    await reminderDue(db);
    const [reminder] = await claim(db);
    assert.equal(await finish(db,initial), false);
    assert.equal((await authorize(db,reminder)).notification_stage, 'reminder');
    assert.equal(await finish(db,reminder), true);
    assert.equal((await job(db)).state, 'sent');
    await manage(db,'sync',[original]);
    assert.deepEqual(await claim(db), []);
  } finally { await db.close(); }
});

Deno.test('newer sync revisions cannot replay an unchanged completed run but a new deadline restarts it', async () => {
  const db = await database();
  try {
    const original = timer(10,Date.now()-61000);
    await manage(db,'sync',[original]);
    const [reminder] = await claim(db);
    assert.equal((await authorize(db,reminder)).notification_stage,'reminder');
    await finish(db,reminder);
    await manage(db,'sync',[{...original,revision:11}]);
    const stored = await job(db);
    assert.equal(stored.revision,11);
    assert.equal(stored.state,'sent');
    assert.equal(stored.notification_stage,'reminder');
    assert.deepEqual(await claim(db),[]);
    const restarted = timer(12,Date.now()-1000);
    await manage(db,'sync',[restarted]);
    assert.equal((await job(db)).notification_stage,'initial');
    const [initial] = await claim(db);
    assert.equal((await authorize(db,initial)).notification_stage,'initial');
    await manage(db,'sync',[timer(13,null)]);
    await manage(db,'sync',[{...restarted,revision:14}]);
    assert.equal((await job(db)).state,'pending');
    assert.equal((await job(db)).notification_stage,'initial');
  } finally { await db.close(); }
});

Deno.test('same-run refresh preserves pending reminder timing and bounded retry progress', async () => {
  const db = await database();
  try {
    const original = timer(20);
    await manage(db,'sync',[original]);
    const [first] = await claim(db);
    await finish(db,first,'retry');
    const retry = await job(db);
    await manage(db,'sync',[{...original,revision:21}]);
    const refreshed = await job(db);
    assert.equal(refreshed.attempts,1);
    assert.equal(refreshed.next_attempt_at.getTime(),retry.next_attempt_at.getTime());
    await db.exec("update private.timer_push_jobs set next_attempt_at=now()-interval '1 second'");
    const [second] = await claim(db);
    await finish(db,second);
    const reminder = await job(db);
    await manage(db,'sync',[{...original,revision:22}]);
    const reconnected = await job(db);
    assert.equal(reconnected.notification_stage,'reminder');
    assert.equal(reconnected.next_attempt_at.getTime(),reminder.next_attempt_at.getTime());
    assert.deepEqual(await claim(db),[]);
  } finally { await db.close(); }
});

Deno.test('same-run revision refresh lets the matching active claim finish but restart still invalidates it', async () => {
  const db = await database();
  try {
    const original = timer(30);
    await manage(db,'sync',[original]);
    const [initial] = await claim(db);
    assert.ok(await authorize(db,initial));
    await manage(db,'sync',[{...original,revision:31}]);
    assert.ok(await authorize(db,initial));
    assert.equal(await finish(db,initial),true);
    assert.equal((await job(db)).notification_stage,'reminder');
    assert.equal((await job(db)).revision,31);
    await manage(db,'sync',[timer(32,Date.now()-61000)]);
    const [reminder] = await claim(db);
    await manage(db,'sync',[timer(33,Date.now()+120000)]);
    assert.equal(await authorize(db,reminder),null);
    assert.equal(await finish(db,reminder),false);
  } finally { await db.close(); }
});

Deno.test('each visible tab owns a short presence lease and hiding one cannot clear its sibling', async () => {
  const db = await database();
  try {
    await manage(db,'presence',{ tabId:tab,visible:true,leaseSeconds:999999 });
    await manage(db,'presence',{ tabId:otherTab,visible:true });
    // Registering another visible tab must preserve this tab's lease.
    await manage(db,'register',subscription);
    await manage(db,'presence',{ tabId:tab,visible:false });
    const rows = (await db.query('select tab_id,extract(epoch from (visible_until-now()))::int as remaining from private.timer_push_presence')).rows;
    assert.equal(rows.length,1);
    assert.equal(rows[0].tab_id,otherTab);
    assert.ok(rows[0].remaining > 0 && rows[0].remaining <= 25);
    await manage(db,'sync',[timer()]);
    const [initial] = await claim(db);
    assert.equal(await authorize(db,initial),null);
    assert.equal((await job(db)).notification_stage,'reminder');
    await reminderDue(db);
    const [reminder] = await claim(db);
    assert.equal(await authorize(db,reminder),null);
    assert.equal((await job(db)).state,'sent');
    assert.deepEqual(await claim(db),[]);
    await manage(db,'sync',[timer(2)]);
    await manage(db,'presence',{ tabId:otherTab,visible:false });
    const [background] = await claim(db);
    assert.ok(await authorize(db,background));
  } finally { await db.close(); }
});

Deno.test('a stale initial acknowledgement cannot overwrite a reminder claimed by a later worker', async () => {
  const db = await database();
  try {
    await manage(db,'sync',[timer()]);
    const [initial] = await claim(db);
    assert.ok(await authorize(db,initial));
    await reminderDue(db);
    const [reminder] = await claim(db);
    assert.notEqual(reminder.claim_token,initial.claim_token);
    assert.equal(await authorize(db,initial),null);
    assert.equal(await finish(db,initial,'retry'),false);
    assert.equal((await authorize(db,reminder)).notification_stage,'reminder');
    await finish(db,reminder);
    assert.deepEqual(await claim(db),[]);
  } finally { await db.close(); }
});

Deno.test('expired presence permits background pushes and registration cannot carry another session lease', async () => {
  const db = await database();
  try {
    await manage(db,'presence',{ tabId:tab,visible:true });
    await assert.rejects(manage(db,'presence',{ tabId:tab,visible:true },nextSession),/TIMER_DEVICE/);
    await assert.rejects(manage(db,'presence',{ tabId:tab,visible:true },session,otherTab),/TIMER_DEVICE/);
    await db.exec("update private.timer_push_presence set visible_until=now()-interval '1 second'");
    await manage(db,'sync',[timer()]);
    const [initial] = await claim(db);
    assert.ok(await authorize(db,initial));
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_presence')).rows[0].total,0);
    await manage(db,'presence',{ tabId:tab,visible:true });
    await manage(db,'register',subscription,nextSession);
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_presence')).rows[0].total,0);
    assert.equal(await authorize(db,initial),null);
    await db.query('delete from auth.sessions where id=$1',[session]);
    await assert.rejects(manage(db,'presence',{ tabId:tab,visible:true }),/TIMER_SESSION/);
  } finally { await db.close(); }
});

Deno.test('presence is limited to thirty-two live tabs and stays private to service RPCs', async () => {
  const db = await database();
  try {
    for (let i=0;i<32;i++) await manage(db,'presence',{tabId:crypto.randomUUID(),visible:true});
    await assert.rejects(manage(db,'presence',{tabId:tab,visible:true}),/TIMER_LIMIT/);
    await db.exec("update private.timer_push_presence set visible_until=now()-interval '1 second'");
    await manage(db,'presence',{tabId:tab,visible:true});
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_presence')).rows[0].total,1);
    await assert.rejects(manage(db,'presence',{tabId:tab,visible:'true'}),/TIMER_PRESENCE/);
    await db.exec('grant usage on schema private to authenticated');
    for (const role of ['anon','authenticated','service_role']) {
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from private.timer_push_presence'),/permission denied/);
      if (role!=='service_role') await assert.rejects(manage(db,'presence',{tabId:tab,visible:false}),/permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

Deno.test('late initial and exhausted initial retries advance once to the original one-minute reminder', async () => {
  const db = await database();
  try {
    await manage(db,'sync',[timer(1,Date.now()-61000)]);
    const lateClaims = await claim(db);
    assert.equal(lateClaims.length,1);
    const [late] = lateClaims;
    assert.equal((await authorize(db,late)).notification_stage,'reminder');
    assert.deepEqual(await claim(db),[]);
    await finish(db,late);
    assert.deepEqual(await claim(db),[]);
    await manage(db,'sync',[timer(2)]);
    for (let i=0;i<3;i++) {
      const [attempt] = await claim(db);
      assert.equal((await authorize(db,attempt)).attempts,i+1);
      await finish(db,attempt,'retry');
      await db.exec("update private.timer_push_jobs set next_attempt_at=now()-interval '1 second'");
    }
    assert.equal((await job(db)).notification_stage,'reminder');
    assert.equal((await job(db)).attempts,0);
    await reminderDue(db);
    for (let i=0;i<3;i++) {
      const [attempt] = await claim(db);
      assert.equal((await authorize(db,attempt)).notification_stage,'reminder');
      await finish(db,attempt,'retry');
      await db.exec("update private.timer_push_jobs set next_attempt_at=now()-interval '1 second'");
    }
    assert.deepEqual(await claim(db),[]);
    assert.equal((await job(db)).state,'failed');
  } finally { await db.close(); }
});

Deno.test('new revisions, cancellations, step edits and revoked sessions invalidate queued reminders', async () => {
  const db = await database();
  try {
    await manage(db,'sync',[timer(1)]);
    const [initial] = await claim(db); await finish(db,initial);
    await manage(db,'sync',[timer(2)]);
    assert.equal((await job(db)).notification_stage,'initial');
    assert.equal(await finish(db,initial),false);
    const [restart] = await claim(db); await finish(db,restart);
    await manage(db,'sync',[timer(3,null)]);
    assert.deepEqual(await claim(db),[]);
    await manage(db,'sync',[timer(4,Date.now()-61000)]);
    const [edited] = await claim(db);
    await db.exec("update public.recipes set payload=jsonb_set(payload,'{instructions,0}','\"Changed step\"')");
    assert.equal(await authorize(db,edited),null);
    await db.query('update public.recipes set payload=$1',[JSON.stringify(recipe)]);
    await manage(db,'sync',[timer(5,Date.now()-61000)]);
    const [revoked] = await claim(db);
    await db.query('delete from auth.sessions where id=$1',[session]);
    assert.equal(await authorize(db,revoked),null);
  } finally { await db.close(); }
});

Deno.test('the cron cleans jobs older than one hour while retaining cancellation tombstones', async () => {
  const db = await database();
  try {
    await manage(db,'sync',[timer(1)]);
    await db.exec("update private.timer_push_jobs set deadline=now()-interval '61 minutes'");
    await db.query('select private.dispatch_timer_alerts()');
    assert.equal((await db.query('select count(*)::int as total from private.timer_push_jobs')).rows[0].total,0);
    await manage(db,'sync',[timer(2,Date.now()+600000)]);
    await manage(db,'sync',[timer(3,null)]);
    await db.exec("update private.timer_push_jobs set updated_at=now()-interval '2 hours'");
    await db.query('select private.dispatch_timer_alerts()');
    await manage(db,'sync',[timer(2,Date.now()+600000)]);
    assert.equal((await job(db)).state,'cancelled');
    assert.deepEqual(await claim(db),[]);
  } finally { await db.close(); }
});
