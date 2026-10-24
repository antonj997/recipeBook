import { formatIngredientAmount, readIngredientAmount } from './ingredient-quantity';

export interface ShoppingSource {
  recipeId: string;
  recipeTitle: string;
  servings: number;
  ingredientIndex: number;
  originalText: string;
}
export interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
  sources?: ShoppingSource[];
  batchId?: string;
}
export interface ShoppingGroup {
  key: string;
  text: string;
  checked: boolean;
  items: ShoppingItem[];
  sources: ShoppingSource[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
function date(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

/** Cloud/backup input is whitelisted, never spread into a saved shopping entry. */
export function readShoppingItem(value: unknown): ShoppingItem {
  if (
    !record(value) ||
    !text(value['id'], 200) ||
    !text(value['text'], 2000) ||
    typeof value['checked'] !== 'boolean' ||
    !date(value['createdAt']) ||
    !date(value['updatedAt'])
  )
    throw new Error('Invalid shopping item.');
  const item: ShoppingItem = {
    id: value['id'],
    text: value['text'].trim(),
    checked: value['checked'],
    createdAt: value['createdAt'],
    updatedAt: value['updatedAt'],
  };
  if (value['batchId'] !== undefined) {
    if (!text(value['batchId'], 200)) throw new Error('Invalid shopping batch.');
    item.batchId = value['batchId'];
  }
  if (value['sources'] !== undefined) {
    if (!Array.isArray(value['sources']) || value['sources'].length > 1000)
      throw new Error('Invalid shopping sources.');
    item.sources = value['sources'].map((source) => {
      if (
        !record(source) ||
        !text(source['recipeId'], 200) ||
        !text(source['recipeTitle'], 1000) ||
        !text(source['originalText'], 2000) ||
        typeof source['servings'] !== 'number' ||
        !Number.isSafeInteger(source['servings']) ||
        source['servings'] <= 0 ||
        typeof source['ingredientIndex'] !== 'number' ||
        !Number.isSafeInteger(source['ingredientIndex']) ||
        source['ingredientIndex'] < 0
      )
        throw new Error('Invalid shopping source.');
      return {
        recipeId: source['recipeId'],
        recipeTitle: source['recipeTitle'],
        servings: source['servings'],
        ingredientIndex: source['ingredientIndex'],
        originalText: source['originalText'],
      };
    });
  }
  return item;
}

export function shoppingLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•‣◦▪]\s+|\d+[.)]\s+(?=\D))/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** Totals are a view: each recipe/manual contribution keeps its own durable ID. */
export function groupShoppingItems(items: readonly ShoppingItem[]): ShoppingGroup[] {
  const groups = new Map<string, ShoppingGroup>();
  const totals = new Map<string, { value: number; suffix: string; decimalComma: boolean }>();
  for (const item of [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )) {
    const amount = readIngredientAmount(item.text);
    const normalized = amount?.suffix
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
    let key = `${item.checked ? 'bought' : 'needed'}:${normalized ? 'amount:' + normalized : 'item:' + item.id}`;
    const previous = totals.get(key);
    if (
      amount &&
      previous &&
      !formatIngredientAmount(
        previous.value + amount.value,
        previous.decimalComma || amount.decimalComma,
      )
    )
      key += ':item:' + item.id;
    let group = groups.get(key);
    if (!group) {
      group = { key, text: item.text, checked: item.checked, items: [], sources: [] };
      groups.set(key, group);
    }
    group.items.push(item);
    for (const source of item.sources ?? []) {
      if (
        !group.sources.some(
          (s) =>
            s.recipeId === source.recipeId &&
            s.ingredientIndex === source.ingredientIndex &&
            s.servings === source.servings &&
            s.originalText === source.originalText,
        )
      )
        group.sources.push(source);
    }
    if (amount && normalized) {
      const total = totals.get(key) ?? { value: 0, suffix: amount.suffix, decimalComma: false };
      total.value += amount.value;
      total.decimalComma ||= amount.decimalComma;
      totals.set(key, total);
      const formatted = formatIngredientAmount(total.value, total.decimalComma);
      if (formatted && group.items.length > 1) group.text = `${formatted} ${total.suffix}`;
    }
  }
  return [...groups.values()];
}
