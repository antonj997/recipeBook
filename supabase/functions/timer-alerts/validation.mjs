const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value, max) => typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= max;

export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new RequestError('Invalid push keys.');
  const result = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  // Require canonical unpadded encoding, including unused bits in the final byte.
  const canonical = btoa(String.fromCharCode(...result)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (canonical !== value) throw new RequestError('Invalid push keys.');
  return result;
}

export function validateSubscription(value) {
  if (!object(value) || !text(value.endpoint, 4096) || !object(value.keys)) throw new RequestError('Invalid push subscription.');
  let url;
  try { url = new URL(value.endpoint); } catch { throw new RequestError('Invalid push endpoint.'); }
  const host = url.hostname;
  const supported = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(host)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!supported || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash)
    throw new RequestError('This push endpoint is not supported.');
  const { p256dh, auth } = value.keys;
  if (!text(p256dh, 87) || !text(auth, 22)) throw new RequestError('Invalid push keys.');
  const point = decodeBase64Url(p256dh);
  if (point.length !== 65 || point[0] !== 4 || decodeBase64Url(auth).length !== 16)
    throw new RequestError('Invalid push keys.');
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export function validateAction(value, now = Date.now()) {
  if (!object(value)) throw new RequestError('Expected a JSON object.');
  if (value.action === 'config' || value.action === 'dispatch') return { action: value.action };
  if (!uuid.test(value.deviceId ?? '')) throw new RequestError('Invalid device ID.');
  const deviceId = value.deviceId.toLowerCase();
  if (value.action === 'disable') return { action: 'disable', deviceId };
  if (value.action === 'presence') {
    if (!uuid.test(value.tabId ?? '') || typeof value.visible !== 'boolean') throw new RequestError('Invalid tab presence.');
    return { action: 'presence', deviceId, tabId: value.tabId.toLowerCase(), visible: value.visible };
  }
  if (value.action === 'register') return { action: 'register', deviceId, subscription: validateSubscription(value.subscription) };
  if (value.action !== 'sync') throw new RequestError('Unknown action.');
  if (!Array.isArray(value.timers) || value.timers.length > 100) throw new RequestError('Too many timers.');
  const seen = new Set();
  const timers = value.timers.map((timer) => {
    if (!object(timer) || !text(timer.key, 1000) || !text(timer.recipeId, 200)
      || !integer(timer.index, 0, 9999) || !integer(timer.definitionSeconds, 1, 604800)
      || !integer(timer.revision, 0, Number.MAX_SAFE_INTEGER)
      || !(timer.deadline === null || (integer(timer.deadline, 0, Number.MAX_SAFE_INTEGER) && timer.deadline <= now + 604800000)))
      throw new RequestError('Invalid timer.');
    if (seen.has(timer.key)) throw new RequestError('Duplicate timer key.');
    seen.add(timer.key);
    return { key: timer.key, recipeId: timer.recipeId, index: timer.index,
      definitionSeconds: timer.definitionSeconds, deadline: timer.deadline, revision: timer.revision };
  });
  return { action: 'sync', deviceId, timers };
}

// Call ONLY after auth.getUser(token) has verified this exact JWT with Supabase Auth.
// Parsing a JWT alone is never authentication. SQL separately verifies session ownership.
export function verifiedSessionId(token, freshUserId) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (claims.sub !== freshUserId || !uuid.test(claims.session_id ?? '') || claims.is_anonymous === true) throw new Error();
    return claims.session_id;
  } catch { throw new RequestError('Sign in to enable timer alerts.', 401); }
}

export function notificationPayload(job) {
  const reminder = job.notification_stage === 'reminder';
  return { notification: {
    title: reminder ? 'Recipe timer reminder' : 'Recipe timer finished',
    body: reminder ? 'Your timer is still waiting. Check your recipe when you are ready.' : `Step ${job.step_index + 1} is ready to check`,
    tag: `recipe-timer-${job.key_hash}-${job.revision}-${reminder ? 'reminder' : 'initial'}`, renotify: false,
    data: { timerKey: job.timer_key, revision: job.revision, recipeId: job.recipe_id,
      onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/recipeBook/#/recipes/' + encodeURIComponent(job.recipe_id) } } },
  } };
}

export function retryOutcome(status, attempts, ageSeconds) {
  if (status === 404 || status === 410) return { state: 'expired' };
  if ((status === 0 || status === 429 || status >= 500) && attempts < 3 && ageSeconds <= 300)
    return { state: 'retry', delaySeconds: attempts === 1 ? 15 : 60 };
  return { state: 'failed' };
}

export async function limitedJson(request) {
  const limit = 65536;
  if (Number(request.headers.get('content-length')) > limit || !request.body)
    throw new RequestError('Request too large or empty.', 413);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError('Request too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new RequestError('Invalid JSON.'); }
}

export function prepareTimer(timer, recipe) {
  if (timer.deadline === null) return timer;
  if (!object(recipe) || !Array.isArray(recipe.instructions)) return null;
  const raw = recipe.instructions[timer.index];
  const detail = recipe.stepDetails?.[timer.index];
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 20000 || (detail != null && !object(detail))) return null;
  const hasOverride = detail != null && Object.hasOwn(detail, 'timerSeconds');
  if (hasOverride && detail.timerSeconds !== timer.definitionSeconds) return null;
  const title = typeof detail?.title === 'string' ? detail.title.trim() : '';
  const instruction = title && !raw.toLocaleLowerCase().startsWith(title.toLocaleLowerCase()) ? title + ': ' + raw : raw;
  let hash = 2166136261;
  for (const char of JSON.stringify([instruction, detail?.section, timer.definitionSeconds])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  if (JSON.stringify([timer.recipeId, timer.index, hash >>> 0]) !== timer.key) return null;
  return { ...timer, snapshot: [raw, detail?.title ?? null, detail?.section ?? null, hasOverride, detail?.timerSeconds ?? null] };
}
