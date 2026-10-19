import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import {
  RequestError, decodeBase64Url, limitedJson, notificationPayload, prepareTimer,
  retryOutcome, validateAction, validateSubscription, verifiedSessionId,
} from './validation.mjs';

const origins = new Set([
  'https://antonj997.github.io', 'http://127.0.0.1:4300',
  'http://localhost:4300', 'http://localhost:4200',
  'http://127.0.0.1:4302', 'http://localhost:4302',
  'http://127.0.0.1:4303', 'http://localhost:4303',
]);

interface Timer {
  key: string; recipeId: string; index: number; definitionSeconds: number;
  deadline: number | null; revision: number;
}
interface Subscription { endpoint: string; keys: { auth: string; p256dh: string } }
interface Action { action: string; deviceId?: string; subscription?: Subscription; timers?: Timer[] }
interface Claim { id: string; claim_token: string; revision: number }
interface Delivery extends Claim {
  timer_key: string; recipe_id: string; step_index: number; key_hash: string;
  subscription: Subscription; deadline: string; attempts: number;
}

// Deploy with verify_jwt=false: config is public, dispatch uses an independent secret,
// and every user mutation verifies this exact Bearer JWT with Auth then auth.sessions.
Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const headers = {
    'Access-Control-Allow-Origin': origins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin', 'Cache-Control': 'no-store',
  };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const action = validateAction(await limitedJson(request)) as Action;
    const vapid = vapidSettings();
    const dispatchSecret = Deno.env.get('TIMER_DISPATCH_SECRET') ?? '';
    const ready = !!vapid && /^[A-Za-z0-9_-]{43,}$|^[a-fA-F0-9]{64,}$/.test(dispatchSecret);
    if (action.action === 'config' && !ready) return json({ publicKey: vapid?.publicKey ?? null, ready: false });

    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (action.action === 'config') return json({ publicKey: vapid!.publicKey, ready: await dispatcherReady(admin, dispatchSecret) });
    if (action.action === 'dispatch') {
      if (!ready || !await secretMatches(request.headers.get('authorization'), dispatchSecret))
        throw new RequestError('Dispatch is not authorized.', 401);
      return json(await dispatch(admin, vapid!));
    }

    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ') || authorization.length > 16384)
      throw new RequestError('Sign in to enable timer alerts.', 401);
    const token = authorization.slice(7);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user || user.is_anonymous) throw new RequestError('Sign in to enable timer alerts.', 401);
    const sessionId = verifiedSessionId(token, user.id);
    if (action.action !== 'disable' && (!ready || !await dispatcherReady(admin, dispatchSecret)))
      throw new RequestError('Timer alerts are not set up yet.', 503);

    let payload: unknown = {};
    const unavailable: { key: string; reason: string }[] = [];
    if (action.action === 'register') {
      const subscription = action.subscription!;
      try {
        await crypto.subtle.importKey('raw', decodeBase64Url(subscription.keys.p256dh), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      } catch { throw new RequestError('Invalid push public key.'); }
      payload = subscription;
    } else if (action.action === 'sync') {
      const timers = action.timers!;
      const ids = [...new Set(timers.filter((timer) => timer.deadline !== null).map((timer) => timer.recipeId))];
      const recipes = new Map<string, unknown>();
      if (ids.length) {
        const { data, error: recipeError } = await admin.from('recipes').select('id,payload').eq('user_id', user.id).eq('deleted', false).in('id', ids);
        if (recipeError) throw new RequestError('Could not verify synced recipes.', 503);
        for (const row of data ?? []) recipes.set(row.id, row.payload);
      }
      payload = timers.flatMap((timer) => {
        const prepared = prepareTimer(timer, recipes.get(timer.recipeId));
        if (prepared) return [prepared];
        unavailable.push({ key: timer.key, reason: 'Recipe changes have not synced yet.' });
        // A rejected newer revision must still tombstone the old schedule.
        return [{ ...timer, deadline: null }];
      });
    }
    const result = await rpc(admin, 'timer_alerts_manage', {
      p_action: action.action, p_user: user.id, p_session: sessionId,
      p_device: action.deviceId, p_payload: payload,
    }) as { ok: boolean; scheduled?: number; unavailable?: { key: string; reason: string }[] };
    return json({ ...result, unavailable: [...(result.unavailable ?? []), ...unavailable] });
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    // Do not log endpoint credentials, tokens, subscription keys, or recipe data.
    console.error('Timer alert request failed.');
    return json({ error: 'Timer alerts are temporarily unavailable.' }, 503);
  }
});

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Missing server configuration.');
  return value;
}

async function dispatcherReady(admin: SupabaseClient, secret: string): Promise<boolean> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
  const digest = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const { data, error } = await admin.rpc('timer_alerts_ready', { p_project_url: requiredEnv('SUPABASE_URL'), p_secret_hash: digest });
  return !error && data === true;
}

function vapidSettings(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const subject = Deno.env.get('VAPID_SUBJECT') ?? '';
  try {
    if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) return null;
    if (decodeBase64Url(publicKey).length !== 65 || decodeBase64Url(privateKey).length !== 32) return null;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return { publicKey, privateKey, subject };
  } catch { return null; }
}

async function secretMatches(authorization: string | null, expected: string): Promise<boolean> {
  if (!authorization?.startsWith('Bearer ') || authorization.length > 1024 || !expected) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([digest(authorization.slice(7)), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function rpc(admin: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    if (error.message.includes('TIMER_SESSION')) throw new RequestError('Sign in again to enable timer alerts.', 401);
    if (error.message.includes('TIMER_LIMIT')) throw new RequestError('Timer alert device or timer limit reached.', 429);
    if (error.message.includes('TIMER_DEVICE')) throw new RequestError('Enable timer alerts on this device again.', 409);
    if (error.message.includes('TIMER_ENDPOINT')) throw new RequestError('This subscription is still in use by another signed-in account.', 409);
    throw new RequestError('Timer alerts are temporarily unavailable.', 503);
  }
  return data;
}

async function dispatch(admin: SupabaseClient, vapid: { publicKey: string; privateKey: string; subject: string }) {
  const claims = await rpc(admin, 'timer_alerts_claim', {}) as Claim[];
  const counts = { claimed: claims.length, sent: 0, skipped: 0, failed: 0, retried: 0, expired: 0 };
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, claims.length) }, async () => {
    while (cursor < claims.length) {
      const claim = claims[cursor++];
      const args = { p_id: claim.id, p_revision: claim.revision, p_claim: claim.claim_token };
      const job = await rpc(admin, 'timer_alerts_authorize', args) as Delivery | null;
      if (!job) { counts.skipped++; continue; }
      let status = 0;
      try {
        const subscription = validateSubscription(job.subscription);
        const details = webpush.generateRequestDetails(subscription, JSON.stringify(notificationPayload(job)), {
          vapidDetails: vapid, contentEncoding: 'aes128gcm', urgency: 'high', TTL: 300,
          topic: job.key_hash.slice(0, 32),
        });
        // Use fetch for a hard wall-clock timeout and reject redirects to other hosts.
        const response = await fetch(subscription.endpoint, {
          method: 'POST', headers: details.headers, body: new Uint8Array(details.body),
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        status = response.status;
        await response.body?.cancel();
      } catch { /* An ambiguous network outcome is retried at most twice, with a stable notification tag. */ }
      const outcome = status >= 200 && status < 300 ? { state: 'sent', delaySeconds: 0 }
        : retryOutcome(status, job.attempts, (Date.now() - Date.parse(job.deadline)) / 1000);
      await rpc(admin, 'timer_alerts_finish', { ...args, p_outcome: outcome.state, p_delay: outcome.delaySeconds ?? 0 });
      if (outcome.state === 'sent') counts.sent++;
      else if (outcome.state === 'retry') counts.retried++;
      else if (outcome.state === 'expired') counts.expired++;
      else counts.failed++;
    }
  }));
  return counts;
}
