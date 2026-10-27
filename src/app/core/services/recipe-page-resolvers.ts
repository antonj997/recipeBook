import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { RecipeService } from './recipe.service';
import { RecipeImagesService } from './recipe-images.service';
import { LibraryViewService } from './library-view.service';

/** The first rows and the cards around the remembered recipe; the rest load after showing. */
export function libraryPhotoWindow<T extends { id: string }>(
  recipes: readonly T[],
  recipeId: string,
): T[] {
  const restored = recipes.findIndex((recipe) => recipe.id === recipeId);
  return recipes.filter(
    (_, index) => index < 12 || (restored >= 0 && Math.abs(index - restored) <= 4),
  );
}

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
  const recipes = inject(RecipeService);
  const images = inject(RecipeImagesService);
  const library = inject(LibraryViewService);
  const accountVersion = recipes.accountVersion();
  const revision = recipes.revision();
  try {
    const [items, collections] = await Promise.all([
      recipes.getRecipes(),
      recipes.getCollections(),
    ]);
    if (accountVersion !== recipes.accountVersion()) return undefined;
    await images.prepare(libraryPhotoWindow(items, library.read().recipeId), 'thumb');
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
  const recipes = inject(RecipeService);
  const images = inject(RecipeImagesService);
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
    // The cover is part of the shared transition; it must exist before the page is captured.
    if (recipe) await images.prepare([recipe], 'full');
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
