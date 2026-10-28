import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackService } from './feedback.service';

describe('toast actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('dismisses a navigation action without announcing recipe restoration', async () => {
    const feedback = TestBed.inject(FeedbackService);
    feedback.show('Timer finished', { label: 'View step', run: async () => {} });
    await feedback.runAction();
    expect(feedback.message()).toBe('');
    expect(feedback.action()).toBeNull();
  });
  it('preserves caller-specific Undo success and retry messages', async () => {
    const feedback = TestBed.inject(FeedbackService);
    const run = vi.fn(async () => {});
    const action = {
      label: 'Undo',
      successMessage: 'Recipe restored',
      errorMessage: 'Could not restore the recipe. Try Undo again.',
      run,
    };
    feedback.show('Recipe deleted', action);
    await feedback.runAction();
    expect(feedback.message()).toBe('Recipe restored');
    feedback.show('Recipe deleted', action);
    run.mockRejectedValueOnce(new Error('Offline'));
    await feedback.runAction();
    expect(feedback.message()).toBe(action.errorMessage);
    expect(feedback.action()).toBe(action);
    expect(feedback.busy()).toBe(false);
  });
  it('does not clear a newer toast when an older action finishes', async () => {
    const feedback = TestBed.inject(FeedbackService);
    let finish!: () => void;
    feedback.show('Timer finished', {
      label: 'View step',
      run: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    const action = feedback.runAction();
    feedback.show('Another timer finished');
    finish();
    await action;
    expect(feedback.message()).toBe('Another timer finished');
  });

  it('tells the action owner only when a person closes the toast', () => {
    const feedback = new FeedbackService();
    const closed = vi.fn();
    feedback.show('Timer finished', { label: 'View', run: async () => undefined, closed });
    feedback.dismiss();
    expect(closed).not.toHaveBeenCalled();
    feedback.show('Timer finished', { label: 'View', run: async () => undefined, closed });
    feedback.close();
    expect(closed).toHaveBeenCalledOnce();
    expect(feedback.message()).toBe('');
  });
});
