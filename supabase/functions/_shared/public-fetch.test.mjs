import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateUrl } from './recipe-parser.mjs';

test('accepts a public HTTPS recipe site outside the former whitelist', () => {
  assert.equal(
    validateUrl('https://www.bbcgoodfood.com/recipes/lemon-drizzle-cake').hostname,
    'www.bbcgoodfood.com',
  );
});

for (const value of [
  'https:example.com/recipe',
  'https://example.com\\@localhost/',
  'http://example.com/recipe',
  'file:///etc/passwd',
  'data:text/html,hi',
  'https://user:password@example.com/',
  'https://example.com:8443/',
  'https://127.0.0.1/',
  'https://127.1/',
  'https://2130706433/',
  'https://0x7f000001/',
  'https://[::1]/',
  'https://[::ffff:127.0.0.1]/',
  'https://localhost/',
  'https://foo.local/',
  'https://metadata.google.internal/',
  'https://localtest/',
  'https://a.localhost./',
  'https://bad_host.com/',
]) {
  test('rejects unsafe or non-public recipe URL ' + value.split('@').pop(), () => {
    assert.throws(() => validateUrl(value));
  });
}

test('normalizes Unicode and a trailing DNS dot without changing the recipe path', () => {
  assert.equal(
    validateUrl('https://köket.se./recept?q=1#part').href,
    'https://xn--kket-5qa.se/recept?q=1',
  );
});

const publicIP = '93.184.216.34';
const reply = (text = '<html>recipe</html>', status = 200, headers = {}) => ({
  status,
  headers: new Headers({ 'content-type': 'text/html; charset=utf-8', ...headers }),
  body: (async function* () {
    yield new TextEncoder().encode(text);
  })(),
  close: async () => {},
});
async function module() {
  return import('./public-fetch.mjs');
}

test('rejects private, reserved, transition and documentation DNS answers', async () => {
  const { isPublicAddress } = await import('./public-url.mjs');
  for (const ip of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.31.2.3',
    '192.168.1.1',
    '192.0.0.9',
    '192.0.2.1',
    '198.18.1.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '168.63.129.16',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '64:ff9b::a00:1',
    '2001:db8::1',
    '2002:a00:1::1',
    '2001::1',
    '3fff::1',
    'not-an-IP',
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of [publicIP, '8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])
    assert.equal(isPublicAddress(ip), true, ip);
});

test('connects only to the checked IP even if the resolver would rebind later', async () => {
  const { createPublicFetcher } = await module();
  let resolutions = 0;
  const calls = [];
  const fetchPublic = createPublicFetcher({
    resolve: async () => (++resolutions === 1 ? [publicIP] : ['127.0.0.1']),
    request: async (url, ip) => {
      calls.push([url.hostname, ip]);
      return reply();
    },
  });
  const result = await fetchPublic('https://example.com/recipe');
  assert.equal(result.type, 'text/html');
  assert.deepEqual(calls, [['example.com', publicIP]]);
  assert.equal(resolutions, 1);
});

test('refuses a mixed public/private DNS answer without making a request', async () => {
  const { createPublicFetcher } = await module();
  let contacted = false;
  const fetchPublic = createPublicFetcher({
    resolve: async () => [publicIP, '10.0.0.1'],
    request: async () => {
      contacted = true;
      return reply();
    },
  });
  await assert.rejects(fetchPublic('https://example.com/recipe'));
  assert.equal(contacted, false);
});

test('revalidates relative and cross-origin redirects and retains the final URL', async () => {
  const { createPublicFetcher } = await module();
  const hosts = [];
  let request = 0;
  let closed = 0;
  const fetchPublic = createPublicFetcher({
    resolve: async (host) => {
      hosts.push(host);
      return [publicIP];
    },
    request: async () => ({
      ...(++request === 1
        ? reply('', 302, { location: '/canonical' })
        : request === 2
          ? reply('', 301, { location: 'https://recipes.example.net/final' })
          : reply()),
      close: async () => {
        closed++;
      },
    }),
  });
  const result = await fetchPublic('https://example.com/recipe');
  assert.equal(result.url.href, 'https://recipes.example.net/final');
  assert.deepEqual(hosts, ['example.com', 'example.com', 'recipes.example.net']);
  assert.equal(closed, 3);
});

test('blocks a redirect to a private DNS address before the second connection', async () => {
  const { createPublicFetcher } = await module();
  let connected = 0;
  const fetchPublic = createPublicFetcher({
    resolve: async (host) => (host === 'internal.example.net' ? ['169.254.169.254'] : [publicIP]),
    request: async () => {
      connected++;
      return reply('', 302, { location: 'https://internal.example.net/metadata' });
    },
  });
  await assert.rejects(fetchPublic('https://example.com/recipe'));
  assert.equal(connected, 1);
});

test('bounds redirect loops at four requests', async () => {
  const { createPublicFetcher } = await module();
  let connected = 0;
  const fetchPublic = createPublicFetcher({
    resolve: async () => [publicIP],
    request: async () => {
      connected++;
      return reply('', 302, { location: '/again' });
    },
  });
  await assert.rejects(fetchPublic('https://example.com/recipe'));
  assert.equal(connected, 4);
});

for (const [label, response] of [
  ['wrong content type', reply('not HTML', 200, { 'content-type': 'application/javascript' })],
  ['unexpected compression', reply('compressed', 200, { 'content-encoding': 'gzip' })],
  ['declared oversized body', reply('small', 200, { 'content-length': String(3 * 1024 * 1024) })],
  ['streamed oversized body', reply('x'.repeat(2 * 1024 * 1024 + 1))],
  ['SVG photo', reply('<svg/>', 200, { 'content-type': 'image/svg+xml' })],
]) {
  test('rejects ' + label + ' and closes the response', async () => {
    const { createPublicFetcher } = await module();
    let closed = false;
    const fetchPublic = createPublicFetcher({
      resolve: async () => [publicIP],
      request: async () => ({
        ...response,
        close: async () => {
          closed = true;
        },
      }),
    });
    await assert.rejects(
      fetchPublic('https://example.com/recipe', { kind: label === 'SVG photo' ? 'photo' : 'html' }),
    );
    assert.equal(closed, true);
  });
}

test('cancels a stalled body and closes its response', async () => {
  const { createPublicFetcher } = await module();
  let closed = false;
  const controller = new AbortController();
  const fetchPublic = createPublicFetcher({
    resolve: async () => [publicIP],
    request: async () => ({
      ...reply(),
      body: (async function* () {
        controller.abort();
        await new Promise(() => {});
      })(),
      close: async () => {
        closed = true;
      },
    }),
  });
  await assert.rejects(fetchPublic('https://example.com/recipe', { signal: controller.signal }));
  assert.equal(closed, true);
});

test('does not request anything when already cancelled', async () => {
  const { createPublicFetcher } = await module();
  let connected = false;
  const controller = new AbortController();
  controller.abort();
  const fetchPublic = createPublicFetcher({
    resolve: async () => [publicIP],
    request: async () => {
      connected = true;
      return reply();
    },
  });
  await assert.rejects(fetchPublic('https://example.com/recipe', { signal: controller.signal }));
  assert.equal(connected, false);
});

test('releases and cancels an oversized request body', async () => {
  const { readBounded } = await module();
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(9000));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readBounded(body, 8192, new AbortController().signal));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('cancels a stalled request body on abort', async () => {
  const { readBounded } = await module();
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const reading = readBounded(body, 8192, controller.signal);
  controller.abort();
  await assert.rejects(reading);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});
