import { BehaviorSubject } from 'rxjs';
import { PageTransitionService } from '../../../core/services/page-transition.service';
import { recipeStepTimers, type StepTimerTarget } from '../../../core/models/step-timer';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeDetailComponent } from './recipe-detail';
import { RecipeService } from '../../../core/services/recipe.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { StepTimerService } from '../../../core/services/step-timer.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { CookingSessionService } from '../../../core/services/cooking-session.service';

describe('recipe detail', () => {
  const stepToReveal = signal<StepTimerTarget | null>(null);
  let routeData = new BehaviorSubject({});
  beforeEach(() => {
    localStorage.clear();
    stepToReveal.set(null);
    routeData = new BehaviorSubject({});
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
            data: routeData,
            snapshot: {
              paramMap: convertToParamMap({ id: 'tab-test' }),
              data: {
                recipePage: {
                  accountVersion: 0,
                  revision: 0,
                  recipe: {
                    id: 'tab-test',
                    title: 'Recipe section test',
                    servings: 4,
                    ingredients: ['Salt'],
                    instructions: ['Season and serve.'],
                  },
                  collections: [],
                },
              },
            },
          },
        },
        { provide: RecipeService, useValue: { accountVersion: signal(0), revision: signal(0) } },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'section-tests', user: signal(null), accountVersion: signal(0) },
        },
        {
          provide: StepTimerService,
          useValue: {
            stepToReveal,
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
        { provide: FeedbackService, useValue: {} },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    localStorage.clear();
  });
  async function fixture() {
    const host = TestBed.createComponent(RecipeDetailComponent);
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    const tabs = host.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
    const ingredients = host.nativeElement.querySelector('#ingredients-panel') as HTMLElement;
    const instructions = host.nativeElement.querySelector('#instructions-panel') as HTMLElement;
    return { host, tabs, ingredients, instructions };
  }

  it('keeps tab selection independent of an unavailable JavaScript animation engine', async () => {
    const f = await fixture();
    // CSS owns indicator movement. A platform animation failure must not block reading.
    const indicator = f.tabs.querySelector('.tab-indicator') as HTMLElement;
    indicator.animate = () => {
      throw new Error('JavaScript animation unavailable');
    };
    expect(() => f.host.componentInstance.switchSection('instructions')).not.toThrow();
    f.host.detectChanges();
    expect(f.tabs.querySelector('#recipe-instructions-tab')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(f.instructions.classList.contains('inactive-panel')).toBe(false);
    expect(f.ingredients.hasAttribute('inert')).toBe(true);
  });

  it('retains cooking state while reversing tabs before motion has finished', async () => {
    const f = await fixture();
    const component = f.host.componentInstance;
    component.changeServings('6');
    component.toggleStep(0);
    component.switchSection('instructions');
    f.host.detectChanges();
    component.switchSection('ingredients');
    f.host.detectChanges();
    expect(f.ingredients.classList.contains('inactive-panel')).toBe(false);
    expect(f.instructions.hasAttribute('inert')).toBe(true);
    expect(component.selectedServings()).toBe(6);
    expect(component.completedSteps().has(0)).toBe(true);
    expect(TestBed.inject(CookingSessionService).read('tab-test')).toMatchObject({
      section: 'ingredients',
      servings: 6,
      completed: [{ index: 0 }],
    });
  });

  it('moves keyboard focus with the selected tab and exposes its panel', async () => {
    const f = await fixture();
    f.tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    f.host.detectChanges();
    expect(document.activeElement?.id).toBe('recipe-instructions-tab');
    expect(f.instructions.getAttribute('aria-hidden')).toBe(null);
    expect(f.ingredients.getAttribute('aria-hidden')).toBe('true');
    f.tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    f.host.detectChanges();
    expect(document.activeElement?.id).toBe('recipe-ingredients-tab');
    expect(f.ingredients.getAttribute('aria-hidden')).toBe(null);
  });

  it('opens Instructions and reveals the timed step after page motion finishes', async () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data['recipePage'].recipe.instructions = ['Rest for 1 minute.'];
    const target = recipeStepTimers(route.snapshot.data['recipePage'].recipe)[0]!;
    const f = await fixture();
    const step = f.host.nativeElement.querySelector('.cooking-step') as HTMLElement;
    step.scrollIntoView = vi.fn();
    const motion = TestBed.inject(PageTransitionService);
    motion.phase.set('opening');
    stepToReveal.set(target);
    f.host.detectChanges();
    await f.host.whenStable();
    expect(f.host.componentInstance.activeSection()).toBe('instructions');
    expect(step.scrollIntoView).not.toHaveBeenCalled();
    motion.phase.set('idle');
    f.host.detectChanges();
    await f.host.whenStable();
    expect(step.id).toBe('recipe-step-1');
    expect(step.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(step);
    expect(stepToReveal()).toBeNull();
  });
  it('loads the target recipe when the router reuses the recipe screen', async () => {
    const f = await fixture();
    const route = TestBed.inject(ActivatedRoute);
    const next = {
      id: 'other-recipe',
      title: 'Another recipe',
      servings: 2,
      ingredients: ['Pepper'],
      instructions: ['Season with pepper.'],
    };
    Object.defineProperty(route.snapshot, 'paramMap', {
      value: convertToParamMap({ id: next.id }),
    });
    route.snapshot.data['recipePage'] = {
      accountVersion: 0,
      revision: 0,
      recipe: next,
      collections: [],
    };
    routeData.next(route.snapshot.data);
    await f.host.whenStable();
    f.host.detectChanges();
    expect(f.host.componentInstance.recipe()?.id).toBe(next.id);
    expect(f.host.nativeElement.textContent).toContain('Season with pepper.');
  });
  it('does not overwrite the destination categories with a late previous-recipe read', async () => {
    let finishCollections!: (value: { id: string; name: string }[]) => void;
    const route = TestBed.inject(ActivatedRoute);
    const oldRecipe = {
      ...route.snapshot.data['recipePage'].recipe,
      collectionIds: ['old-category'],
    };
    const getCollections = vi.fn(
      () =>
        new Promise<{ id: string; name: string }[]>((resolve) => {
          finishCollections = resolve;
        }),
    );
    Object.assign(TestBed.inject(RecipeService), {
      getRecipe: async () => oldRecipe,
      getCollections,
    });
    const f = await fixture();
    route.snapshot.data['recipePage'] = undefined;
    routeData.next({});
    await Promise.resolve();
    await Promise.resolve();
    expect(getCollections).toHaveBeenCalled();
    const next = { ...oldRecipe, id: 'new-recipe', collectionIds: ['new-category'] };
    Object.defineProperty(route.snapshot, 'paramMap', {
      value: convertToParamMap({ id: next.id }),
    });
    route.snapshot.data['recipePage'] = {
      accountVersion: 0,
      revision: 0,
      recipe: next,
      collections: [{ id: 'new-category', name: 'New category' }],
    };
    routeData.next(route.snapshot.data);
    finishCollections([{ id: 'old-category', name: 'Old category' }]);
    await f.host.whenStable();
    expect(f.host.componentInstance.recipe()?.id).toBe('new-recipe');
    expect(f.host.componentInstance.collectionNames()).toEqual(['New category']);
  });
  it('does not leave the previous recipe visible if the target recipe fails to load', async () => {
    const f = await fixture(),
      route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'paramMap', {
      value: convertToParamMap({ id: 'unavailable' }),
    });
    route.snapshot.data['recipePage'] = {
      accountVersion: 0,
      revision: 0,
      error: 'Could not load this recipe.',
      collections: [],
    };
    routeData.next(route.snapshot.data);
    await f.host.whenStable();
    f.host.detectChanges();
    expect(f.host.componentInstance.recipe()).toBeUndefined();
    expect(f.host.nativeElement.textContent).toContain('Could not load this recipe.');
    expect(f.host.nativeElement.textContent).not.toContain('Season and serve.');
  });
  it('ignores a reveal request for a step that has since changed', async () => {
    const f = await fixture();
    stepToReveal.set({ recipeId: 'tab-test', key: 'old-step', index: 0, seconds: 60 });
    await f.host.whenStable();
    f.host.detectChanges();
    expect(f.host.componentInstance.activeSection()).toBe('ingredients');
  });
  it('gives an unavailable recipe a heading and a way back to the library', async () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data['recipePage'].recipe = undefined;
    const f = await fixture();
    const heading = f.host.nativeElement.querySelector('h1') as HTMLElement | null;
    const back = [...f.host.nativeElement.querySelectorAll('a')].find(
      (link) => (link as HTMLAnchorElement).textContent?.trim() === 'Back to recipes',
    ) as HTMLAnchorElement | undefined;

    expect(heading?.textContent?.trim()).toBeTruthy();
    expect(back?.getAttribute('href')).toBe('/');
    expect(f.host.nativeElement.textContent).toContain('This recipe is no longer available.');
  });

  it('keeps a load error visible beside the recovery action', async () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.data['recipePage'].error = 'Could not read your recipes. Try again when online.';
    const f = await fixture();
    const alert = f.host.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    const heading = f.host.nativeElement.querySelector('h1') as HTMLElement | null;
    const back = [...f.host.nativeElement.querySelectorAll('a')].find(
      (link) => (link as HTMLAnchorElement).textContent?.trim() === 'Back to recipes',
    ) as HTMLAnchorElement | undefined;

    expect(alert?.textContent?.trim()).toBe('Could not read your recipes. Try again when online.');
    expect(heading?.textContent?.trim()).toBeTruthy();
    expect(back?.getAttribute('href')).toBe('/');
  });

  it('offers the same recovery when the recipe route has no identifier', async () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'paramMap', { value: convertToParamMap({}) });
    const f = await fixture();
    const heading = f.host.nativeElement.querySelector('h1') as HTMLElement | null;
    const back = [...f.host.nativeElement.querySelectorAll('a')].find(
      (link) => (link as HTMLAnchorElement).textContent?.trim() === 'Back to recipes',
    ) as HTMLAnchorElement | undefined;

    expect(heading?.textContent?.trim()).toBeTruthy();
    expect(back?.getAttribute('href')).toBe('/');
  });
});
