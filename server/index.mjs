import express from 'express';
import { pathToFileURL } from 'node:url';
import { validateUrl, parseRecipe } from '../supabase/functions/_shared/recipe-parser.mjs';
import { fetchPublicResource } from '../supabase/functions/_shared/public-fetch.mjs';

export function createImporterApp() {
  const app = express();
  const counters = new Map();
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    const port = req.socket.localPort;
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host))
      return res.status(403).json({ error: 'Local requests only.' });
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (
          origin.protocol !== 'http:' ||
          !['localhost', '127.0.0.1'].includes(origin.hostname) ||
          origin.origin !== req.headers.origin
        )
          throw new Error();
      } catch {
        return res.status(403).json({ error: 'Local requests only.' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '8kb', inflate: false }));
  app.post('/api/import', async (req, res) => {
    const photo = req.body?.action === 'photo';
    const key = photo ? 'photo' : 'recipe';
    const now = Date.now();
    let counter = counters.get(key);
    if (!counter || now - counter.start >= 3600_000)
      counters.set(key, (counter = { start: now, count: 0 }));
    if (++counter.count > (photo ? 120 : 30))
      return res.status(429).json({ error: 'Import limit reached. Try again in the next hour.' });
    let url;
    try {
      url = validateUrl(req.body?.url);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    let resource;
    try {
      resource = await fetchPublicResource(url, {
        kind: photo ? 'photo' : 'html',
        signal: controller.signal,
      });
    } catch {
      return res
        .status(502)
        .json({
          error:
            'Could not fetch the website. It may block imports, be unavailable, or use an unsupported address.',
        });
    }
    if (photo) return res.type(resource.type).send(Buffer.from(resource.bytes));
    try {
      return res.json(parseRecipe(new TextDecoder().decode(resource.bytes), resource.url));
    } catch (error) {
      return res.status(422).json({ error: error.message });
    }
  });
  app.use((error, _req, res, _next) => {
    const status = [413, 415].includes(error.status) ? error.status : 400;
    res
      .status(status)
      .json({ error: status === 413 ? 'Import request too large.' : 'Invalid import request.' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  createImporterApp().listen(port, '127.0.0.1', () =>
    console.log('Recipe importer running on http://127.0.0.1:' + port),
  );
}
