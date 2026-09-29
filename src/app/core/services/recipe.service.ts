import type { RecipeCollection } from '../models/recipe-collection.model';
import { readRecipeMetadata, isHttpsUrl } from '../models/recipe-metadata';
import { Injectable } from '@angular/core';
import type { Recipe } from '../models/recipe.model';
import { db } from '../database';

export interface RecipeBackup {
  app: 'recipiebook';
  version: 1;
  exportedAt: string;
  recipes: Recipe[];
  collections?: RecipeCollection[];
}

export interface ImportResult {
  added: number;
  skipped: number;
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
  getCollections(): Promise<RecipeCollection[]> {
    return db.collections.orderBy('sortOrder').toArray();
  }
  async createCollection(name: string): Promise<RecipeCollection> {
    return db.transaction('rw', db.collections, async () => {
      const collections = await this.getCollections();
      const existing = collections.find(
        (c) => c.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      );
      if (existing) return existing;
      const collection = {
        id: crypto.randomUUID(),
        name: name.trim(),
        sortOrder: Math.max(-1, ...collections.map((c) => c.sortOrder)) + 1,
      };
      await db.collections.add(collection);
      return collection;
    });
  }
  matchCollections(category: string | undefined, collections: RecipeCollection[]): string[] {
    const names = (category ?? '').split(/[,;]/).map((name) => name.trim().toLocaleLowerCase());
    return collections
      .filter((c) => names.includes(c.name.trim().toLocaleLowerCase()))
      .map((c) => c.id);
  }
  // Retrieve all recipes, sorted by title.
  getRecipes(): Promise<Recipe[]> {
    return db.recipes.orderBy('title').toArray();
  }

  // Retrieve a specific recipe.
  getRecipe(id: string): Promise<Recipe | undefined> {
    return db.recipes.get(id);
  }

  // Add a new recipe.
  async addRecipe(recipeData: Omit<Recipe, 'id'>): Promise<Recipe> {
    const newRecipe: Recipe = {
      ...recipeData,
      id: crypto.randomUUID(),
    };

    await db.recipes.add(newRecipe);

    return newRecipe;
  }

  async updateRecipe(id: string, changes: Partial<Omit<Recipe, 'id'>>): Promise<void> {
    const updated = await db.recipes.update(id, {
      ...changes,
      sourceRating: undefined,
      difficulty: undefined,
      prepTime: undefined,
      cookTime: undefined,
      tips: undefined,
      yieldText: undefined,
      category: undefined,
      cuisine: undefined,
      dietaryNotes: undefined,
    } as Partial<Recipe>);

    if (updated === 0) {
      throw new Error('Recipe not found');
    }
  }

  async deleteRecipe(id: string): Promise<void> {
    await db.recipes.delete(id);
  }

  async exportBackup(): Promise<RecipeBackup> {
    const recipes = await this.getRecipes();

    return {
      app: 'recipiebook',
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: await this.getCollections(),
      recipes: recipes.map((recipe) => {
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
      data['version'] !== 1 ||
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
        collections.push({ id: item['id'], name: item['name'], sortOrder: item['sortOrder'] });
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
      for (const key of ['tagIds', 'collectionIds'] as const) {
        const values = item[key];
        if (values !== undefined) {
          if (!Array.isArray(values) || !values.every(isNonEmptyString))
            throw new Error('Invalid recipe details.');
          recipe[key] = values;
        }
      }
      recipes.push(recipe);
    }

    return {
      app: 'recipiebook',
      version: 1,
      exportedAt: data['exportedAt'],
      recipes,
      collections,
    };
  }

  async importBackup(data: unknown): Promise<ImportResult> {
    // Validate the entire backup first.
    const backup = this.validateBackup(data);

    if (backup.recipes.length === 0 && !backup.collections?.length) {
      return { added: 0, skipped: 0 };
    }

    // Run database operations inside a transaction.
    return db.transaction('rw', db.recipes, db.collections, async () => {
      const savedCollections = await this.getCollections();
      const newCollections = (backup.collections ?? []).filter(
        (c) => !savedCollections.some((existing) => existing.id === c.id),
      );
      if (newCollections.length) await db.collections.bulkAdd(newCollections);
      const ids = backup.recipes.map((recipe) => recipe.id);

      // Look up existing recipes in one operation.
      const existing = await db.recipes.bulkGet(ids);

      // Keep only recipes that aren't already stored.
      const newRecipes = backup.recipes.filter((_, index) => existing[index] === undefined);

      // Insert the new recipes.
      if (newRecipes.length > 0) {
        await db.recipes.bulkAdd(newRecipes);
      }

      return {
        added: newRecipes.length,
        skipped: backup.recipes.length - newRecipes.length,
      };
    });
  }
}
