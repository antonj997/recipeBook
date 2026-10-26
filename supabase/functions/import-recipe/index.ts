import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { validateUrl, parseRecipe } from '../_shared/recipe-parser.mjs';
import { fetchPublicResource, readBounded } from '../_shared/public-fetch.mjs';

const allowedOrigins = new Set([
  'https://antonj997.github.io',
  'http://127.0.0.1:4300',
  'http://localhost:4300',
  'http://localhost:4200',
]);
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
    const bodySignal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
    const text = new TextDecoder().decode(await readBounded(request.body, 8192, bodySignal));
    if (text.length > 8192) return json({ error: 'Request too large.' }, 413);
    const body = JSON.parse(text);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (body.action !== undefined && body.action !== 'photo')
    )
      return json({ error: 'Invalid import request.' }, 400);
    const photo = body.action === 'photo';
    const { data: permitted, error } = await client.rpc('claim_recipe_import', { photo });
    if (error) return json({ error: 'The importer is not set up yet.' }, 503);
    if (!permitted)
      return json({ error: 'Import limit reached. Try again in the next hour.' }, 429);

    if (photo) {
      try {
        const resource = await fetchPublicResource(body.url, {
          kind: 'photo',
          signal: request.signal,
        });
        return new Response(resource.bytes, {
          headers: {
            ...headers,
            'Content-Type': resource.type,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return json({ error: 'Photo unavailable. Use a public JPEG, PNG or WebP image.' }, 422);
      }
    }
    let url: URL;
    try {
      url = validateUrl(body.url);
    } catch (error) {
      return json({ error: message(error) }, 400);
    }
    let html: string;
    try {
      const resource = await fetchPublicResource(url, { signal: request.signal });
      html = new TextDecoder().decode(resource.bytes);
      url = resource.url;
    } catch {
      return json(
        {
          error:
            'Could not fetch the website. It may block imports, be unavailable, or use an unsupported address.',
        },
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
