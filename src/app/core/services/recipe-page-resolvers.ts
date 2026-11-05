import { inject } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { RecipeService } from './recipe.service';
import { RecipeImagesService } from './recipe-images.service';
import { LibraryViewService } from './library-view.service';
import { msg } from '../i18n/i18n';
import { parseSharedKey, SharingService, type SharedRecipe } from './sharing.service';
import { SupabaseService } from './supabase.service';

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
  /** Set on a shared recipe's page: who shared it and how it is shared. */
  shared?: SharedRecipe;
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
      error: msg('Could not load your recipes.'),
    };
  }
};

export const resolveRecipePage: ResolveFn<RecipePageData | RedirectCommand | undefined> = async (
  route,
) => {
  const recipes = inject(RecipeService);
  const images = inject(RecipeImagesService);
  const router = inject(Router);
  const accountVersion = recipes.accountVersion();
  const revision = recipes.revision();
  const id = route.paramMap.get('id');
  if (!id) return undefined;
  // Timer toasts and notifications name a shared recipe by its key; it lives on its own page.
  const shared = parseSharedKey(id);
  if (shared)
    return new RedirectCommand(router.createUrlTree(['/shared', shared.owner, shared.id]));
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
      error: msg('Could not load this recipe.'),
    };
  }
};

// A shared recipe comes from its owner's cookbook over the network; your own opens as your own.
export const resolveSharedRecipePage: ResolveFn<
  RecipePageData | RedirectCommand | undefined
> = async (route) => {
  const recipes = inject(RecipeService);
  const sharing = inject(SharingService);
  const auth = inject(SupabaseService);
  const router = inject(Router);
  const owner = route.paramMap.get('owner');
  const id = route.paramMap.get('id');
  if (!owner || !id) return undefined;
  await auth.initialize();
  if (auth.user()?.id === owner) return new RedirectCommand(router.createUrlTree(['/recipes', id]));
  const accountVersion = recipes.accountVersion();
  const revision = recipes.revision();
  const page = { collections: [], accountVersion, revision };
  try {
    const shared = await sharing.open(owner, id);
    if (!shared)
      return { ...page, recipe: undefined, error: msg('This recipe is no longer shared.') };
    return { ...page, recipe: shared.recipe, error: '', shared };
  } catch (error) {
    return {
      ...page,
      recipe: undefined,
      error: error instanceof Error ? error.message : msg('Could not load this recipe.'),
    };
  }
};
