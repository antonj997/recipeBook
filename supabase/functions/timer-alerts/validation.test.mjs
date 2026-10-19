import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction, notificationPayload, retryOutcome, verifiedSessionId, limitedJson, prepareTimer } from './validation.mjs';

const deviceId = 'a8a9dfba-3182-4cbb-a808-936fb0372034';
const now = 1_800_000_000_000;
const timer = { key: '["soup",0,123]', recipeId: 'soup', index: 0, definitionSeconds: 60, deadline: now + 60_000, revision: 12 };
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) },
};

test('sync keeps cancellations and exact safe integer revisions', () => {
  const result = validateAction({ action: 'sync', deviceId, timers: [{ ...timer, deadline: null, revision: Number.MAX_SAFE_INTEGER }] }, now);
  assert.equal(result.timers[0].deadline, null);
  assert.equal(result.timers[0].revision, 9007199254740991);
});

test('invalid timer shapes, duplicate keys and deadlines beyond seven days are rejected', () => {
  for (const invalid of [
    { ...timer, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...timer, revision: -1 },
    { ...timer, definitionSeconds: 0 }, { ...timer, definitionSeconds: 604801 },
    { ...timer, deadline: now + 604_800_001 }, { ...timer, deadline: 'soon' },
    { ...timer, index: -1 }, { ...timer, recipeId: '' }, { ...timer, key: 'x'.repeat(1001) },
    { ...timer, index: 10000 },
  ]) assert.throws(() => validateAction({ action: 'sync', deviceId, timers: [invalid] }, now));
  assert.throws(() => validateAction({ action: 'sync', deviceId, timers: [timer, timer] }, now));
  assert.throws(() => validateAction({ action: 'sync', deviceId, timers: Array(101).fill(timer) }, now));
  assert.throws(() => validateAction({ action: 'disable', deviceId: 'not-a-uuid' }, now));
});

test('register permits browser push services while rejecting SSRF and malformed keys', () => {
  assert.equal(validateAction({ action: 'register', deviceId, subscription }, now).subscription.endpoint, subscription.endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.test/x',
    'https://127.0.0.1/x', 'https://fcm.googleapis.com:444/x',
    'https://user:password@fcm.googleapis.com/x', 'https://web.push.apple.com/x#secret',
    'https://evil.notify.windows.com.evil.test/x',
  ]) assert.throws(() => validateAction({ action: 'register', deviceId, subscription: { ...subscription, endpoint } }, now));
  for (const keys of [{ p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) }, { ...subscription.keys, auth: 'short' }])
    assert.throws(() => validateAction({ action: 'register', deviceId, subscription: { ...subscription, keys } }, now));
  for (const endpoint of ['https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-bl2p.notify.windows.com/x'])
    assert.equal(validateAction({ action: 'register', deviceId, subscription: { ...subscription, endpoint } }, now).subscription.endpoint, endpoint);
});

test('only a verified JWT matching the fresh user yields a session identity', () => {
  const token = (claims) => 'header.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
  assert.equal(verifiedSessionId(token({ sub: deviceId, session_id: deviceId }), deviceId), deviceId);
  assert.throws(() => verifiedSessionId(token({ sub: 'someone-else', session_id: deviceId }), deviceId));
  assert.throws(() => verifiedSessionId(token({ sub: deviceId }), deviceId));
  assert.throws(() => verifiedSessionId('malformed', deviceId));
});

test('payload reveals only generic step detail and navigates within the app', () => {
  const payload = notificationPayload({ timer_key: timer.key, revision: 12, recipe_id: 'a/b?secret', step_index: 2, key_hash: 'abc', instruction: 'private' });
  assert.equal(payload.notification.title, 'Recipe timer finished');
  assert.equal(payload.notification.body, 'Step 3 is ready to check');
  assert.equal(payload.notification.data.onActionClick.default.url, '/recipeBook/#/recipes/a%2Fb%3Fsecret');
  assert.equal(payload.notification.data.timerKey, timer.key);
  assert.equal(JSON.stringify(payload).includes('private'), false);
});

test('expired endpoints are removed, transient failures retry only within a short bounded window', () => {
  assert.equal(retryOutcome(410, 1, 60).state, 'expired');
  assert.equal(retryOutcome(404, 1, 60).state, 'expired');
  assert.deepEqual(retryOutcome(503, 1, 30), { state: 'retry', delaySeconds: 15 });
  assert.equal(retryOutcome(429, 3, 30).state, 'failed');
  assert.equal(retryOutcome(500, 1, 301).state, 'failed');
  assert.equal(retryOutcome(403, 1, 10).state, 'failed');
});

test('streamed bodies are bounded by bytes even without content length', async () => {
  assert.deepEqual(await limitedJson(new Request('https://app.test', { method: 'POST', body: '{"action":"config"}' })), { action: 'config' });
  const bytes = new TextEncoder().encode('x'.repeat(65_537));
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
  await assert.rejects(limitedJson(new Request('https://app.test', { method: 'POST', body: stream, duplex: 'half' })), /too large/i);
});

test('only the exact synced step identity can be armed; cancellations need no recipe', () => {
  const recipe = { id: 'soup', instructions: ['Rest for 1 minute.'], stepDetails: [{ section: 'Serve', timerSeconds: 60 }] };
  // Literal identity from the existing app for [text, section, seconds].
  const target = { ...timer, key: '["soup",0,3276812606]' };
  assert.ok(prepareTimer(target, recipe));
  assert.equal(prepareTimer(target, { ...recipe, instructions: ['Rest for 2 minutes.'] }), null);
  assert.equal(prepareTimer(target, { ...recipe, stepDetails: [{ section: 'Serve', timerSeconds: null }] }), null);
  assert.equal(prepareTimer(target, { ...recipe, stepDetails: [null] }), null);
  assert.equal(prepareTimer(target, null), null);
  assert.equal(prepareTimer({ ...timer, deadline: null }, null).deadline, null);
});
