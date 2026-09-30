import { mkdir, readFile, writeFile } from 'node:fs/promises';

const path = new URL('../public/supabase-config.json', import.meta.url);
let config = {
  url: process.env.SUPABASE_URL ?? '',
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
};
if (!config.url && !config.publishableKey) {
  try {
    config = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    /* Local-only build. */
  }
}
if (config.url || config.publishableKey) {
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) ||
    !config.publishableKey.startsWith('sb_publishable_')
  )
    throw new Error(
      'Use a Supabase project URL and a publishable key. Secret/service-role keys must never enter the app.',
    );
}
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
await writeFile(path, JSON.stringify(config) + '\n');
