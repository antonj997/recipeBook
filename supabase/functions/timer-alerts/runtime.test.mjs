import webpush from 'npm:web-push@3.6.7';
import assert from 'node:assert/strict';
import { notificationPayload } from './validation.mjs';

Deno.test('pinned Web Push encryption and VAPID signing work in the Deno runtime', async () => {
  const vapid = webpush.generateVAPIDKeys();
  const browserKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/runtime-fixture', keys: {
    p256dh: toBase64(await crypto.subtle.exportKey('raw', browserKey.publicKey)),
    auth: toBase64(crypto.getRandomValues(new Uint8Array(16))),
  } };
  const payload = JSON.stringify(notificationPayload({ timer_key: 'opaque-key', recipe_id: 'fixture', revision: 1, step_index: 0, key_hash: '123abc' }));
  const details = webpush.generateRequestDetails(subscription, payload, {
    vapidDetails: { ...vapid, subject: 'mailto:timer-tests@example.com' },
    contentEncoding: 'aes128gcm', TTL: 300, urgency: 'high', topic: '123abc',
  });
  assert.equal(details.method, 'POST');
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
  assert.match(details.headers.Authorization, /^vapid t=.+, k=/);
  assert.ok(details.body.length > payload.length);
  assert.equal(new TextDecoder().decode(details.body).includes('Recipe timer finished'), false);
});

Deno.test('HTTP actions enforce separate dispatcher and fresh-user authorization', async () => {
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'TIMER_DISPATCH_SECRET'];
  const originalValues = names.map((name) => Deno.env.get(name));
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const vapid = webpush.generateVAPIDKeys();
  const dispatcherSecret = 'test-only-' + crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const values = ['https://projectref.supabase.co', 'service-role-fixture', vapid.publicKey, vapid.privateKey, 'mailto:timer-tests@example.com', dispatcherSecret];
  names.forEach((name, i) => Deno.env.set(name, values[i]));
  const userId = 'a8a9dfba-3182-4cbb-a808-936fb0372034';
  const sessionId = 'e9634a1c-905c-46b2-92d4-d444e4e081a0';
  const token = 'e30.' + btoa(JSON.stringify({ sub: userId, session_id: sessionId })).replace(/=+$/, '') + '.signature';
  let handler;
  let freshAuthCalls = 0;
  let revoked = false;
  let anonymous = false;
  Deno.serve = (callback) => { handler = callback; return {}; };
  globalThis.fetch = async (input, options) => {
    const request = input instanceof Request ? input : new Request(input, options);
    const url = new URL(request.url);
    if (url.pathname === '/auth/v1/user') {
      freshAuthCalls++;
      assert.equal(request.headers.get('authorization'), 'Bearer ' + token);
      return Response.json({ id: userId, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com',
        app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
        created_at: '2026-01-01T00:00:00Z', is_anonymous: anonymous });
    }
    assert.equal(request.headers.get('authorization'), 'Bearer service-role-fixture');
    if (url.pathname === '/rest/v1/rpc/timer_alerts_ready') return Response.json(true);
    if (url.pathname === '/rest/v1/rpc/timer_alerts_claim') return Response.json([]);
    if (url.pathname === '/rest/v1/rpc/timer_alerts_manage') {
      const args = await request.json();
      assert.equal(args.p_user, userId);
      assert.equal(args.p_session, sessionId);
      if (revoked) return Response.json({ code: 'P0001', message: 'TIMER_SESSION' }, { status: 400 });
      return Response.json({ ok: true });
    }
    throw new Error('Unexpected backend network boundary.');
  };
  const post = (body, bearer, origin) => handler(new Request('https://edge.test/timer-alerts', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}), ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  }));
  try {
    await import('./index.ts');
    const config = await post({ action: 'config' }, undefined, 'http://127.0.0.1:4302');
    assert.equal(config.status, 200);
    assert.equal((await config.json()).ready, true);
    assert.equal(freshAuthCalls, 0);
    assert.equal((await post({ action: 'disable', deviceId: userId })).status, 401);
    assert.equal((await post({ action: 'dispatch' }, token)).status, 401);
    assert.equal(freshAuthCalls, 0);
    assert.equal((await post({ action: 'disable', deviceId: userId }, token)).status, 200);
    assert.equal(freshAuthCalls, 1);
    revoked = true;
    assert.equal((await post({ action: 'disable', deviceId: userId }, token)).status, 401);
    anonymous = true;
    assert.equal((await post({ action: 'disable', deviceId: userId }, token)).status, 401);
    const dispatch = await post({ action: 'dispatch' }, dispatcherSecret);
    assert.equal(dispatch.status, 200);
    assert.equal((await dispatch.json()).claimed, 0);
    assert.equal((await post({ action: 'config' }, undefined, 'https://hostile.example')).status, 403);
  } finally {
    Deno.serve = originalServe;
    globalThis.fetch = originalFetch;
    names.forEach((name, i) => originalValues[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, originalValues[i]));
  }
});
