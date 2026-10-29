import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import { CloudCookbookService } from './cloud-cookbook.service';
import type { Recipe } from '../models/recipe.model';
import { scaleIngredient } from '../models/ingredient-quantity';
import {
  groupShoppingItems,
  readShoppingItem,
  shoppingLines,
  type ShoppingItem,
} from '../models/shopping-item';
import { msg } from '../i18n/i18n';

@Service()
export class ShoppingListService {
  readonly cloud = inject(CloudCookbookService);
  readonly accountVersion = this.cloud.auth.accountVersion;
  private readonly records = signal<ShoppingItem[]>([]);
  private readonly loadedVersion = signal(-1);
  readonly items = computed(() =>
    this.loadedVersion() === this.accountVersion() ? this.records() : [],
  );
  readonly groups = computed(() => groupShoppingItems(this.items()));
  readonly loading = signal(true);
  readonly error = signal('');
  private request = 0;
  private destroyed = false;
  private readonly additions = new Map<string, Promise<number>>();

  constructor() {
    effect(() => {
      this.cloud.revision();
      this.accountVersion();
      untracked(() => void this.refresh());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      ++this.request;
    });
  }

  async refresh(): Promise<void> {
    const request = ++this.request;
    const version = this.accountVersion();
    if (this.loadedVersion() !== version) this.loading.set(true);
    try {
      await this.cloud.initialize();
      if (this.destroyed || request !== this.request || version !== this.accountVersion()) return;
      const records = await this.cloud.database.shoppingItems.toArray();
      if (this.destroyed || request !== this.request || version !== this.accountVersion()) return;
      this.records.set(records.map(readShoppingItem));
      this.loadedVersion.set(version);
      this.error.set('');
    } catch {
      if (!this.destroyed && request === this.request && version === this.accountVersion())
        this.error.set(
          msg('Could not load your shopping list. Your saved items are safe. Try again.'),
        );
    } finally {
      if (!this.destroyed && request === this.request) this.loading.set(false);
    }
  }

  private context() {
    const version = this.accountVersion(),
      database = this.cloud.database;
    const assertCurrent = () => {
      if (version !== this.accountVersion() || database !== this.cloud.database)
        throw new Error(msg('Account changed. Try again.'));
    };
    return { version, database, assertCurrent };
  }

  async addManual(text: string): Promise<number> {
    const context = this.context(),
      now = new Date().toISOString(),
      batchId = crypto.randomUUID();
    const items = shoppingLines(text).map((text, index) =>
      readShoppingItem({
        id: batchId + '-' + String(index).padStart(6, '0'),
        text,
        checked: false,
        createdAt: now,
        updatedAt: now,
        batchId,
      }),
    );
    if (!items.length) return 0;
    context.assertCurrent();
    await this.cloud.applyShoppingChanges(items, [], context.database);
    await this.refresh();
    return items.length;
  }

  hasRecipeSelection(recipe: Recipe, servings: number, indices: readonly number[]): boolean {
    return indices.some((index) =>
      this.items().some((item) =>
        item.sources?.some(
          (source) =>
            source.recipeId === recipe.id &&
            source.servings === servings &&
            source.ingredientIndex === index &&
            source.originalText === recipe.ingredients[index],
        ),
      ),
    );
  }

  addRecipe(
    recipe: Recipe,
    servings: number,
    indices: readonly number[],
    allowDuplicate = false,
  ): Promise<number> {
    const selected = [...new Set(indices)].sort((a, b) => a - b);
    const key = JSON.stringify([
      this.accountVersion(),
      recipe.id,
      servings,
      selected.map((i) => [i, recipe.ingredients[i]]),
    ]);
    const pending = this.additions.get(key);
    if (pending) return pending;
    const operation = this.addRecipeBatch(recipe, servings, selected, allowDuplicate);
    this.additions.set(key, operation);
    void operation
      .finally(() => {
        if (this.additions.get(key) === operation) this.additions.delete(key);
      })
      .catch(() => {});
    return operation;
  }

  private async addRecipeBatch(
    recipe: Recipe,
    servings: number,
    indices: readonly number[],
    allowDuplicate: boolean,
  ): Promise<number> {
    const context = this.context();
    if (!Number.isSafeInteger(servings) || servings <= 0)
      throw new Error(msg('Choose a valid number of servings.'));
    if (
      indices.some(
        (index) => !Number.isSafeInteger(index) || index < 0 || index >= recipe.ingredients.length,
      )
    )
      throw new Error(msg('One of these ingredients is no longer available.'));
    // Read durable records before duplicate detection, including changes just committed in another view.
    const current = await context.database.shoppingItems.toArray();
    context.assertCurrent();
    if (
      !allowDuplicate &&
      indices.some((index) =>
        current.some((item) =>
          item.sources?.some(
            (source) =>
              source.recipeId === recipe.id &&
              source.servings === servings &&
              source.ingredientIndex === index &&
              source.originalText === recipe.ingredients[index],
          ),
        ),
      )
    )
      throw new Error(msg('These ingredients are already on your list.'));
    const base =
      recipe.servings && Number.isSafeInteger(recipe.servings) && recipe.servings > 0
        ? recipe.servings
        : 4;
    const now = new Date().toISOString(),
      batchId = crypto.randomUUID();
    const items = indices
      .filter((index) => recipe.ingredients[index].trim())
      .map((index) =>
        readShoppingItem({
          id: batchId + '-' + String(index).padStart(6, '0'),
          text: scaleIngredient(recipe.ingredients[index], base, servings),
          checked: false,
          createdAt: now,
          updatedAt: now,
          batchId,
          sources: [
            {
              recipeId: recipe.id,
              recipeTitle: recipe.title.trim() || 'Recipe',
              servings,
              ingredientIndex: index,
              originalText: recipe.ingredients[index],
            },
          ],
        }),
      );
    if (!items.length) return 0;
    context.assertCurrent();
    await this.cloud.applyShoppingChanges(items, [], context.database, {
      rejectDuplicateSources: !allowDuplicate,
    });
    await this.refresh();
    return items.length;
  }

  async setChecked(ids: readonly string[], checked: boolean): Promise<void> {
    const context = this.context(),
      now = new Date().toISOString();
    const records = await context.database.shoppingItems.bulkGet([...new Set(ids)]);
    context.assertCurrent();
    const changed = records
      .filter((item): item is ShoppingItem => !!item && item.checked !== checked)
      .map((item) => ({ ...item, checked, updatedAt: now }));
    if (changed.length) await this.cloud.applyShoppingChanges(changed, [], context.database);
    await this.refresh();
  }

  async edit(ids: readonly string[], text: string): Promise<void> {
    const context = this.context();
    const records = (await context.database.shoppingItems.bulkGet([...new Set(ids)])).filter(
      (item): item is ShoppingItem => !!item,
    );
    context.assertCurrent();
    if (!records.length) throw new Error(msg('This item is no longer on your list.'));
    const [first, ...rest] = records;
    const sources = groupShoppingItems(records).flatMap((group) => group.sources);
    const edited = readShoppingItem({
      ...first,
      text: text.trim().replace(/\s+/g, ' '),
      sources,
      updatedAt: new Date().toISOString(),
    });
    await this.cloud.applyShoppingChanges(
      [edited],
      rest.map((item) => item.id),
      context.database,
    );
    await this.refresh();
  }

  async remove(ids: readonly string[]): Promise<() => Promise<void>> {
    const context = this.context();
    const snapshots = (await context.database.shoppingItems.bulkGet([...new Set(ids)]))
      .filter((item): item is ShoppingItem => !!item)
      .map((item) => structuredClone(item));
    context.assertCurrent();
    await this.cloud.applyShoppingChanges(
      [],
      snapshots.map((item) => item.id),
      context.database,
    );
    await this.refresh();
    return async () => {
      context.assertCurrent();
      await this.cloud.applyShoppingChanges(snapshots, [], context.database, {
        restoreMissingOnly: true,
      });
      await this.refresh();
    };
  }

  async clear(checkedOnly: boolean): Promise<() => Promise<void>> {
    const context = this.context();
    const records = await context.database.shoppingItems.toArray();
    context.assertCurrent();
    return this.remove(
      records.filter((item) => !checkedOnly || item.checked).map((item) => item.id),
    );
  }
}
