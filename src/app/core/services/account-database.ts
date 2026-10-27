import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import type { RecipePhotos } from './cloud-photos';
import type { ShoppingItem } from '../models/shopping-item';
import type { StoredImage, StoredThumb } from '../models/recipe-image';
import type { db } from '../database';

export type CookbookTable = 'recipes' | 'collections' | 'shoppingItems';
export type CookbookDatabase = typeof db | AccountDatabase;
export type CookbookValue = Recipe | RecipeCollection | ShoppingItem;
export interface PendingChange {
  key: string;
  table: CookbookTable;
  id: string;
  revision: string;
  value: CookbookValue | null;
}
/** Where the last pull of a table stopped: the server's updated_at and id of its last row. */
export interface SyncState {
  table: CookbookTable;
  cursor?: { at: string; id: string };
}
/** The server version of a row this device has applied, so overlapping pulls skip it. */
export interface RemoteVersion {
  key: string;
  updatedAt: string;
}

// Keep the original device cookbook untouched, and isolate every account's offline copy.
export class AccountDatabase extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  collections!: EntityTable<RecipeCollection, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  outbox!: EntityTable<PendingChange, 'key'>;
  photos!: EntityTable<{ id: string; paths: RecipePhotos }, 'id'>;
  images!: EntityTable<StoredImage, 'id'>;
  thumbs!: EntityTable<StoredThumb, 'id'>;
  syncState!: EntityTable<SyncState, 'table'>;
  remote!: EntityTable<RemoteVersion, 'key'>;

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
    this.version(3).stores({
      images: 'id',
      thumbs: 'id',
    });
    this.version(4).stores({
      syncState: 'table',
      remote: 'key',
    });
  }
}
