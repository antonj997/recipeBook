import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../models/recipe.model';
import { LibraryViewService } from './library-view.service';
import { RecipeImagesService } from './recipe-images.service';
import { resolveLibraryPage, resolveRecipePage } from './recipe-page-resolvers';
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
