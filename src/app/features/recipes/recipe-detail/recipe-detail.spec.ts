import { PageAppearanceService } from '../../../core/services/page-appearance.service';
import { CloudCookbookService } from '../../../core/services/cloud-cookbook.service';
import { TimerPushService } from '../../../core/services/timer-push.service';
import { BehaviorSubject } from 'rxjs';
import { PageTransitionService } from '../../../core/services/page-transition.service';
import { recipeStepTimers, type StepTimerTarget } from '../../../core/models/step-timer';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeDetailComponent } from './recipe-detail';
import { RecipeService } from '../../../core/services/recipe.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { StepTimerService } from '../../../core/services/step-timer.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { CookingSessionService } from '../../../core/services/cooking-session.service';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { StorageDurabilityService } from '../../../core/services/storage-durability.service';

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
        { provide: FeedbackService, useFactory: () => new FeedbackService() },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  async function timerFixture(
    instructions = [
      'Cook for 2 minutes.',
      'Rest for 3 minutes.',
      'Bake for 4 minutes.',
      'Wait for 1 second.',
      'Serve.',
    ],
  ) {
    const recipe = {
      id: 'tab-test',
      title: 'Recipe section test',
      servings: 4,
      ingredients: ['Salt'],
      instructions,
    };
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        data: routeData,
        snapshot: {
          paramMap: convertToParamMap({ id: recipe.id }),
          data: {
            recipePage: { accountVersion: 0, revision: 0, recipe, collections: [] },
          },
        },
      },
    });
    const other = { ...recipe, id: 'another-recipe' };
    const push = {
      enabled: signal(false),
      replaceTimers: vi.fn(),
      retry: vi.fn(),
      status: signal('off'),
      message: signal(''),
      busy: signal(false),
      canEnable: signal(false),
    };
    TestBed.overrideProvider(StepTimerService, { useFactory: () => new StepTimerService() });
    TestBed.overrideProvider(FeedbackService, { useFactory: () => new FeedbackService() });
    TestBed.overrideProvider(TimerPushService, { useValue: push });
    TestBed.overrideProvider(CloudCookbookService, {
      useValue: {
        revision: signal(0),
        database: {
          recipes: {
            bulkGet: async (ids: string[]) => ids.map((id) => (id === recipe.id ? recipe : other)),
          },
        },
      },
    });
    const f = await fixture();
    return {
      ...f,
      recipe,
      other,
      push,
      timers: TestBed.inject(StepTimerService),
      targets: recipeStepTimers(recipe),
    };
  }

  it('places servings before the shopping action in normal reading', async () => {
    const f = await fixture();
    const tools = f.host.nativeElement.querySelector('.ingredients-tools') as HTMLElement;
    expect(tools.firstElementChild?.tagName.toLowerCase()).toBe('app-select-menu');
    expect(tools.lastElementChild?.textContent).toContain('Add to shopping list');
  });

  async function openFocus(f: Awaited<ReturnType<typeof fixture>>, beforeRender?: () => void) {
    if (!HTMLDialogElement.prototype.showModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value() {},
      });
    if (!HTMLDialogElement.prototype.close)
      Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true,
        value() {},
      });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const button = f.host.nativeElement.querySelector('.focus-mode-button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.focus();
    button.click();
    beforeRender?.();
    f.host.detectChanges();
    await f.host.whenStable();
    f.host.detectChanges();
    return f.host.nativeElement.querySelector('dialog.recipe-focus') as HTMLDialogElement;
  }

  it('shows one copy of both sections in focus and hides shopping and tabs', async () => {
    const f = await fixture();
    const dialog = await openFocus(f);
    expect(dialog.open).toBe(true);
    expect(TestBed.inject(PageAppearanceService).browserColor()).toBe('#faf9f5');
    expect(dialog.getAttribute('aria-label')).toBe('Recipe section test');
    expect(dialog.querySelector('header h2')).toBeNull();
    expect(dialog.querySelector('header')?.textContent?.trim()).toBe('');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(f.host.nativeElement.querySelectorAll('#ingredients-panel')).toHaveLength(1);
    expect(f.host.nativeElement.querySelectorAll('#instructions-panel')).toHaveLength(1);
    expect(dialog.querySelector('[role="tablist"]')).toBeNull();
    expect(dialog.querySelector('.recipe-shopping-button')).toBeNull();
    for (const id of ['ingredients-panel', 'instructions-panel']) {
      const panel = dialog.querySelector('#' + id)!;
      expect(panel.getAttribute('role')).toBe('region');
      expect(panel.getAttribute('tabindex')).toBe('0');
      expect(panel.hasAttribute('inert')).toBe(false);
    }
  });

  it('preserves servings, checkmarks, running clocks and the selected tab on focus exit', async () => {
    const f = await timerFixture();
    const c = f.host.componentInstance;
    c.switchSection('instructions');
    c.changeServings('6');
    c.toggleStep(4);
    f.timers.start(f.targets[0]!);
    const before = f.timers.state(f.targets[0]!);
    const dialog = await openFocus(f);
    (dialog.querySelector('[aria-label="Increase servings"]') as HTMLButtonElement).click();
    f.host.detectChanges();
    expect(c.selectedServings()).toBe(8);
    (dialog.querySelector('[aria-label="Exit focus mode"]') as HTMLButtonElement).click();
    f.host.detectChanges();
    await f.host.whenStable();
    expect(f.host.nativeElement.querySelector('dialog.recipe-focus')).toBeNull();
    expect(c.activeSection()).toBe('instructions');
    expect(c.completedSteps().has(4)).toBe(true);
    expect(c.selectedServings()).toBe(8);
    expect(f.timers.state(f.targets[0]!)).toMatchObject({
      running: true,
      duration: before.duration,
    });
    expect(document.activeElement?.classList.contains('focus-mode-button')).toBe(true);
    expect(f.host.nativeElement.querySelectorAll('#instructions-panel')).toHaveLength(1);
    expect(document.body.style.position).not.toBe('fixed');
    expect(TestBed.inject(PageAppearanceService).browserColor()).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes focus and restores body styles when the account changes', async () => {
    const f = await fixture();
    document.body.style.overflow = 'clip';
    await openFocus(f);
    expect(document.body.style.position).toBe('fixed');
    (TestBed.inject(RecipeService).accountVersion as ReturnType<typeof signal<number>>).set(1);
    f.host.detectChanges();
    await f.host.whenStable();
    f.host.detectChanges();
    expect(f.host.nativeElement.querySelector('dialog.recipe-focus')).toBeNull();
    expect(document.body.style.overflow).toBe('clip');
    expect(TestBed.inject(PageAppearanceService).browserColor()).toBeNull();
    expect(document.body.style.position).toBe('');
    document.body.style.overflow = '';
  });

  it('restores the ordinary page when the focus dialog is cancelled', async () => {
    const f = await fixture();
    const dialog = await openFocus(f);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    f.host.detectChanges();
    expect(cancel.defaultPrevented).toBe(true);
    expect(f.host.nativeElement.querySelector('dialog.recipe-focus')).toBeNull();
    expect(f.host.nativeElement.querySelector('[role="tablist"]')).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('closes focus when another recipe is loaded in the same component', async () => {
    const f = await fixture();
    await openFocus(f);
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'paramMap', {
      value: convertToParamMap({ id: 'next-recipe' }),
    });
    route.snapshot.data['recipePage'] = {
      accountVersion: 0,
      revision: 0,
      recipe: {
        id: 'next-recipe',
        title: 'Another recipe',
        servings: 2,
        ingredients: ['Salt'],
        instructions: ['Serve.'],
      },
      collections: [],
    };
    routeData.next(route.snapshot.data);
    await f.host.whenStable();
    f.host.detectChanges();
    expect(f.host.nativeElement.querySelector('dialog.recipe-focus')).toBeNull();
    expect(document.body.style.position).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(f.host.componentInstance.recipe()?.id).toBe('next-recipe');
  });

  it('captures scroll before the reading template moves and restores that exact position', async () => {
    const f = await fixture();
    let pageY = 420;
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => pageY);
    const reading = f.host.nativeElement.querySelector('.recipe-reading') as HTMLElement;
    vi.spyOn(reading, 'getBoundingClientRect').mockReturnValue({ height: 2000 } as DOMRect);
    const dialog = await openFocus(f, () => {
      pageY = 80;
    });
    expect(document.body.style.top).toBe('-420px');
    expect(reading.style.minHeight).toBe('2000px');
    (dialog.querySelector('[aria-label="Exit focus mode"]') as HTMLButtonElement).click();
    f.host.detectChanges();
    expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 420, behavior: 'instant' });
    expect(reading.style.minHeight).toBe('');
  });

  it('keeps timer-finished feedback and its View step action inside focus', async () => {
    const f = await timerFixture();
    const dialog = await openFocus(f);
    vi.useFakeTimers();
    f.timers.setDuration(f.targets[0]!, 1);
    f.timers.start(f.targets[0]!);
    await vi.advanceTimersByTimeAsync(1200);
    f.host.detectChanges();
    const toast = dialog.querySelector('.toast') as HTMLElement;
    expect(toast?.textContent).toContain('Step 1');
    const step = dialog.querySelector('#recipe-step-1') as HTMLElement;
    step.scrollIntoView = vi.fn();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const action = toast.querySelector('.undo-action') as HTMLButtonElement;
    expect(action.textContent).toContain('View step');
    action.click();
    await Promise.resolve();
    await Promise.resolve();
    f.host.detectChanges();
    expect(step.scrollIntoView).toHaveBeenCalled();
  });

  it('allows the instructions reset when only a timer has changed, then restores its preset', async () => {
    const f = await timerFixture();
    const reset = f.host.nativeElement.querySelector('.reset-instructions') as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    f.timers.start(f.targets[0]!);
    f.host.detectChanges();
    expect(f.host.componentInstance.completedSteps().size).toBe(0);
    expect(reset.disabled).toBe(false);
    reset.click();
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!)).toMatchObject({ remaining: 120, started: false });
    expect(reset.disabled).toBe(true);
    f.timers.setDuration(f.targets[1]!, 0);
    f.host.detectChanges();
    expect(reset.disabled).toBe(false);
    reset.click();
    f.host.detectChanges();
    expect(f.timers.state(f.targets[1]!).remaining).toBe(180);
    expect(reset.disabled).toBe(true);
  });

  it('pauses a running clock when its step is checked and keeps the time left', async () => {
    const f = await timerFixture();
    vi.useFakeTimers();
    const component = f.host.componentInstance;
    component.switchSection('instructions');
    f.timers.start(f.targets[0]!);
    await vi.advanceTimersByTimeAsync(30_000);
    component.toggleStep(0);
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!)).toMatchObject({
      running: false,
      paused: true,
      started: true,
      remaining: 90,
    });
    // Background alerts are scheduled only for timers with a deadline.
    expect(
      f.push.replaceTimers.mock.lastCall![0].some(
        (timer: { deadline?: number }) => timer.deadline !== undefined,
      ),
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    component.toggleStep(0);
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!)).toMatchObject({ paused: true, remaining: 90 });
  });

  it('resets checked steps and all recipe clocks together without clearing another recipe', async () => {
    const f = await timerFixture();
    vi.useFakeTimers();
    const other = recipeStepTimers(f.other)[0]!;
    f.timers.start(f.targets[0]!);
    f.timers.start(f.targets[1]!);
    f.timers.pause(f.targets[1]!);
    f.timers.adjust(f.targets[1]!, -1);
    f.timers.setDuration(f.targets[2]!, 300);
    f.timers.start(f.targets[3]!);
    f.timers.start(other);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.timers.state(f.targets[3]!).done).toBe(true);
    const otherBefore = f.timers.state(other);
    const component = f.host.componentInstance;
    component.changeServings('6');
    component.switchSection('instructions');
    component.toggleStep(4);
    f.host.detectChanges();
    (f.host.nativeElement.querySelector('.reset-instructions') as HTMLButtonElement).click();
    f.host.detectChanges();
    expect(component.completedSteps().size).toBe(0);
    for (const target of f.targets) {
      if (target)
        expect(f.timers.state(target)).toMatchObject({
          remaining: target.seconds,
          duration: target.seconds,
          started: false,
          running: false,
          paused: false,
          done: false,
          elapsed: 0,
        });
    }
    expect(f.timers.state(other)).toEqual(otherBefore);
    expect(f.push.replaceTimers).toHaveBeenLastCalledWith([
      { target: other, deadline: expect.any(Number) },
    ]);
    expect(TestBed.inject(CookingSessionService).read(f.recipe.id)).toMatchObject({
      completed: [],
      section: 'instructions',
      servings: 6,
    });
  });

  it('stops ruler momentum when the instructions reset is activated without a pointer press', async () => {
    const f = await timerFixture();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const slider = f.host.nativeElement.querySelector('.minute-ruler') as HTMLElement;
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 360 } as DOMRect);
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: 20,
      });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
        isPrimary: { value: true },
      });
      (type === 'pointerdown' ? slider : document).dispatchEvent(event);
    };
    pointer('pointerdown', 180);
    await vi.advanceTimersByTimeAsync(40);
    pointer('pointermove', 60);
    await vi.advanceTimersByTimeAsync(20);
    pointer('pointerup', 60);
    await vi.advanceTimersByTimeAsync(100);
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!).remaining).not.toBe(120);
    const reset = f.host.nativeElement.querySelector('.reset-instructions') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    reset.focus();
    reset.click();
    f.host.detectChanges();
    await vi.advanceTimersByTimeAsync(1200);
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!)).toMatchObject({ remaining: 120, started: false });
    expect(reset.disabled).toBe(true);
  });

  it('treats a capped long timer as pristine and does not offer reset until it changes', async () => {
    const f = await timerFixture(['Cook for 120 minutes.']);
    const reset = f.host.nativeElement.querySelector('.reset-instructions') as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    f.timers.setDuration(f.targets[0]!, 300);
    f.host.detectChanges();
    expect(reset.disabled).toBe(false);
    reset.click();
    f.host.detectChanges();
    expect(f.timers.state(f.targets[0]!).remaining).toBe(3600);
    expect(reset.disabled).toBe(true);
    f.host.componentInstance.toggleStep(0);
    f.host.detectChanges();
    expect(f.host.componentInstance.completedSteps().has(0)).toBe(true);
  });

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
  it('tells a signed-out browser-tab user once where a saved recipe lives', async () => {
    const draft = {
      id: 'draft',
      title: 'Draft soup',
      servings: 4,
      ingredients: ['Water'],
      instructions: ['Boil.'],
    };
    const durability = {
      ensurePersisted: vi.fn(async () => false),
      shouldNudge: vi.fn(() => true),
      markNudged: vi.fn(),
    };
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        data: routeData,
        snapshot: { paramMap: convertToParamMap({}), data: { draft: true } },
      },
    });
    TestBed.overrideProvider(RecipeDraftService, {
      useValue: { getOrCreate: () => draft, clear: vi.fn(), photoNotice: signal('') },
    });
    TestBed.overrideProvider(RecipeService, {
      useValue: {
        accountVersion: signal(0),
        revision: signal(0),
        getCollections: async () => [],
        addRecipe: async () => ({ ...draft, id: 'saved' }),
      },
    });
    TestBed.overrideProvider(StorageDurabilityService, { useValue: durability });
    const { host } = await fixture();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await host.componentInstance.saveDraft();
    const feedback = TestBed.inject(FeedbackService);
    expect(feedback.message()).toBe(
      'Recipe saved on this device. Install Recipebook or sign in so the browser keeps it.',
    );
    expect(feedback.action()?.label).toBe('Show how');
    expect(durability.markNudged).toHaveBeenCalledTimes(1);
  });
});
