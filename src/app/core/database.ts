import Dexie, { type EntityTable } from 'dexie';

import type { Recipe } from './models/recipe.model';
import type { RecipeCollection } from './models/recipe-collection.model';
import type { ShoppingItem } from './models/shopping-item';

export const db = new Dexie('RecipebookDB') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>;
  collections: EntityTable<RecipeCollection, 'id'>;
  shoppingItems: EntityTable<ShoppingItem, 'id'>;
};

// Original schema. Keep this declaration.
db.version(1).stores({
  recipes: 'id, title',
});

// Add personal collections without changing the recipes table.
db.version(2).stores({
  collections: 'id, name, sortOrder',
});

// Shopping entries are independent contributions, preserving recipe source snapshots.
db.version(3).stores({
  shoppingItems: 'id, createdAt',
});
