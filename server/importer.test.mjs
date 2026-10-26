import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { request } from 'node:http';
import { createImporterApp } from './index.mjs';

async function fixture(run) {
  const server = createImporterApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const options = (headers = {}, body = JSON.stringify({ url: 'https://127.0.0.1/' })) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body,
});

test('rejects DNS rebinding Host headers before handling any import', () =>
  fixture(async (base) => {
    // Fetch normalizes Host itself. Use raw HTTP to model an actual rebinding request.
    const status = await new Promise((resolve, reject) => {
      const req = request(
        base + '/api/import',
        {
          method: 'POST',
          headers: { Host: 'attacker.example.com', 'Content-Type': 'application/json' },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ url: 'https://127.0.0.1/' }));
    });
    assert.equal(status, 403);
  }));
for (const origin of [
  'https://attacker.example.com',
  'null',
  'http://localhost.attacker.com',
  'http://127.0.0.1:4200/',
]) {
  test('rejects a foreign or malformed browser origin ' + origin, () =>
    fixture(async (base) => {
      assert.equal((await fetch(base + '/api/import', options({ Origin: origin }))).status, 403);
    }),
  );
}
test('accepts an Angular loopback origin and still blocks a private target', () =>
  fixture(async (base) => {
    const response = await fetch(
      base + '/api/import',
      options({ Origin: 'http://localhost:4200' }),
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /public recipe website/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }));
test('rejects oversized and compressed request bodies without exposing server details', () =>
  fixture(async (base) => {
    const big = await fetch(
      base + '/api/import',
      options({}, JSON.stringify({ url: 'x'.repeat(9000) })),
    );
    assert.equal(big.status, 413);
    assert.deepEqual(await big.json(), { error: 'Import request too large.' });
    const compressed = await fetch(base + '/api/import', options({ 'Content-Encoding': 'gzip' }));
    assert.equal(compressed.status, 415);
    assert.deepEqual(await compressed.json(), { error: 'Invalid import request.' });
  }));
test('limits local import attempts without issuing outgoing requests for invalid URLs', () =>
  fixture(async (base) => {
    for (let i = 0; i < 30; i++)
      assert.equal((await fetch(base + '/api/import', options())).status, 400);
    assert.equal((await fetch(base + '/api/import', options())).status, 429);
  }));
