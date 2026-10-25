import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

// Compile the same pure classifier used by the browser; exclude compiler/import time.
const root = fileURLToPath(new URL('../../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  stdin: {
    contents: `export {shoppingDepartment} from './src/app/core/models/shopping-department';
      export {ShoppingProductIndex} from './src/app/core/models/shopping-product-index';
      export {default as catalog} from './src/app/core/data/shopping-products.json';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  minify: true,
});
const { shoppingDepartment, ShoppingProductIndex, catalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
const now = () => performance.now();
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const initialization = [];
for (let trial = 0; trial < 30; trial++) {
  const start = now();
  new ShoppingProductIndex(catalog.departments);
  initialization.push(now() - start);
}
const common = [
  'Arla Präst 31%',
  'Grevéost',
  'Gorgonzola',
  'Wrångebäcksost',
  '200 g broccoli (fryst)',
  '1 burk kikärtor',
  'coconut cream',
  'oat milk',
  'chicken broth',
  'baby food',
  'tomatoes',
  'tandkräm',
  'diskmedel',
  'Saknad ny produkt',
  'prästost och broccoli',
  '600 g greek yogurt',
];
const aliases = Object.values(catalog.departments).flat();
// Mix existing rules, unknowns and distinct new aliases, including long retail labels.
const items = Array.from({ length: 1000 }, (_, index) =>
  index % 3 === 0
    ? common[index % common.length]
    : `${index + 1} g ${aliases[(index * 137) % aliases.length]} 500 g`,
);
const coldStart = now();
shoppingDepartment('Prästost');
const firstClassificationMs = now() - coldStart;
for (let trial = 0; trial < 5; trial++) for (const item of items) shoppingDepartment(item);
const batches = [];
for (let trial = 0; trial < 30; trial++) {
  const start = now();
  for (const item of items) shoppingDepartment(item);
  batches.push(now() - start);
}
const catalogGzipBytes = gzipSync(JSON.stringify(catalog)).length;
const metrics = {
  aliases: aliases.length,
  catalogGzipBytes,
  initializationP95Ms: percentile(initialization, 0.95),
  firstClassificationMs,
  itemsPerBatch: items.length,
  classificationMedianMs: percentile(batches, 0.5),
  classificationP95Ms: percentile(batches, 0.95),
};
console.log(JSON.stringify(metrics, null, 2));
if (
  catalogGzipBytes > 65_536 ||
  metrics.initializationP95Ms > 10 ||
  metrics.classificationP95Ms > 10
) {
  throw new Error('Catalogue exceeds its performance gates; do not publish before review.');
}
