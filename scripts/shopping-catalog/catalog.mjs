import { normalizeCatalogName } from '../../src/app/core/models/shopping-product-index.ts';
import { matchShoppingRule } from '../../src/app/core/models/shopping-department-rules.ts';

const roots = {
  produce: ['en:fruits', 'en:vegetables', 'en:aromatic-plants', 'en:mushrooms', 'en:green-beans'],
  meat: ['en:meats', 'en:poultries'],
  fish: ['en:fishes', 'en:seafood'],
  dairy: [
    'en:dairies',
    'en:cheeses',
    'en:eggs',
    'en:butters',
    'en:margarines',
    'en:milk-substitutes',
    'en:cheese-substitutes',
  ],
  bakery: ['en:breads', 'en:pastries', 'en:biscuits', 'en:cakes'],
  vegetarian: ['en:meat-analogues'],
  'ready-meals': ['en:meals', 'en:soups', 'en:sandwiches', 'en:fresh-pasta'],
  baby: ['en:baby-foods'],
  treats: ['en:snacks', 'en:confectioneries', 'en:chocolates'],
  drinks: ['en:beverages', 'en:coffees', 'en:teas'],
  pantry: [
    'en:condiments',
    'en:sauces',
    'en:spices',
    'en:flours',
    'en:cereals-and-their-products',
    'en:legumes-and-their-products',
    'en:nuts-and-their-products',
    'en:seeds',
    'en:dried-fruits',
    'en:vegetable-oils',
    'en:sweeteners',
    'en:pastas',
    'en:rices',
    'en:canned-foods',
    'en:beans',
    'en:chickpeas',
    'en:lentils',
  ],
  frozen: ['en:frozen-foods', 'en:ice-creams'],
};
// These source names need product context; alone they describe unrelated groceries.
const contextOnlyNames = new Set(['english', 'welsh', 'sweet']);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function singular(name) {
  const word = name.split(' ').at(-1);
  if (!word || word.length < 4) return null;
  let one = word;
  if (/ies$/.test(word)) one = word.slice(0, -3) + 'y';
  else if (/(?:ches|shes|sses|xes|zes)$/.test(word)) one = word.slice(0, -2);
  else if (/s$/.test(word) && !/(?:ss|us|is)$/.test(word)) one = word.slice(0, -1);
  return one !== word ? name.slice(0, -word.length) + one : null;
}

/** Generates a standalone derived ODbL database; never called by the application. */
export function buildCatalog(taxonomy, localAliases = {}, options = {}) {
  if (!taxonomy || typeof taxonomy !== 'object' || Array.isArray(taxonomy))
    throw new Error('Invalid taxonomy');
  const anchors = new Map(
    Object.entries(roots).flatMap(([department, ids]) =>
      ids.filter((id) => taxonomy[id]).map((id) => [id, department]),
    ),
  );
  const recognize = options.recognize ?? ((name) => matchShoppingRule(name)?.department ?? null);
  const aliases = new Map();
  let mapped = 0;
  function add(name, department, minimumLength = 3) {
    if (typeof name !== 'string') return;
    const key = normalizeCatalogName(name);
    if (
      key.length < minimumLength ||
      key.length > 140 ||
      key.split(' ').length > 7 ||
      contextOnlyNames.has(key)
    )
      return;
    if (!aliases.has(key)) aliases.set(key, department);
    else if (aliases.get(key) !== department) aliases.set(key, null);
  }
  for (const [id, node] of Object.entries(taxonomy)) {
    if (!node || typeof node !== 'object') continue;
    const ancestors = new Map([[id, 0]]),
      pending = [id];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      const current = pending[cursor];
      const parents = taxonomy[current]?.parents;
      if (!Array.isArray(parents)) continue;
      for (const parent of parents)
        if (typeof parent === 'string' && taxonomy[parent] && !ancestors.has(parent)) {
          ancestors.set(parent, ancestors.get(current) + 1);
          pending.push(parent);
        }
    }
    let department = null;
    if (ancestors.has('en:frozen-foods') || ancestors.has('en:ice-creams')) department = 'frozen';
    else if (ancestors.has('en:canned-foods')) department = 'pantry';
    else if (
      ['en:fresh-vegetables', 'en:fresh-fruits', 'en:fresh-mushrooms'].some((root) =>
        ancestors.has(root),
      )
    )
      department = 'produce';
    // Grocery placement is more useful than the closer cereal/nut ingredient ancestry.
    else if (
      ['en:milk-substitutes', 'en:cheese-substitutes', 'en:non-dairy-yogurts'].some((root) =>
        ancestors.has(root),
      )
    )
      department = 'dairy';
    else {
      let nearest = Infinity;
      const candidates = new Set();
      for (const [parent, distance] of ancestors)
        if (anchors.has(parent)) {
          if (distance < nearest) {
            nearest = distance;
            candidates.clear();
          }
          if (distance === nearest) candidates.add(anchors.get(parent));
        }
      if (candidates.size === 1) department = [...candidates][0];
    }
    if (!department) continue;
    mapped++;
    for (const language of ['en', 'sv']) {
      const synonyms = Array.isArray(node.synonyms?.[language]) ? node.synonyms[language] : [];
      const names = [node.name?.[language], ...synonyms];
      if (id.startsWith(language + ':')) names.push(id.slice(3).replaceAll('-', ' '));
      for (const name of names) {
        if (typeof name !== 'string') continue;
        const normalized = normalizeCatalogName(name);
        add(normalized, department);
        const one = language === 'en' ? singular(normalized) : null;
        if (one) add(one, department);
        const cheese = one ?? normalized;
        if (ancestors.has('en:cheeses') && /^[a-z]{3,24}$/.test(cheese) && !cheese.endsWith('ost'))
          add(cheese + 'ost', department);
      }
    }
  }
  for (const [department, names] of Object.entries(localAliases)) {
    if (!Object.hasOwn(roots, department))
      throw new Error('Invalid local department: ' + department);
    if (!Array.isArray(names)) throw new Error('Invalid local aliases');
    // Reviewed local foods include short Swedish names such as Ål.
    for (const name of names) add(name, department, 2);
  }
  // A correct legacy match is not redundant if a shorter catalogue term can
  // displace it (e.g. blueberry → produce inside blueberry yogurt → dairy).
  // Check the complete alias set so pruning order cannot change this protection.
  function hasCompetingPhrase(name, department) {
    const words = name.split(' ');
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= words.length; end++) {
        const competitor = aliases.get(words.slice(start, end).join(' '));
        if (competitor && competitor !== department) return true;
      }
    }
    return false;
  }
  const departments = {};
  let conflicts = 0,
    pruned = 0,
    count = 0;
  for (const [name, department] of [...aliases].sort(([a], [b]) => compare(a, b))) {
    if (!department) {
      conflicts++;
      continue;
    }
    if (recognize(name) === department && !hasCompetingPhrase(name, department)) {
      pruned++;
      continue;
    }
    (departments[department] ??= []).push(name);
    count++;
  }
  const sorted = Object.fromEntries(
    Object.keys(departments)
      .sort(compare)
      .map((id) => [id, departments[id]]),
  );
  return {
    schemaVersion: 1,
    departments: sorted,
    stats: { aliases: count, categories: mapped, conflicts, pruned },
  };
}
