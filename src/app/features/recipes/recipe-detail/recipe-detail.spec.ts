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

describe('mobile recipe sections', () => {
  beforeEach(() => {
    localStorage.clear();
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
        { provide: StepTimerService, useValue: {} },
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
});
