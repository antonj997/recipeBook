import { TimerPushService } from './timer-push.service';
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
  const push = { enabled: signal(false), replaceTimers: vi.fn(), retry: vi.fn() };
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
  function reloadTimers(): StepTimerService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TimerPushService, useValue: push },
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
    return TestBed.inject(StepTimerService);
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T17:00:00Z'));
    localStorage.clear();
    push.enabled.set(false);
    push.replaceTimers.mockClear();
    push.retry.mockClear();
    user.set(null);
    version.set(0);
    revision.set(0);
    recipes.clear();
    recipes.set(recipe.id, recipe);
    TestBed.configureTestingModule({
      providers: [
        { provide: TimerPushService, useValue: push },
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
    expect(timers.state(target)).toMatchObject({ remaining: 90, duration: 120, running: false });
    timers.start(target);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timers.state(target)).toMatchObject({ remaining: 80, duration: 120 });
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
  it('announces expiry once and counts overdue time from the original deadline', async () => {
    const timers = TestBed.inject(StepTimerService);
    const feedback = TestBed.inject(FeedbackService);
    const alert = vi.spyOn(feedback, 'show');
    timers.start({ ...target, seconds: 2 });
    TestBed.tick();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(timers.state(target)).toMatchObject({
      remaining: 0,
      running: false,
      done: true,
      elapsed: 3,
    });
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
      duration: 120,
      running: false,
      started: false,
      done: false,
      elapsed: 0,
    });
    expect(timers.state(other).running).toBe(true);
  });
  it('restores running deadlines after reloading the application', async () => {
    TestBed.inject(StepTimerService).start(target);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-18T17:00:40Z'));
    TestBed.configureTestingModule({
      providers: [
        { provide: TimerPushService, useValue: push },
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
    expect(TestBed.inject(StepTimerService).state(target)).toMatchObject({
      remaining: 80,
      duration: 120,
    });
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
        { provide: TimerPushService, useValue: push },
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
  it('sets a typed duration without changing the saved recipe preset', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 90);
    expect(timers.state(target)).toMatchObject({
      remaining: 90,
      duration: 90,
      running: false,
      started: false,
    });
    timers.reset(target);
    expect(timers.state(target).remaining).toBe(120);
  });
  it('preserves running or paused mode when the duration is typed', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(30_000);
    timers.setDuration(target, 300);
    await vi.advanceTimersByTimeAsync(5000);
    expect(timers.state(target)).toMatchObject({ remaining: 295, duration: 330, running: true });
    timers.pause(target);
    timers.setDuration(target, 60);
    expect(timers.state(target)).toMatchObject({
      remaining: 60,
      duration: 95,
      running: false,
      started: true,
    });
  });
  it('keeps an overdue timer stopped when its duration changes', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(130_000);
    expect(timers.state(target)).toMatchObject({ done: true, running: false });
    timers.setDuration(target, 300);
    await vi.advanceTimersByTimeAsync(1000);
    expect(timers.state(target)).toMatchObject({
      remaining: 300,
      duration: 300,
      running: false,
      started: true,
      done: false,
      elapsed: 0,
    });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: undefined }]);
  });
  it('ignores invalid typed durations', () => {
    const timers = TestBed.inject(StepTimerService);
    for (const seconds of [-1, 0.5, NaN, Infinity, 604801]) timers.setDuration(target, seconds);
    expect(timers.state(target).remaining).toBe(120);
  });

  it('caps a long preset and typed duration at 60 minutes', () => {
    const timers = TestBed.inject(StepTimerService);
    const longTarget = recipeStepTimers({ ...recipe, stepDetails: [{ timerSeconds: 7200 }] })[0]!;
    expect(timers.state(longTarget)).toMatchObject({ remaining: 3600, duration: 3600 });
    timers.start(longTarget);
    expect(timers.state(longTarget)).toMatchObject({ remaining: 3600, duration: 3600 });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([
      { target: longTarget, deadline: Date.now() + 3_600_000 },
    ]);
    timers.pause(longTarget);
    timers.setDuration(longTarget, 7200);
    timers.adjust(longTarget, 1);
    expect(timers.state(longTarget).remaining).toBe(3600);
    expect(longTarget.seconds).toBe(7200);
  });

  it('clears a running clock to idle at zero and keeps Start inactive after reload', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(30_000);
    timers.setDuration(target, 0);
    expect(timers.state(target)).toEqual({
      remaining: 0,
      duration: 0,
      running: false,
      started: false,
      done: false,
      elapsed: 0,
    });
    timers.start(target);
    expect(timers.state(target)).toMatchObject({ remaining: 0, running: false, started: false });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: undefined }]);
    const restored = reloadTimers();
    restored.start(target);
    expect(restored.state(target)).toMatchObject({ remaining: 0, duration: 0, running: false });
    restored.reset(target);
    expect(restored.state(target)).toMatchObject({ remaining: 120, duration: 120 });
  });

  it.each([
    { running: false, secondsLeft: 7200, planned: 3900 },
    { running: true, secondsLeft: 7200, planned: 3900 },
    { running: true, secondsLeft: 6000, planned: 5100 },
  ])(
    'normalizes a long saved clock without extending it on reload ($running, $secondsLeft seconds left)',
    ({ running, secondsLeft, planned }) => {
      const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
      const longRecipe = { ...recipe, stepDetails: [{ timerSeconds: 7200 }] };
      recipes.set(recipe.id, longRecipe);
      const runtimeTarget = recipeStepTimers(longRecipe)[0]!;
      const savedTarget = { ...runtimeTarget, seconds: 7200 };
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            target: savedTarget,
            remaining: 7200,
            duration: 7500,
            deadline: running ? Date.now() + secondsLeft * 1000 : undefined,
            started: true,
            done: false,
            updatedAt: Date.now(),
          },
        ]),
      );
      const timers = TestBed.inject(StepTimerService);
      expect(timers.state(runtimeTarget)).toMatchObject({
        remaining: 3600,
        duration: planned,
        running,
      });
      expect(push.replaceTimers).toHaveBeenLastCalledWith([
        {
          target: savedTarget,
          deadline: running ? Date.now() + 3_600_000 : undefined,
        },
      ]);
      const [saved] = JSON.parse(localStorage.getItem(key)!);
      expect(saved).toMatchObject({ target: savedTarget, remaining: 3600, duration: planned });
      expect(saved.deadline).toBe(running ? Date.now() + 3_600_000 : undefined);
      vi.setSystemTime(Date.now() + 60_000);
      expect(reloadTimers().state(runtimeTarget)).toMatchObject({
        remaining: running ? 3540 : 3600,
        duration: planned,
        running,
      });
    },
  );

  it('keeps total planned time through adjustments, reload, and resume', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(30_000);
    timers.adjust(target, 1);
    expect(timers.state(target)).toMatchObject({ remaining: 150, duration: 180 });
    timers.pause(target);
    timers.adjust(target, -1);
    expect(timers.state(target)).toMatchObject({ remaining: 90, duration: 120, running: false });
    timers.setDuration(target, 300);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-18T17:05:00Z'));
    TestBed.configureTestingModule({
      providers: [
        { provide: TimerPushService, useValue: push },
        { provide: CloudCookbookService, useValue: cookbook },
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'timer-tests', user, accountVersion: version },
        },
      ],
    });
    const restored = TestBed.inject(StepTimerService);
    expect(restored.state(target)).toMatchObject({ remaining: 300, duration: 330, running: false });
    restored.start(target);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(restored.state(target)).toMatchObject({ remaining: 290, duration: 330, running: true });
  });

  it('changes a running deadline by exactly one minute between clock callbacks', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    const deadline = Date.now() + 120_000;
    await vi.advanceTimersByTimeAsync(10_250);
    timers.adjust(target, 1);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: deadline + 60_000 }]);
    expect(timers.state(target)).toMatchObject({ remaining: 170, duration: 180 });
    timers.adjust(target, -1);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline }]);
    expect(timers.state(target)).toMatchObject({ remaining: 110, duration: 120 });
  });

  it('clears a shortened countdown at zero', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 30);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(10_000);
    timers.adjust(target, -1);
    expect(timers.state(target)).toMatchObject({
      remaining: 0,
      duration: 0,
      running: false,
      started: false,
    });
    timers.pause(target);
    timers.adjust(target, -1);
    expect(timers.state(target)).toMatchObject({ remaining: 0, duration: 0, running: false });
  });

  it('turns an overdue adjustment into a fresh stopped countdown', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 2);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(5000);
    timers.adjust(target, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(timers.state(target)).toMatchObject({
      remaining: 60,
      duration: 60,
      running: false,
      started: true,
      done: false,
      elapsed: 0,
    });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: undefined }]);
  });

  it('keeps each account planned duration isolated', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 90);
    user.set({ id: 'friend' });
    version.update((v) => v + 1);
    expect(timers.state(target)).toMatchObject({ remaining: 120, duration: 120, started: false });
    timers.setDuration(target, 300);
    user.set(null);
    version.update((v) => v + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(timers.state(target)).toMatchObject({ remaining: 90, duration: 90 });
  });

  it.each([90, 180])(
    'restores a legacy timer with %i seconds and a sensible total',
    (remaining) => {
      const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            target,
            remaining,
            started: true,
            done: false,
            updatedAt: Date.now(),
          },
        ]),
      );
      expect(TestBed.inject(StepTimerService).state(target)).toMatchObject({
        remaining,
        duration: remaining === 90 ? 120 : 180,
        started: true,
      });
    },
  );

  it.each([
    { remaining: 60, duration: 60 },
    { remaining: 0, duration: 0 },
  ])(
    'starts a legacy idle timer at $remaining seconds without inventing time already passed',
    ({ remaining, duration }) => {
      const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            target,
            remaining,
            started: false,
            done: false,
            updatedAt: Date.now(),
          },
        ]),
      );
      const timers = TestBed.inject(StepTimerService);
      timers.start(target);
      const state = timers.state(target);
      expect(state).toMatchObject({ remaining: duration, duration, running: remaining > 0 });
      expect(state.duration - state.remaining).toBe(0);
    },
  );

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '120', null])(
    'rejects an invalid stored planned duration: %s',
    (duration) => {
      const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
      localStorage.setItem(
        key,
        JSON.stringify([
          {
            target,
            remaining: 60,
            duration,
            started: true,
            done: false,
            updatedAt: Date.now(),
          },
        ]),
      );
      expect(TestBed.inject(StepTimerService).state(target)).toMatchObject({
        remaining: 120,
        duration: 120,
        started: false,
      });
    },
  );

  it('restores accumulated planned duration beyond the limit for remaining time', () => {
    const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          target,
          remaining: 60,
          duration: 604860,
          started: true,
          done: false,
          updatedAt: Date.now(),
        },
      ]),
    );
    expect(TestBed.inject(StepTimerService).state(target)).toMatchObject({
      remaining: 60,
      duration: 604860,
      started: true,
    });
  });

  it('forwards deadline changes and resets to the alert scheduler', () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([
      { target, deadline: Date.now() + 120_000 },
    ]);
    timers.pause(target);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: undefined }]);
    timers.reset(target);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([]);
  });

  it('adopts another tab paused timer before changing its duration', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
    const [saved] = JSON.parse(localStorage.getItem(key)!);
    const value = JSON.stringify([{ ...saved, deadline: undefined, remaining: 90 }]);
    localStorage.setItem(key, value);
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(timers.state(target)).toMatchObject({ running: false, remaining: 90 });
    timers.adjust(target, 1);
    expect(timers.state(target)).toMatchObject({ running: false, remaining: 150 });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline: undefined }]);
  });

  it('reloads another tab reset on return before sending timers to push', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'device']);
    localStorage.setItem(key, '[]');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(timers.state(target)).toMatchObject({ running: false, started: false });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([]);
  });

  it('ignores another account countdown storage events', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.start(target);
    const key = 'recipebook:timers:v1:' + JSON.stringify(['timer-tests', 'other-account']);
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: '[]', storageArea: localStorage }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(timers.state(target)).toMatchObject({ running: true, remaining: 120 });
  });
  it('keeps the original push deadline after expiry, then cancels it when reset', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 2);
    timers.start(target);
    const deadline = Date.now() + 2000;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(timers.state(target)).toMatchObject({ done: true, elapsed: 3 });
    expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline }]);
    timers.reset(target);
    expect(push.replaceTimers).toHaveBeenLastCalledWith([]);
  });
  it('restarts an overdue timer from the recipe duration', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 1);
    timers.start(target);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5000);
    timers.start(target);
    expect(timers.state(target)).toMatchObject({
      remaining: 120,
      duration: 120,
      running: true,
      done: false,
      elapsed: 0,
    });
  });
  it('resets an unattended overdue timer after one hour and on later restoration', async () => {
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 1);
    timers.start(target);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 3_602_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(timers.state(target)).toMatchObject({
      started: false,
      done: false,
      remaining: 120,
      elapsed: 0,
    });
  });
  it('completes an expired timer normally when Pause precedes the next clock callback', async () => {
    const play = vi.fn();
    class TestAudio {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = async () => {};
      close = async () => {};
      createOscillator = () => ({
        frequency: { value: 0 },
        connect: () => ({ connect: () => {} }),
        start: play,
        stop: () => {},
        disconnect: () => {},
        onended: null,
      });
      createGain = () => ({
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        disconnect: () => {},
      });
    }
    vi.stubGlobal('AudioContext', TestAudio);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      const timers = TestBed.inject(StepTimerService);
      const feedback = vi.spyOn(TestBed.inject(FeedbackService), 'show');
      timers.setDuration(target, 1);
      timers.start(target);
      const deadline = Date.now() + 1000;
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);

      // Browser suspension can advance wall time without running the app clock.
      vi.setSystemTime(deadline + 2000);
      timers.pause(target);
      await vi.advanceTimersByTimeAsync(0);
      expect(timers.state(target)).toMatchObject({ done: true, running: false, elapsed: 2 });
      expect(push.replaceTimers).toHaveBeenLastCalledWith([{ target, deadline }]);
      expect(feedback).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2000);
      expect(timers.state(target).elapsed).toBe(4);
      expect(play).toHaveBeenCalledTimes(4);

      vi.setSystemTime(deadline + 3_600_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(timers.state(target)).toMatchObject({ started: false, done: false, remaining: 120 });
      expect(push.replaceTimers).toHaveBeenLastCalledWith([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('repeats a chime for at most 30 seconds and reset stops it immediately', async () => {
    const play = vi.fn();
    class TestAudio {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume = async () => {};
      close = async () => {};
      createOscillator = () => ({
        frequency: { value: 0 },
        connect: () => ({ connect: () => {} }),
        start: play,
        stop: vi.fn(),
        disconnect: () => {},
        onended: null,
      });
      createGain = () => ({
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        disconnect: () => {},
      });
    }
    vi.stubGlobal('AudioContext', TestAudio);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const timers = TestBed.inject(StepTimerService);
    timers.setDuration(target, 1);
    timers.start(target);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(play).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(play.mock.calls.length).toBeGreaterThan(2);
    timers.reset(target);
    const stopped = play.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(play).toHaveBeenCalledTimes(stopped);
    timers.setDuration(target, 1);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(1000);
    timers.setDuration(target, 0);
    const cleared = play.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(play).toHaveBeenCalledTimes(cleared);
    timers.setDuration(target, 1);
    timers.start(target);
    await vi.advanceTimersByTimeAsync(31_000);
    const finished = play.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(play).toHaveBeenCalledTimes(finished);
    vi.unstubAllGlobals();
  });
});
