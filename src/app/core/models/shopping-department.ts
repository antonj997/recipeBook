import type { ShoppingGroup } from './shopping-item';
import { matchShoppingRule } from './shopping-department-rules';
import { ShoppingProductIndex } from './shopping-product-index';
import catalog from '../data/shopping-products.json';
import { msg } from '../i18n/i18n';

// A general Swedish supermarket circuit; individual stores have different layouts.
export const shoppingDepartments = [
  { id: 'produce', label: msg('Fruit & veg') },
  { id: 'bakery', label: msg('Bread & bakery') },
  { id: 'meat', label: msg('Meat, deli & poultry') },
  { id: 'fish', label: msg('Fish & seafood') },
  { id: 'vegetarian', label: msg('Vegetarian') },
  { id: 'ready-meals', label: msg('Ready meals & sauces') },
  { id: 'dairy', label: msg('Dairy, cheese & eggs') },
  { id: 'pantry', label: msg('Pantry') },
  { id: 'drinks', label: msg('Drinks') },
  { id: 'baby', label: msg('Baby') },
  { id: 'beauty', label: msg('Health & beauty') },
  { id: 'household', label: msg('Cleaning, laundry & paper') },
  { id: 'kitchen', label: msg('Kitchen') },
  { id: 'pets', label: msg('Pets') },
  { id: 'treats', label: msg('Sweets & snacks') },
  { id: 'frozen', label: msg('Frozen') },
  { id: 'other', label: msg('Other') },
] as const;

export type ShoppingDepartmentId = (typeof shoppingDepartments)[number]['id'];
export interface ShoppingDepartmentGroup {
  id: ShoppingDepartmentId;
  label: string;
  groups: ShoppingGroup[];
}

let productIndex: ShoppingProductIndex | undefined;
function products(): ShoppingProductIndex {
  return (productIndex ??= new ShoppingProductIndex(catalog.departments));
}
function classifyProduct(text: string): ShoppingDepartmentId {
  const known = matchShoppingRule(text);
  if (known?.specific) return known.department;
  const product = products().find(text);
  if (
    product &&
    (!known ||
      product.index < known.index ||
      (product.index === known.index && product.length > known.length))
  )
    return product.department;
  return known?.department ?? 'other';
}

function storageHint(note: string): string {
  if (/^\s*(?:fryst[ae]?|frus(?:en|na|et)|djupfryst[ae]?|frozen)\b/.test(note)) return 'frozen';
  if (/^\s*(?:konservera(?:d|de|t)|canned|tinned|pa burk|i burk)\b/.test(note)) return 'canned';
  return '';
}

export function shoppingDepartment(text: string): ShoppingDepartmentId {
  const description = text
    .toLocaleLowerCase('sv-SE')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    // Ignore the alternative or serving dish before inspecting its storage words.
    .split(/\b(?:eller|or|till|for|servera(?:s)?|serve(?:d)?)\b/)[0]
    .replace(/\(([^)]*)\)/g, (_match, note: string) => ' ' + storageHint(note) + ' ');
  const parts = description.split(/,(?!\d)|;/);
  // Preparation notes do not name the product, but explicit storage still determines its aisle.
  const normalized = [parts[0], ...parts.slice(1).map(storageHint)]
    .join(' ')
    .replace(/&|\+/g, ' och ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // A documented compound product is one item, even when its name contains "and".
  // Extra conjunctions outside that name still describe a mixed shopping entry.
  const conjunction = /\b(?:och|and)\b/;
  if (conjunction.test(normalized)) {
    const product = products().find(normalized);
    if (product) {
      const end = product.index + product.length;
      if (
        conjunction.test(normalized.slice(product.index, end)) &&
        !conjunction.test(normalized.slice(0, product.index)) &&
        !conjunction.test(normalized.slice(end))
      )
        return classifyProduct(normalized);
    }
  }
  const departments = new Set(normalized.split(conjunction).map(classifyProduct));
  departments.delete('other');
  return departments.size === 1 ? (departments.values().next().value ?? 'other') : 'other';
}

export function groupByShoppingDepartment(
  groups: readonly ShoppingGroup[],
): ShoppingDepartmentGroup[] {
  const buckets = new Map<ShoppingDepartmentId, ShoppingGroup[]>();
  for (const group of groups) {
    const id = shoppingDepartment(group.text);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(group);
    else buckets.set(id, [group]);
  }
  return shoppingDepartments.flatMap(({ id, label }) => {
    const rows = buckets.get(id);
    return rows ? [{ id, label, groups: rows }] : [];
  });
}
