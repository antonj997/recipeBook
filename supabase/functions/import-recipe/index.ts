import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { validateUrl, fetchHtml, parseRecipe } from '../_shared/recipe-parser.mjs';

const allowedOrigins = new Set([
  'https://antonj997.github.io',
  'http://127.0.0.1:4300',
  'http://localhost:4300',
  'http://localhost:4200',
]);
const photoHosts = [
  'ica.se',
  'icanet.se',
  'koket.se',
  'arla.se',
  'arla.com',
  'cookwell.com',
  'elinaomickesmat.se',
  'recept.se',
  'kokaihop.se',
  'sanity.io',
  'ctfassets.net',
];

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !allowedOrigins.has(origin)) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer '))
    return json({ error: 'Sign in to import recipes.' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser(authorization.slice(7));
  if (authError || !user || user.is_anonymous)
    return json({ error: 'Sign in to import recipes.' }, 401);

  try {
    const text = new TextDecoder().decode(await limitedBody(request, 8192));
    if (text.length > 8192) return json({ error: 'Request too large.' }, 413);
    const body = JSON.parse(text);
    const photo = body.action === 'photo';
    const { data: permitted, error } = await client.rpc('claim_recipe_import', { photo });
    if (error) return json({ error: 'The importer is not set up yet.' }, 503);
    if (!permitted)
      return json({ error: 'Import limit reached. Try again in the next hour.' }, 429);

    if (photo) {
      const url = new URL(body.url);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !photoHosts.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))
      )
        return json({ error: 'This photo host is not supported.' }, 400);
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const type = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type))
        return json({ error: 'Photo unavailable.' }, 422);
      const bytes = await limitedBody(response, 20 * 1024 * 1024);
      return new Response(bytes, {
        headers: { ...headers, 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' },
      });
    }
    let url: URL;
    try {
      url = validateUrl(body.url);
    } catch (error) {
      return json({ error: message(error) }, 400);
    }
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch {
      return json(
        { error: 'Could not fetch the website. It may block requests or redirect to another URL.' },
        502,
      );
    }
    try {
      return json(parseRecipe(html, url));
    } catch (error) {
      return json({ error: message(error) }, 422);
    }
  } catch (error) {
    return json({ error: message(error) }, 400);
  }
});

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not import recipe.';
}
async function limitedBody(response: Response | Request, limit: number): Promise<ArrayBuffer> {
  if (Number(response.headers.get('content-length')) > limit || !response.body)
    throw new Error('The requested content is too large or unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('The requested content is too large.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
