import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { PageTransitionPreferencesService } from './page-transition-preferences.service';
import { RecipeService } from './recipe.service';

export interface LibraryPageData {
  recipes: Recipe[];
  collections: RecipeCollection[];
  accountVersion: number;
  revision: number;
  error: string;
}
export interface RecipePageData {
  recipe: Recipe | undefined;
  collections: RecipeCollection[];
  accountVersion: number;
  revision: number;
  error: string;
}

// Resolve local data before the browser captures the destination. No network wait or DOM copy.
export const resolveLibraryPage: ResolveFn<LibraryPageData | undefined> = async () => {
  if (inject(PageTransitionPreferencesService).mode() !== 'expand') return undefined;
  const recipes = inject(RecipeService);
  const accountVersion = recipes.accountVersion();
  const revision = recipes.revision();
  try {
    const [items, collections] = await Promise.all([
      recipes.getRecipes(),
      recipes.getCollections(),
    ]);
    if (accountVersion !== recipes.accountVersion()) return undefined;
    return { recipes: items, collections, accountVersion, revision, error: '' };
  } catch {
    return {
      recipes: [],
      collections: [],
      accountVersion,
      revision,
      error: 'Could not load your recipes.',
    };
  }
};

export const resolveRecipePage: ResolveFn<RecipePageData | undefined> = async (route) => {
  if (inject(PageTransitionPreferencesService).mode() !== 'expand') return undefined;
  const recipes = inject(RecipeService);
  const accountVersion = recipes.accountVersion();
  const revision = recipes.revision();
  const id = route.paramMap.get('id');
  if (!id) return undefined;
  try {
    const [recipe, collections] = await Promise.all([
      recipes.getRecipe(id),
      recipes.getCollections(),
    ]);
    if (accountVersion !== recipes.accountVersion()) return undefined;
    return { recipe, collections, accountVersion, revision, error: '' };
  } catch {
    return {
      recipe: undefined,
      collections: [],
      accountVersion,
      revision,
      error: 'Could not load this recipe.',
    };
  }
};
