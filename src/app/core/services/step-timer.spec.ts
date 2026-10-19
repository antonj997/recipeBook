import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepTimerService, type StepTimerTarget } from './step-timer.service';
import { SupabaseService } from './supabase.service';
import { CloudCookbookService } from './cloud-cookbook.service';
import { recipeStepTimers } from '../models/step-timer';
import type { Recipe } from '../models/recipe.model';
import { FeedbackService } from './feedback.service';

describe('deadline-based step countdowns', () => {
  const user = signal<{ id: string } | null>(null);
  const version = signal(0);
  const recipe: Recipe = {
    id: 'recipe',
    title: 'Test',
    servings: 4,
    ingredients: ['Oil'],
    instructions: ['Cook for 2 minutes.'],
  };
  const target: StepTimerTarget = recipeStepTimers(recipe)[0]!;
  const revision = signal(0);
  const recipes = new Map<string, Recipe>();
  const cookbook = {
    revision,
    get database() {
      return { recipes: { bulkGet: async (ids: string[]) => ids.map((id) => recipes.get(id)) } };
    },
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T17:00:00Z'));
    localStorage.clear();
    user.set(null);
    version.set(0);
    revision.set(0);
    recipes.clear();
    recipes.set(recipe.id, recipe);
    TestBed.configureTestingModule({
      providers: [
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('counts from an absolute deadline when browser callbacks have been delayed', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    vi.setSystemTime(new Date('2026-10-18T17:01:30Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(timers.state(target).remaining).toBe(30);
    expect(timers.state(target).running).toBe(true);
  });
  it('pauses and resumes without losing the remaining duration', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(30_000);
    timers.pause(target);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(timers.state(target).remaining).toBe(90);
    expect(timers.state(target).running).toBe(false);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timers.state(target).remaining).toBe(80);
  });
  it('adds and subtracts exactly one minute on running and idle timers', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.adjust(target, 1);
    expect(timers.state(target).remaining).toBe(180);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(10_000);
    timers.adjust(target, -1);
    expect(timers.state(target).remaining).toBe(110);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timers.state(target).remaining).toBe(100);
  });
  it('finishes once and stops ticking instead of counting below zero', async () => {
    const timers = TestBed.inject(StepTimerService);
    const feedback = TestBed.inject(FeedbackService);
    const alert = vi.spyOn(feedback, 'show');
    timers.start({ ...target, seconds: 2 });
    TestBed.tick();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(timers.state(target)).toMatchObject({ remaining: 0, running: false, done: true });
    expect(alert).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it('reset returns to the recipe preset without modifying another step', () => {
    const timers = TestBed.inject(StepTimerService);
    const other = { ...target, key: 'step2', index: 1 };
    timers.start(other);
    timers.adjust(target, 1);
    timers.reset(target);
    expect(timers.state(target)).toEqual({
      remaining: 120,
      running: false,
      started: false,
      done: false,
    });
    expect(timers.state(other).running).toBe(true);
  });
  it('restores running deadlines after reloading the application', async () => {
    TestBed.inject(StepTimerService).start(target);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-18T17:00:40Z'));
    TestBed.configureTestingModule({
      providers: [
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
    expect(TestBed.inject(StepTimerService).state(target).remaining).toBe(80);
  });
  it('does not expose another signed-in user’s active countdowns', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    user.set({ id: 'friend' });
    version.update((v) => v + 1);
    TestBed.tick();
    expect(timers.state(target).running).toBe(false);
    timers.start(target);
    timers.adjust(target, 1);
    user.set(null);
    version.update((v) => v + 1);
    TestBed.tick();
    expect(timers.state(target).remaining).toBe(120);
  });
  it('drops obsolete timers when a step changes or its timer is removed', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    timers.reconcile('recipe', []);
    expect(timers.state(target).started).toBe(false);
  });
  it('removes timers for a deleted recipe without affecting other recipes', () => {
    const timers = TestBed.inject(StepTimerService);
    const other = { ...target, key: 'other:step1', recipeId: 'other' };
    timers.start(target);
    timers.start(other);
    timers.removeRecipe('recipe');
    expect(timers.state(target).running).toBe(false);
    expect(timers.state(other).running).toBe(true);
  });
  it('invalidates timers when synced steps change while the library is open', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    TestBed.tick();
    await Promise.resolve();
    recipes.set(recipe.id, { ...recipe, stepDetails: [{ timerSeconds: null }] });
    revision.update((v) => v + 1);
    TestBed.tick();
    await Promise.resolve();
    expect(timers.state(target).started).toBe(false);
  });
  it('validates restored timers before announcing a deleted recipe', async () => {
    TestBed.inject(StepTimerService).start(target);
    TestBed.resetTestingModule();
    recipes.clear();
    vi.setSystemTime(new Date('2026-10-18T17:03:00Z'));
    TestBed.configureTestingModule({
      providers: [
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
    const alert = vi.spyOn(TestBed.inject(FeedbackService), 'show');
    const timers = TestBed.inject(StepTimerService);
    TestBed.tick();
    await Promise.resolve();
    expect(alert).not.toHaveBeenCalled();
    expect(timers.state(target).started).toBe(false);
  });
  it('never announces an old account timer before the account effect has run', () => {
    const timers = TestBed.inject(StepTimerService);
    const alert = vi.spyOn(TestBed.inject(FeedbackService), 'show');
    timers.start(target);
    user.set({ id: 'friend' });
    vi.setSystemTime(new Date('2026-10-18T17:03:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(alert).not.toHaveBeenCalled();
  });
  it('checks the saved step again before alerting even if a partial sync missed its revision', async () => {
    const timers = TestBed.inject(StepTimerService);
    const alert = vi.spyOn(TestBed.inject(FeedbackService), 'show');
    timers.start(target);
    TestBed.tick();
    await Promise.resolve();
    recipes.delete(recipe.id);
    await vi.advanceTimersByTimeAsync(121_000);
    expect(alert).not.toHaveBeenCalled();
    expect(timers.state(target).started).toBe(false);
  });
});
