import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { convertToParamMap, provideRouter, RedirectCommand, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../models/recipe.model';
import { LibraryViewService } from './library-view.service';
import { RecipeImagesService } from './recipe-images.service';
import {
  resolveLibraryPage,
  resolveRecipePage,
  resolveSharedRecipePage,
  type RecipePageData,
} from './recipe-page-resolvers';
import { SharingService, sharedRecipeKey } from './sharing.service';
import { SupabaseService } from './supabase.service';
import { RecipeService } from './recipe.service';

const recipe = (index: number): Recipe => ({
  id: 'r' + index,
  title: 'Recipe ' + String(index).padStart(2, '0'),
  ingredients: [],
  instructions: [],
  photoId: String(index).padStart(64, '0'),
});

describe('page resolvers', () => {
  const recipes = Array.from({ length: 40 }, (_, index) => recipe(index));
  let prepare: ReturnType<typeof vi.fn>;
  let restored = '';
  beforeEach(() => {
    prepare = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RecipeService,
          useValue: {
            accountVersion: signal(0),
            revision: signal(0),
            getRecipes: async () => recipes,
            getRecipe: async (id: string) => recipes.find((item) => item.id === id),
            getCollections: async () => [],
          },
        },
        { provide: RecipeImagesService, useValue: { prepare } },
        { provide: LibraryViewService, useValue: { read: () => ({ recipeId: restored }) } },
        provideRouter([]),
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  const run = <T>(
    resolver: (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => T,
    id = '',
  ) =>
    TestBed.runInInjectionContext(() =>
      resolver(
        { paramMap: convertToParamMap(id ? { id } : {}) } as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    );

  it('sends a shared recipe key to the shared page', async () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const result = await run(resolveRecipePage, sharedRecipeKey(owner, 'abc'));
    expect(result).toBeInstanceOf(RedirectCommand);
    expect(TestBed.inject(Router).serializeUrl((result as RedirectCommand).redirectTo)).toBe(
      `/shared/${owner}/abc`,
    );
  });

  it('prepares the library photos around the remembered recipe before showing the library', async () => {
    restored = 'r30';
    await run(resolveLibraryPage);
    const ids = (prepare.mock.calls[0][0] as Recipe[]).map((item) => item.id);
    expect(prepare.mock.calls[0][1]).toBe('thumb');
    expect(ids).toEqual(expect.arrayContaining(['r0', 'r11', 'r26', 'r30', 'r34']));
    expect(ids).not.toContain('r20');
  });

  it('prepares the cover photo before a recipe page is captured', async () => {
    await run(resolveRecipePage, 'r5');
    expect(prepare).toHaveBeenCalledWith([recipes[5]], 'full');
  });
});

describe('shared recipe resolver', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const user = signal<{ id: string } | null>(null);
  const open = vi.fn();
  beforeEach(() => {
    user.set(null);
    open.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RecipeService, useValue: { accountVersion: signal(0), revision: signal(0) } },
        { provide: SupabaseService, useValue: { user, initialize: async () => undefined } },
        { provide: SharingService, useValue: { open } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  const resolve = (id = 'abc') =>
    TestBed.runInInjectionContext(() =>
      resolveSharedRecipePage(
        { paramMap: convertToParamMap({ owner, id }) } as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot,
      ),
    ) as Promise<RecipePageData | RedirectCommand>;

  it('resolves the shared recipe without categories', async () => {
    const recipe = {
      id: sharedRecipeKey(owner, 'abc'),
      title: 'Soup',
      ingredients: [],
      instructions: [],
    };
    open.mockResolvedValue({ owner, id: 'abc', recipe, author: 'anna', missingPhotos: 0 });
    const data = (await resolve()) as RecipePageData;
    expect(open).toHaveBeenCalledWith(owner, 'abc');
    expect(data.recipe).toBe(recipe);
    expect(data.collections).toEqual([]);
    expect(data.shared?.author).toBe('anna');
    expect(data.error).toBe('');
  });

  it('says a recipe that is no longer shared is gone', async () => {
    open.mockResolvedValue(null);
    const data = (await resolve()) as RecipePageData;
    expect(data.recipe).toBeUndefined();
    expect(data.error).toBe('This recipe is no longer shared.');
  });

  it('sends the owner to their own recipe', async () => {
    user.set({ id: owner });
    const result = await resolve();
    expect(result).toBeInstanceOf(RedirectCommand);
    expect(TestBed.inject(Router).serializeUrl((result as RedirectCommand).redirectTo)).toBe(
      '/recipes/abc',
    );
    expect(open).not.toHaveBeenCalled();
  });
});
