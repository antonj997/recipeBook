import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepTimerTarget } from '../../../core/models/step-timer';
import { BasketService } from '../../../core/services/basket.service';
import { CookingSessionService } from '../../../core/services/cooking-session.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { RecipeService } from '../../../core/services/recipe.service';
import {
  sharedRecipeKey,
  SharingService,
  type SharedRecipe,
} from '../../../core/services/sharing.service';
import { ShoppingListService } from '../../../core/services/shopping-list.service';
import { StepTimerService } from '../../../core/services/step-timer.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { RecipeDetailComponent } from './recipe-detail';

const owner = '11111111-1111-4111-8111-111111111111';

describe('shared recipe page', () => {
  let shared: SharedRecipe;
  let sharing: {
    saveCopy: ReturnType<typeof vi.fn>;
    isAdmin: ReturnType<typeof vi.fn>;
    setHidden: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
  };
  let save: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    shared = {
      owner,
      id: 'abc',
      author: 'anna',
      visibility: 'public',
      missingPhotos: 0,
      recipe: {
        id: sharedRecipeKey(owner, 'abc'),
        title: 'Shared soup',
        servings: 2,
        ingredients: ['1 onion'],
        instructions: ['Boil.'],
      },
    };
    sharing = {
      saveCopy: vi.fn(async () => ({ ...shared.recipe, id: 'copy' })),
      isAdmin: vi.fn(async () => false),
      setHidden: vi.fn(async () => undefined),
      open: vi.fn(async () => shared),
    };
    save = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            data: new BehaviorSubject({}),
            snapshot: {
              paramMap: convertToParamMap({ owner, id: 'abc' }),
              data: {
                shared: true,
                recipePage: {
                  accountVersion: 0,
                  revision: 0,
                  recipe: shared.recipe,
                  collections: [],
                  error: '',
                  shared,
                },
              },
            },
          },
        },
        { provide: RecipeService, useValue: { accountVersion: signal(0), revision: signal(1) } },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'shared-tests', user: signal(null), accountVersion: signal(0) },
        },
        { provide: SharingService, useValue: sharing },
        {
          provide: CookingSessionService,
          useValue: { read: () => null, save, clear: vi.fn() },
        },
        {
          provide: StepTimerService,
          useValue: {
            stepToReveal: signal<StepTimerTarget | null>(null),
            state: (target: StepTimerTarget) => ({
              remaining: target.seconds,
              duration: target.seconds,
              running: false,
              paused: false,
              started: false,
              done: false,
              elapsed: 0,
            }),
          },
        },
        { provide: FeedbackService, useFactory: () => new FeedbackService() },
        {
          provide: ShoppingListService,
          useValue: { addRecipe: vi.fn(async () => 1), accountVersion: signal(0) },
        },
        { provide: BasketService, useValue: { flyFrom: vi.fn(async () => undefined) } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function render() {
    const host = TestBed.createComponent(RecipeDetailComponent);
    host.detectChanges();
    await host.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    host.detectChanges();
    const root = host.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      );
    return { host, root, button };
  }

  it('shows who shared it and no options of the owner', async () => {
    const { root } = await render();
    expect(root.querySelector('h1')?.textContent?.replace(/\s+/g, ' ')).toContain('Shared soup');
    expect(root.querySelector('.shared-author')?.textContent?.trim()).toBe('by @anna');
    expect(root.querySelector('[aria-label="Recipe options"]')).toBeNull();
    // A sync revision never reloads a shared recipe from your own cookbook.
    expect(sharing.open).not.toHaveBeenCalled();
  });

  it('names an author without a username kindly', async () => {
    shared.author = null;
    const { root } = await render();
    expect(root.querySelector('.shared-author')?.textContent?.trim()).toBe('by a Recipebook cook');
  });

  it('saves your own copy once, then shows Saved', async () => {
    const { host, button } = await render();
    button('Save to my recipes')!.click();
    await host.whenStable();
    host.detectChanges();
    expect(sharing.saveCopy).toHaveBeenCalledTimes(1);
    expect(sharing.saveCopy).toHaveBeenCalledWith(shared);
    expect(button('Saved')?.disabled).toBe(true);
    expect(TestBed.inject(FeedbackService).message()).toBe('Saved');
  });

  it('says how many photos the copy is missing', async () => {
    shared.missingPhotos = 2;
    const { host, button } = await render();
    button('Save to my recipes')!.click();
    await host.whenStable();
    expect(TestBed.inject(FeedbackService).message()).toBe('Saved without 2 photos.');
  });

  it('keeps cooking progress under the shared key', async () => {
    const { host, root } = await render();
    root.querySelector<HTMLInputElement>('#ingredients-panel input[type=checkbox]')!.click();
    host.detectChanges();
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls.at(-1)![0]).toBe(sharedRecipeKey(owner, 'abc'));
  });

  it('offers admins Hide from Discover', async () => {
    let view = await render();
    expect(view.button('Hide from Discover')).toBeUndefined();
    view.host.destroy();
    sharing.isAdmin.mockResolvedValue(true);
    view = await render();
    view.button('Hide from Discover')!.click();
    await view.host.whenStable();
    view.host.detectChanges();
    expect(sharing.setHidden).toHaveBeenCalledWith(owner, 'abc', true);
    expect(view.button('Show in Discover')).toBeTruthy();
  });
});
