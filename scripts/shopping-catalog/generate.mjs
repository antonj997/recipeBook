import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from './catalog.mjs';

const url = 'https://static.openfoodfacts.org/data/taxonomies/categories.full.json';
const sourcePath = process.argv.find((argument) => argument.startsWith('--source='))?.slice(9);
const retrievedAt =
  process.argv.find((argument) => argument.startsWith('--date='))?.slice(7) ??
  new Date().toISOString().slice(0, 10);
const bytes = sourcePath
  ? await readFile(sourcePath)
  : await fetch(url, {
      headers: { 'User-Agent': 'Recipebook/1.0 (offline-shopping-catalog-generator)' },
      signal: AbortSignal.timeout(30000),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Taxonomy download: ' + response.status);
      return Buffer.from(await response.arrayBuffer());
    });
if (bytes.length > 12_000_000) throw new Error('Unexpected source size; review before updating');
const source = JSON.parse(bytes.toString());
const additions = JSON.parse(
  await readFile(new URL('./local-aliases.json', import.meta.url), 'utf8'),
);
const swedish = JSON.parse(
  await readFile(new URL('./swedish-aliases.json', import.meta.url), 'utf8'),
);
// Reviewed names only; the app never downloads or imports the nutrition database.
for (const entry of swedish.entries) {
  if (
    !Number.isInteger(entry.sourceId) ||
    entry.sourceId <= 0 ||
    typeof entry.sourceName !== 'string' ||
    !Array.isArray(entry.aliases) ||
    entry.aliases.some((name) => typeof name !== 'string' || !name.trim())
  )
    throw new Error('Invalid Swedish source entry');
  (additions[entry.department] ??= []).push(...entry.aliases);
}
const generated = buildCatalog(source, additions);
if (generated.stats.aliases < 1000)
  throw new Error('Too few recognized names; review the source mapping');
const data = {
  ...generated,
  source: {
    name: 'Open Food Facts contributors',
    url,
    retrievedAt,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  },
  supplements: [swedish.source],
  licence: {
    database: 'ODbL-1.0',
    contents: 'DbCL-1.0',
    notice:
      'Contains information from Open Food Facts, available under the Open Database License. Normalized names, department mapping, singular/compound variants and local additions form a derived database available under ODbL-1.0.',
  },
};
const output = JSON.stringify(data, null, 2) + '\n';
const compressed = gzipSync(JSON.stringify(data)).length;
if (compressed > 65_536)
  throw new Error('Catalogue exceeds 64 KiB compressed performance budget: ' + compressed);
await mkdir(new URL('../../src/app/core/data/', import.meta.url), { recursive: true });
const destination = new URL('../../src/app/core/data/shopping-products.json', import.meta.url);
await writeFile(destination, output);
console.log(
  JSON.stringify({
    path: fileURLToPath(destination),
    ...generated.stats,
    rawBytes: Buffer.byteLength(output),
    compressedBytes: compressed,
    sourceSha256: data.source.sha256,
  }),
);
