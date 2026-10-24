import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShoppingListService } from './shopping-list.service';
import { CloudCookbookService } from './cloud-cookbook.service';
import type { ShoppingItem } from '../models/shopping-item';
import type { Recipe } from '../models/recipe.model';

describe('shopping list operations', () => {
  const version = signal(0),
    revision = signal(0);
  const records = new Map<string, ShoppingItem>();
  const table = {
    toArray: async () => [...records.values()],
    bulkGet: async (ids: string[]) => ids.map((id) => records.get(id)),
  };
  const database = { shoppingItems: table };
  const cloud = {
    auth: { accountVersion: version },
    revision,
    database,
    initialize: async () => {},
    applyShoppingChanges: async (
      puts: readonly ShoppingItem[],
      ids: readonly string[],
      _database?: unknown,
      options: { restoreMissingOnly?: boolean; rejectDuplicateSources?: boolean } = {},
    ) => {
      if (
        options.rejectDuplicateSources &&
        puts.some((item) =>
          item.sources?.some((source) =>
            [...records.values()].some((current) =>
              current.sources?.some(
                (existing) =>
                  existing.recipeId === source.recipeId &&
                  existing.servings === source.servings &&
                  existing.ingredientIndex === source.ingredientIndex &&
                  existing.originalText === source.originalText,
              ),
            ),
          ),
        )
      )
        throw new Error('These ingredients are already on your list.');
      ids.forEach((id) => records.delete(id));
      puts.forEach((item) => {
        if (!options.restoreMissingOnly || !records.has(item.id))
          records.set(item.id, structuredClone(item));
      });
      revision.update((n) => n + 1);
    },
  };
  const recipe: Recipe = {
    id: 'soup',
    title: 'Soup',
    servings: 4,
    ingredients: ['2 tomatoes', '1 dl cream', 'Salt to taste'],
    instructions: [],
  };
  beforeEach(() => {
    version.set(0);
    revision.set(0);
    records.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: CloudCookbookService, useValue: cloud }],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  async function service() {
    const s = TestBed.inject(ShoppingListService);
    await s.refresh();
    return s;
  }
  it('adds multiline manual entries locally and preserves numeric quantities', async () => {
    const s = await service();
    expect(await s.addManual('• 2 apples\n1 l milk')).toBe(2);
    expect([...records.values()].map((i) => i.text)).toEqual(['2 apples', '1 l milk']);
    expect(s.groups().map((group) => group.text)).toEqual(['2 apples', '1 l milk']);
  });
  it('scales a selected ingredient from originals and retains the source snapshot', async () => {
    const s = await service();
    expect(await s.addRecipe(recipe, 2, [1])).toBe(1);
    const item = [...records.values()][0];
    expect(item.text).toBe('0.5 dl cream');
    expect(item.sources?.[0].originalText).toBe('1 dl cream');
  });
  it('prevents accidental repeated additions and coalesces overlapping submissions', async () => {
    const s = await service();
    const a = s.addRecipe(recipe, 4, [0]),
      b = s.addRecipe(recipe, 4, [0]);
    expect(a).toBe(b);
    await a;
    expect(records.size).toBe(1);
    await expect(s.addRecipe(recipe, 4, [0])).rejects.toThrow('already');
    await s.addRecipe(recipe, 4, [0], true);
    expect(records.size).toBe(2);
  });
  it('uses durable duplicate protection for overlapping recipe selections', async () => {
    const s = await service();
    const result = await Promise.allSettled([
      s.addRecipe(recipe, 4, [0]),
      s.addRecipe(recipe, 4, [0, 1]),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(records.size).toBe(1);
  });
  it('checks only the selected contribution IDs and keeps cooking data untouched', async () => {
    const s = await service();
    await s.addRecipe(recipe, 4, [0, 1]);
    const ids = [...records.keys()];
    await s.setChecked([ids[0]], true);
    expect(records.get(ids[0])?.checked).toBe(true);
    expect(records.get(ids[1])?.checked).toBe(false);
  });
  it('undo restores removed entries without replacing later additions or edits', async () => {
    const s = await service();
    await s.addManual('Milk');
    const [id] = records.keys();
    const undo = await s.remove([id]);
    await s.addManual('Bread');
    await undo();
    expect(records.size).toBe(2);
    const undoAgain = await s.remove([id]);
    records.set(id, {
      id,
      text: 'Oat milk',
      checked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await undoAgain();
    expect(records.get(id)?.text).toBe('Oat milk');
  });
  it('hides prior account items immediately and refuses cross-account undo', async () => {
    const s = await service();
    await s.addManual('Milk');
    const undo = await s.remove([...records.keys()]);
    await s.addManual('Bread');
    version.set(1);
    expect(s.items()).toEqual([]);
    await expect(undo()).rejects.toThrow('Account changed');
  });
  it('editing a combined row affects captured IDs only', async () => {
    const s = await service();
    await s.addManual('2 apples\n1 apples');
    const ids = [...records.keys()];
    await s.addManual('Milk');
    await s.edit(ids, '4 apples');
    expect([...records.values()].map((i) => i.text).sort()).toEqual(['4 apples', 'Milk']);
  });
  it('validates an entire manual batch before writing any entries', async () => {
    const s = await service();
    await expect(s.addManual('Milk\n' + 'x'.repeat(2001))).rejects.toThrow();
    expect(records.size).toBe(0);
  });
});
