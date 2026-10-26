import { lookup } from 'node:dns/promises';
import { connect as connectTls } from 'node:tls';
import { Client } from 'undici';
import { isPublicAddress, validatePublicUrl } from './public-url.mjs';

const timeoutMs = 10_000;
const maxRedirects = 3;
const types = {
  html: ['text/html', 'application/xhtml+xml'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
};
const limits = { html: 2 * 1024 * 1024, photo: 20 * 1024 * 1024 };

// Race DNS/body operations too, not just initial headers. A rejected or abandoned
// lookup can never start a connection after the request has timed out.
function withAbort(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

async function resolveAddresses(hostname) {
  // Node's system resolver also respects /etc/hosts; Supabase uses Deno's DNS
  // API, which has a different Node-compatibility lookup implementation.
  if (globalThis.Deno?.resolveDns) {
    const answers = await Promise.allSettled([
      Deno.resolveDns(hostname, 'A'),
      Deno.resolveDns(hostname, 'AAAA'),
    ]);
    return answers.flatMap((answer) => (answer.status === 'fulfilled' ? answer.value : []));
  }
  return (await lookup(hostname, { all: true, verbatim: true })).map((answer) => answer.address);
}

async function requestPinned(url, address, { kind, signal }) {
  // The connector receives a literal checked IP, so DNS is never consulted a
  // second time. SNI and native certificate verification still use the domain.
  // Do not replace this with fetch() or the Supabase node:https shim: neither
  // exposes the connection-time DNS pinning this security boundary needs.
  const client = new Client(url.origin, {
    pipelining: 0,
    maxHeaderSize: 16 * 1024,
    maxResponseSize: limits[kind],
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connect: (_options, callback) => {
      const socket = connectTls({
        host: address,
        port: 443,
        servername: url.hostname,
        ALPNProtocols: ['http/1.1'],
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      });
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        callback(error, error ? null : socket);
      };
      const abort = () => socket.destroy(new Error('The website took too long to respond.'));
      signal.addEventListener('abort', abort, { once: true });
      socket.once('close', () => signal.removeEventListener('abort', abort));
      socket.once('secureConnect', () => finish(null));
      socket.once('error', finish);
      if (signal.aborted) abort();
      return socket;
    },
  });
  try {
    const result = await client.request({
      method: 'GET',
      path: url.pathname + url.search,
      signal,
      // Never forward inbound authorization, cookies, referrers or API keys.
      headers: {
        accept: types[kind].join(', '),
        'accept-encoding': 'identity',
        'user-agent': 'Recipebook/1.0',
      },
    });
    const headers = new Headers();
    for (const name of ['content-type', 'content-length', 'content-encoding', 'location']) {
      const value = result.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    return {
      status: result.statusCode,
      headers,
      body: result.body,
      close: async () => {
        result.body.destroy();
        await client.destroy();
      },
    };
  } catch (error) {
    await client.destroy();
    throw error;
  }
}

export async function readBounded(body, limit, signal) {
  if (!body) throw new Error('The website returned no content.');
  const chunks = [];
  let size = 0;
  const reader = body.getReader?.();
  const iterator = reader
    ? { next: () => reader.read(), return: () => reader.cancel() }
    : body[Symbol.asyncIterator]();
  let finished = false;
  try {
    while (true) {
      const { value, done } = await withAbort(iterator.next(), signal);
      if (done) {
        finished = true;
        break;
      }
      size += value.byteLength;
      if (size > limit) throw new Error('The requested content is too large.');
      chunks.push(value);
    }
  } finally {
    // Cancel Web request readers immediately; never await an untrusted iterator
    // whose pending read may never settle. The network owner also destroys its client.
    if (!finished) void Promise.resolve(iterator.return?.()).catch(() => {});
    reader?.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Dependencies are fixed for production; the factory also lets the trust-boundary
// tests model malicious DNS/redirect/body behavior without contacting a network.
export function createPublicFetcher({ resolve = resolveAddresses, request = requestPinned } = {}) {
  /**
   * @param {string | URL} input
   * @param {{kind?: 'html' | 'photo', signal?: AbortSignal}} [options]
   */
  const fetchResource = async (input, options = {}) => {
    const { kind = 'html', signal: callerSignal } = options;
    if (!Object.hasOwn(types, kind)) throw new Error('Unsupported resource type.');
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([deadline, callerSignal]) : deadline;
    let url = validatePublicUrl(input instanceof URL ? input.href : input);
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const addresses = await withAbort(resolve(url.hostname), signal);
      if (
        !addresses.length ||
        addresses.length > 64 ||
        addresses.some((address) => !isPublicAddress(address))
      )
        throw new Error('The website does not have a public network address.');
      const address = addresses.find((value) => !value.includes(':')) ?? addresses[0];
      signal.throwIfAborted();
      const response = await withAbort(request(url, address, { kind, signal }), signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= maxRedirects) throw new Error('The website redirected too many times.');
          const location = response.headers.get('location');
          if (!location || location.length > 2048) throw new Error('Invalid website redirect.');
          url = validatePublicUrl(new URL(location, url).href);
          continue;
        }
        if (response.status !== 200) throw new Error('The website could not be downloaded.');
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!types[kind].includes(type))
          throw new Error('The website returned an unsupported content type.');
        const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
        if (encoding && encoding !== 'identity')
          throw new Error('The website ignored the safe download format.');
        if (Number(response.headers.get('content-length')) > limits[kind])
          throw new Error('The requested content is too large.');
        const bytes = await readBounded(response.body, limits[kind], signal);
        return { bytes, type, url };
      } finally {
        await response.close();
      }
    }
  };
  return fetchResource;
}

export const fetchPublicResource = createPublicFetcher();
