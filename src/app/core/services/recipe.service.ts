import { StepTimerService } from './step-timer.service';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { readRecipeMetadata, isHttpsUrl } from '../models/recipe-metadata';
import { Injectable, inject } from '@angular/core';
import type { Recipe } from '../models/recipe.model';
import { inlinePhotos } from '../models/recipe-image';
import { CloudCookbookService } from './cloud-cookbook.service';
import { readShoppingItem, type ShoppingItem } from '../models/shopping-item';
import type Dexie from 'dexie';

export type RecipeBackup = {
  app: 'recipiebook';
  exportedAt: string;
  recipes: Recipe[];
  collections?: RecipeCollection[];
} & ({ version: 1; shoppingItems?: never } | { version: 2; shoppingItems: ShoppingItem[] });

export interface ImportResult {
  added: number;
  skipped: number;
  shoppingAdded?: number;
}

// Checks that a value is a regular object.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Checks that a string isn't empty.
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

@Injectable({
  providedIn: 'root',
})
export class RecipeService {
  private cloud = inject(CloudCookbookService);
  private readonly timers = inject(StepTimerService);
  readonly revision = this.cloud.revision;
  readonly accountVersion = this.cloud.auth.accountVersion;

  getCollections(): Promise<RecipeCollection[]> {
    return this.cloud.database.collections.orderBy('sortOrder').toArray();
  }
  async createCollection(name: string): Promise<RecipeCollection> {
    name = name.trim();
    if (!name || name.length > 80)
      throw new Error('Use a category name between 1 and 80 characters.');
    const database = this.cloud.database;
    const version = this.accountVersion();
    const collections = await database.collections.toArray();
    if (version !== this.accountVersion()) throw new Error('Account changed. Try again.');
    const existing = collections.find(
      (c) => c.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    );
    if (existing) return existing;
    const collection = {
      id: crypto.randomUUID(),
      name: name.trim(),
      sortOrder: Math.max(-1, ...collections.map((c) => c.sortOrder)) + 1,
    };
    await this.cloud.put('collections', collection, database);
    return collection;
  }
  async renameCollection(id: string, name: string): Promise<void> {
    name = name.trim();
    if (!name || name.length > 80)
      throw new Error('Use a category name between 1 and 80 characters.');
    const database = this.cloud.database;
    const version = this.accountVersion();
    const collections = await database.collections.toArray();
    if (version !== this.accountVersion()) throw new Error('Account changed. Try again.');
    const collection = collections.find((item) => item.id === id);
    if (!collection) throw new Error('Category not found. Reload to try again.');
    if (
      collections.some(
        (item) =>
          item.id !== id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      throw new Error('A category with that name already exists. Choose another name.');
    await this.cloud.put('collections', { ...collection, name }, database);
  }
  async removeCollection(id: string): Promise<void> {
    await this.cloud.removeCollection(id);
  }
  async assignCollection(
    id: string,
    selected: ReadonlySet<string>,
    shown: ReadonlySet<string>,
  ): Promise<void> {
    const database = this.cloud.database;
    const version = this.accountVersion();
    if (!(await database.collections.get(id))) throw new Error('Category not found.');
    const recipes = await database.recipes.toArray();
    if (version !== this.accountVersion()) throw new Error('Account changed. Try again.');
    const changed = recipes
      .filter(
        (recipe) =>
          shown.has(recipe.id) && !!recipe.collectionIds?.includes(id) !== selected.has(recipe.id),
      )
      .map((recipe) => ({
        ...recipe,
        collectionIds: selected.has(recipe.id)
          ? [...(recipe.collectionIds ?? []), id]
          : (recipe.collectionIds ?? []).filter((categoryId) => categoryId !== id),
        updatedAt: new Date().toISOString(),
      }));
    await this.cloud.putRecipes(changed, database);
  }
  matchCollections(category: string | undefined, collections: RecipeCollection[]): string[] {
    const names = (category ?? '').split(/[,;]/).map((name) => name.trim().toLocaleLowerCase());
    return collections
      .filter((c) => names.includes(c.name.trim().toLocaleLowerCase()))
      .map((c) => c.id);
  }
  getRecipes(): Promise<Recipe[]> {
    return this.cloud.database.recipes.orderBy('title').toArray();
  }
  getRecipe(id: string): Promise<Recipe | undefined> {
    return this.cloud.database.recipes.get(id);
  }
  async addRecipe(recipeData: Omit<Recipe, 'id'>): Promise<Recipe> {
    const recipe = { ...recipeData, id: crypto.randomUUID() };
    await this.cloud.put('recipes', recipe);
    return recipe;
  }
  async updateRecipe(id: string, changes: Partial<Omit<Recipe, 'id'>>): Promise<void> {
    const database = this.cloud.database;
    const current = await database.recipes.get(id);
    if (!current) throw new Error('Recipe not found');
    const recipe = { ...current, ...changes } as Recipe & Record<string, unknown>;
    // The editor speaks for the cover as a data URL; leaving it out removes the stored photo.
    if ('imageDataUrl' in changes && !('photoId' in changes)) delete recipe.photoId;
    for (const key of [
      'sourceRating',
      'difficulty',
      'prepTime',
      'cookTime',
      'tips',
      'yieldText',
      'category',
      'cuisine',
      'dietaryNotes',
      'tags',
      'tagIds',
    ])
      delete recipe[key];
    await this.cloud.put('recipes', recipe, database);
  }
  async deleteWithUndo(id: string): Promise<() => Promise<void>> {
    const database = this.cloud.database,
      version = this.accountVersion();
    const recipe = await database.recipes.get(id);
    if (!recipe) throw new Error('Recipe not found.');
    if (version !== this.accountVersion()) throw new Error('Account changed. Try again.');
    const snapshot = structuredClone(recipe);
    await this.cloud.remove('recipes', id, database);
    if (version === this.accountVersion()) this.timers.removeRecipe(id);
    return async () => {
      if (version !== this.accountVersion()) throw new Error('Account changed.');
      const existing = await database.recipes.get(id);
      if (version !== this.accountVersion()) throw new Error('Account changed.');
      if (existing) throw new Error('Recipe already exists.');
      await this.cloud.put('recipes', snapshot, database);
    };
  }

  async exportBackup(): Promise<RecipeBackup> {
    const database = this.cloud.database;
    const version = this.accountVersion();
    const transactions: Dexie = database;
    const { recipes, collections, shoppingItems } = await transactions.transaction(
      'r',
      database.recipes,
      database.collections,
      database.shoppingItems,
      async () => ({
        recipes: await database.recipes.orderBy('title').toArray(),
        collections: await database.collections.orderBy('sortOrder').toArray(),
        shoppingItems: (await database.shoppingItems.orderBy('createdAt').toArray()).map(
          readShoppingItem,
        ),
      }),
    );
    // Backups carry photo bytes as data URLs, so they restore on any device and older versions.
    const portable = await Promise.all(recipes.map((recipe) => inlinePhotos(database, recipe)));
    if (database !== this.cloud.database || version !== this.accountVersion())
      throw new Error('Account changed. Try again.');

    return {
      app: 'recipiebook',
      version: 2,
      exportedAt: new Date().toISOString(),
      collections,
      shoppingItems,
      recipes: portable.map((recipe) => {
        const clean = { ...recipe } as Recipe & Record<string, unknown>;
        for (const key of [
          'sourceRating',
          'difficulty',
          'prepTime',
          'cookTime',
          'tips',
          'yieldText',
          'category',
          'cuisine',
          'dietaryNotes',
          'tags',
          'tagIds',
        ])
          delete clean[key];
        return { ...clean, ...readRecipeMetadata(recipe) };
      }),
    };
  }

  validateBackup(data: unknown): RecipeBackup {
    // Validate the backup itself.
    if (
      !isObject(data) ||
      data['app'] !== 'recipiebook' ||
      (data['version'] !== 1 && data['version'] !== 2) ||
      !isNonEmptyString(data['exportedAt']) ||
      Number.isNaN(Date.parse(data['exportedAt'])) ||
      !Array.isArray(data['recipes'])
    ) {
      throw new Error('Invalid or unsupported backup file.');
    }

    const collections: RecipeCollection[] = [];
    if (data['collections'] !== undefined) {
      if (!Array.isArray(data['collections'])) throw new Error('Invalid collections in backup.');
      const seen = new Set<string>();
      for (const item of data['collections']) {
        if (
          !isObject(item) ||
          !isNonEmptyString(item['id']) ||
          !isNonEmptyString(item['name']) ||
          typeof item['sortOrder'] !== 'number' ||
          !Number.isFinite(item['sortOrder']) ||
          seen.has(item['id'])
        )
          throw new Error('Invalid collection in backup.');
        seen.add(item['id']);
        collections.push({
          id: item['id'],
          name: item['name'],
          sortOrder: item['sortOrder'],
        });
      }
    }
    const recipes: Recipe[] = [];
    const ids = new Set<string>();

    // Validate every recipe.
    for (const item of data['recipes']) {
      if (
        !isObject(item) ||
        !isNonEmptyString(item['id']) ||
        !isNonEmptyString(item['title']) ||
        typeof item['servings'] !== 'number' ||
        !Number.isSafeInteger(item['servings']) ||
        item['servings'] < 1 ||
        !Array.isArray(item['ingredients']) ||
        !item['ingredients'].every(isNonEmptyString) ||
        !Array.isArray(item['instructions']) ||
        !item['instructions'].every(isNonEmptyString) ||
        (item['sourceUrl'] !== undefined && !isHttpsUrl(item['sourceUrl']))
      ) {
        throw new Error('The backup contains an invalid recipe.');
      }
      // Validate the optional photo.
      const imageDataUrl = item['imageDataUrl'];

      if (
        imageDataUrl !== undefined &&
        (typeof imageDataUrl !== 'string' ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl) ||
          imageDataUrl.length > 1_500_000)
      ) {
        throw new Error('The backup contains an invalid recipe image.');
      }

      // Reject duplicate IDs inside the backup.
      if (ids.has(item['id'])) {
        throw new Error('The backup contains duplicate recipe IDs.');
      }

      ids.add(item['id']);

      const recipe: Recipe = {
        ...readRecipeMetadata(item, true),
        id: item['id'],
        title: item['title'],
        servings: item['servings'],
        ingredients: item['ingredients'],
        instructions: item['instructions'],
      };

      if (typeof imageDataUrl === 'string') {
        recipe.imageDataUrl = imageDataUrl;
      }

      if (typeof item['sourceUrl'] === 'string') {
        recipe.sourceUrl = item['sourceUrl'];
      }

      for (const key of ['notes', 'createdAt', 'updatedAt'] as const) {
        if (item[key] !== undefined) {
          if (typeof item[key] !== 'string') throw new Error('Invalid recipe details.');
          recipe[key] = item[key];
        }
      }
      for (const key of ['collectionIds'] as const) {
        const values = item[key];
        if (values !== undefined) {
          if (!Array.isArray(values) || !values.every(isNonEmptyString))
            throw new Error('Invalid recipe details.');
          recipe[key] = values;
        }
      }
      recipes.push(recipe);
    }

    const shoppingItems: ShoppingItem[] = [];
    if (data['version'] === 2) {
      if (!Array.isArray(data['shoppingItems']))
        throw new Error('Invalid shopping list in backup.');
      const seen = new Set<string>();
      for (const raw of data['shoppingItems']) {
        const item = readShoppingItem(raw);
        if (seen.has(item.id)) throw new Error('The backup contains duplicate shopping item IDs.');
        seen.add(item.id);
        shoppingItems.push(item);
      }
    }

    return {
      app: 'recipiebook',
      exportedAt: data['exportedAt'],
      recipes,
      collections,
      ...(data['version'] === 2 ? { version: 2, shoppingItems } : { version: 1 }),
    };
  }

  async importBackup(data: unknown): Promise<ImportResult> {
    // Validate the entire backup first.
    const backup = this.validateBackup(data);

    if (
      backup.recipes.length === 0 &&
      !backup.collections?.length &&
      !backup.shoppingItems?.length
    ) {
      return { added: 0, skipped: 0, shoppingAdded: 0 };
    }

    return this.cloud.importRecords(
      backup.recipes,
      backup.collections,
      this.cloud.database,
      backup.shoppingItems,
    );
  }
}
