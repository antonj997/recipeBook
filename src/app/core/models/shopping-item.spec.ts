import { describe, expect, it } from 'vitest';
import {
  groupShoppingItems,
  readShoppingItem,
  shoppingLines,
  type ShoppingItem,
} from './shopping-item';

function item(id: string, text: string, checked = false): ShoppingItem {
  return {
    id,
    text,
    checked,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  };
}
describe('shopping contributions', () => {
  it('combines matching amounts for display without replacing their individual records', () => {
    const entries = [item('a', '2 dl cream'), item('b', '1 dl cream')];
    const groups = groupShoppingItems(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].text).toBe('3 dl cream');
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(entries[0].text).toBe('2 dl cream');
  });
  it('keeps units, preparations, uncertain amounts and bought items separate', () => {
    const entries = [
      item('a', '1 l cream'),
      item('b', '2 dl cream'),
      item('c', '2 red onions'),
      item('d', '1 spring onion'),
      item('e', '1–2 onions'),
      item('f', 'ca 2 onions'),
      item('g', 'salt to taste'),
      item('h', 'salt to taste'),
      item('i', '2 dl cream', true),
    ];
    expect(groupShoppingItems(entries)).toHaveLength(entries.length);
  });
  it('supports fractions and decimal commas but does not parse temperatures or malformed attached names', () => {
    const groups = groupShoppingItems([
      item('a', '½ dl cream'),
      item('b', '1,5 dl cream'),
      item('c', '200°C oven'),
      item('d', '200°C oven'),
      item('e', '2tomatoes'),
      item('f', '2tomatoes'),
    ]);
    expect(groups[0].text).toBe('2 dl cream');
    expect(groups).toHaveLength(5);
  });
  it('never sums worded ranges, alternatives or uncertain measurements', () => {
    for (const label of [
      '2 to 3 onions',
      '1 or 2 peppers',
      '2 ± 0.5 dl milk',
      '2 till 3 lökar',
      '1 eller 2 citroner',
    ]) {
      const groups = groupShoppingItems([item('a', label), item('b', label)]);
      expect(groups).toHaveLength(2);
      expect(groups.map((group) => group.text)).toEqual([label, label]);
    }
  });
  it('keeps unrepresentable totals separate instead of displaying the first amount as a false total', () => {
    const groups = groupShoppingItems([
      item('a', '90071992547409 g rice'),
      item('b', '90071992547409 g rice'),
    ]);
    expect(groups).toHaveLength(2);
  });
  it('keeps source snapshots when a combined row has ingredients from multiple recipes', () => {
    const a = item('a', '2 tomatoes'),
      b = item('b', '1 tomatoes');
    a.sources = [
      {
        recipeId: 'r1',
        recipeTitle: 'Soup',
        servings: 4,
        ingredientIndex: 0,
        originalText: '2 tomatoes',
      },
    ];
    b.sources = [
      {
        recipeId: 'r2',
        recipeTitle: 'Salad',
        servings: 2,
        ingredientIndex: 1,
        originalText: '1 tomatoes',
      },
    ];
    expect(groupShoppingItems([a, b])[0].sources.map((s) => s.recipeTitle)).toEqual([
      'Soup',
      'Salad',
    ]);
  });
  it('splits pasted lists and strips bullet/list markers without losing quantities', () => {
    expect(shoppingLines('• 2 apples\n- 1 l milk\n\n1. Bread\n2.5 dl cream\n½ cucumber')).toEqual([
      '2 apples',
      '1 l milk',
      'Bread',
      '2.5 dl cream',
      '½ cucumber',
    ]);
  });
  it('validates all saved fields and rejects malformed backup or cloud records', () => {
    expect(readShoppingItem({ ...item('a', '  Milk  '), extra: 'ignored' }).text).toBe('Milk');
    for (const value of [
      null,
      { ...item('a', '') },
      { ...item('a', 'Milk'), checked: 'false' },
      { ...item('a', 'Milk'), createdAt: 'bad' },
      { ...item('a', 'Milk'), sources: [{ recipeId: 'x' }] },
    ])
      expect(() => readShoppingItem(value)).toThrow();
  });
});
