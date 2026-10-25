import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from './catalog.mjs';

const node = (name, parents = [], synonyms = []) => ({
  name: { en: name },
  parents,
  synonyms: { en: synonyms },
});
const base = () => ({
  'en:cheeses': node('Cheeses'),
  'en:meats': node('Meats'),
  'en:fruits': node('Fruits'),
  'en:vegetables': node('Vegetables'),
  'en:beans': node('Beans', ['en:vegetables']),
  'en:green-beans': node('Green beans', ['en:beans']),
  'en:frozen-foods': node('Frozen foods'),
  'en:canned-foods': node('Canned foods'),
});
const options = { recognize: () => null };

test('inherits a mapped parent and includes source names and singular synonyms', () => {
  const t = {
    ...base(),
    'en:gorgonzolas': node('Gorgonzolas', ['en:cheeses'], ['Gorgonzola cheeses']),
  };
  const c = buildCatalog(t, {}, options);
  assert.ok(c.departments.dairy.includes('gorgonzola'));
  assert.ok(c.departments.dairy.includes('gorgonzola cheese'));
});
test('preserves more specific shop placement and storage overrides', () => {
  const t = {
    ...base(),
    'en:cannellini-beans': node('Cannellini beans', ['en:beans']),
    'en:frozen-cannellini-beans': node('Frozen cannellini beans', [
      'en:cannellini-beans',
      'en:frozen-foods',
    ]),
    'en:canned-green-beans': node('Canned green beans', ['en:green-beans', 'en:canned-foods']),
  };
  const c = buildCatalog(t, {}, options);
  assert.ok(c.departments.pantry.includes('cannellini beans'));
  assert.ok(c.departments.produce.includes('green beans'));
  assert.ok(c.departments.frozen.includes('frozen cannellini beans'));
  assert.ok(c.departments.pantry.includes('canned green beans'));
});
test('omits conflicting aliases and ambiguous ancestry instead of guessing', () => {
  const t = {
    ...base(),
    'en:first': node('Ambiguous product', ['en:cheeses']),
    'en:second': node('Ambiguous product', ['en:meats']),
    'en:mixed': node('Mixed product', ['en:cheeses', 'en:meats']),
  };
  const names = Object.values(buildCatalog(t, {}, options).departments).flat();
  assert.equal(names.includes('ambiguous product'), false);
  assert.equal(names.includes('mixed product'), false);
});
test('cycles and malformed nodes cannot hang generation or inject invalid departments', () => {
  const t = {
    ...base(),
    'en:a': node('Cycle A', ['en:b']),
    'en:b': node('Cycle B', ['en:a']),
    'en:bad': null,
  };
  const c = buildCatalog(t, {}, options);
  assert.equal(Object.values(c.departments).flat().includes('cycle a'), false);
  assert.throws(() => buildCatalog(t, { administrator: ['Injected'] }, options), /department/i);
});
test('prunes only names already recognized in their correct department', () => {
  const t = { ...base(), 'en:gorgonzolas': node('Gorgonzolas', ['en:cheeses']) };
  const c = buildCatalog(t, {}, { recognize: (name) => (name === 'gorgonzolas' ? 'dairy' : null) });
  assert.equal(c.departments.dairy.includes('gorgonzolas'), false);
  assert.ok(c.departments.dairy.includes('gorgonzola'));
});
test('local Swedish additions are normalized, deterministic and kept separate from brands', () => {
  const a = buildCatalog(base(), { dairy: ['Prästost', 'Grevéost'] }, options);
  const b = buildCatalog({ ...base() }, { dairy: ['Grevéost', 'Prästost'] }, options);
  assert.deepEqual(a, b);
  assert.ok(a.departments.dairy.includes('prastost'));
  assert.ok(a.departments.dairy.includes('greveost'));
  assert.equal(Object.values(a.departments).flat().includes('arla'), false);
});

test('shop placement of dairy alternatives overrides closer cereal or nut ancestry', () => {
  const t = {
    ...base(),
    'en:cereals-and-their-products': node('Cereals'),
    'en:milk-substitutes': node('Milk substitutes'),
    'en:plant-milks': node('Plant milks', ['en:milk-substitutes']),
    'en:oat-milks': node('Oat milks', ['en:plant-milks', 'en:cereals-and-their-products']),
    'en:non-dairy-yogurts': node('Non-dairy yogurts'),
    'en:soy-yogurts': node('Soy yogurts', [
      'en:non-dairy-yogurts',
      'en:cereals-and-their-products',
    ]),
    'en:frozen-oat-milks': node('Frozen oat milks', ['en:oat-milks', 'en:frozen-foods']),
  };
  const c = buildCatalog(t, {}, options);
  assert.ok(c.departments.dairy.includes('oat milk'));
  assert.ok(c.departments.dairy.includes('soy yogurt'));
  assert.ok(c.departments.frozen.includes('frozen oat milk'));
});
test('keeps otherwise redundant compounds that protect against competing shorter aliases', () => {
  const t = { ...base(), 'en:blueberries': node('Blueberries', ['en:fruits']) };
  const c = buildCatalog(
    t,
    { dairy: ['Blueberry yogurt'] },
    {
      recognize: (name) => (name === 'blueberry yogurt' ? 'dairy' : null),
    },
  );
  assert.ok(c.departments.dairy.includes('blueberry yogurt'));
});
test('excludes context-dependent descriptors but keeps complete product names', () => {
  const t = {
    ...base(),
    'en:beverages': node('Beverages'),
    'en:english': node('English', ['en:beverages'], ['English wine']),
    'en:welsh': node('Welsh', ['en:beverages']),
    'en:confectioneries': node('Confectioneries'),
    'en:sweets': node('Sweets', ['en:confectioneries']),
  };
  const c = buildCatalog(t, {}, options);
  const names = Object.values(c.departments).flat();
  for (const name of ['english', 'welsh', 'sweet']) assert.equal(names.includes(name), false);
  assert.ok(c.departments.drinks.includes('english wine'));
  assert.ok(c.departments.treats.includes('sweets'));
});

test('allows verified two-letter local foods without admitting short upstream labels', () => {
  const t = { ...base(), 'en:al': node('Al', ['en:fruits']) };
  const sourceOnly = buildCatalog(t, {}, options);
  assert.equal(Object.values(sourceOnly.departments).flat().includes('al'), false);
  const local = buildCatalog(t, { fish: ['Ål'] }, options);
  assert.ok(local.departments.fish?.includes('al'));
});
