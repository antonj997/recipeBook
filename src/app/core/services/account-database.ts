import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import type { RecipePhotos } from './cloud-photos';
import type { ShoppingItem } from '../models/shopping-item';

export type CookbookTable = 'recipes' | 'collections' | 'shoppingItems';
export type CookbookValue = Recipe | RecipeCollection | ShoppingItem;
export interface PendingChange {
  key: string;
  table: CookbookTable;
  id: string;
  revision: string;
  value: CookbookValue | null;
}

// Keep the original device cookbook untouched, and isolate every account's offline copy.
export class AccountDatabase extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  collections!: EntityTable<RecipeCollection, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  outbox!: EntityTable<PendingChange, 'key'>;
  photos!: EntityTable<{ id: string; paths: RecipePhotos }, 'id'>;

  constructor(userId: string) {
    super('RecipebookAccount-' + userId);
    this.version(1).stores({
      recipes: 'id, title',
      collections: 'id, name, sortOrder',
      outbox: 'key',
      photos: 'id',
    });
    this.version(2).stores({
      shoppingItems: 'id, createdAt',
    });
  }
}
