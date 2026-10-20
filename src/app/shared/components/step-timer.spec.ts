import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepTimerComponent } from './step-timer';
import { StepTimerService } from '../../core/services/step-timer.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';
import { recipeStepTimers } from '../../core/models/step-timer';
import type { Recipe } from '../../core/models/recipe.model';

describe('editable step timer controls', () => {
  const recipe: Recipe = {
    id: 'timer-controls',
    title: 'Test recipe',
    ingredients: [],
    instructions: ['Cook for 2 minutes.'],
  };
  const target = recipeStepTimers(recipe)[0]!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T17:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [StepTimerComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            cacheScope: 'timer-controls',
            user: signal(null),
            accountVersion: signal(0),
          },
        },
        {
          provide: CloudCookbookService,
          useValue: {
            revision: signal(0),
            database: { recipes: { bulkGet: async () => [recipe] } },
          },
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

  function fixture() {
    const view = TestBed.createComponent(StepTimerComponent);
    view.componentRef.setInput('target', target);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    const timers = TestBed.inject(StepTimerService);
    return { view, root, timers };
  }

  function field(root: HTMLElement) {
    const input = root.querySelector<HTMLInputElement>('input');
    expect(input, 'the countdown can be edited directly').not.toBeNull();
    return input!;
  }

  function type(input: HTMLInputElement, value: string) {
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pointer(element: HTMLElement, type: string, id = 7) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
    });
    element.dispatchEvent(event);
  }

  it.each([
    ['0100', 60],
    ['1234', 754],
    ['6000', 3600],
    ['0:01', 1],
    ['60:00', 3600],
  ])('sets %s using only minutes and seconds', (text, seconds) => {
    const f = fixture(),
      input = field(f.root);
    type(input, text);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.view.detectChanges();
    expect(f.timers.state(target).remaining).toBe(seconds);
    expect(input.value.split(':')).toHaveLength(2);
  });
  it.each(['6100', '6001', '0060', '01:00:00', '90:00', ''])(
    'rejects a duration outside MM:SS or sixty minutes: %s',
    (text) => {
      const f = fixture(),
        input = field(f.root);
      type(input, text);
      input.dispatchEvent(new FocusEvent('blur'));
      f.view.detectChanges();
      expect(f.timers.state(target).remaining).toBe(120);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(f.root.querySelector('[role=alert]')?.textContent).toContain('60:00');
    },
  );
  it('keeps numeric entry, selection replacement and backspace simple', () => {
    const f = fixture(),
      input = field(f.root);
    input.dispatchEvent(new FocusEvent('focus'));
    expect(input.inputMode).toBe('numeric');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    for (const [digit, expected] of [
      ['6', '00:06'],
      ['0', '00:60'],
      ['0', '06:00'],
      ['0', '60:00'],
    ]) {
      input.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: digit,
          bubbles: true,
          cancelable: true,
        }),
      );
      f.view.detectChanges();
      expect(input.value).toBe(expected);
    }
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('06:00');
    input.setSelectionRange(0, 2);
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '12',
        bubbles: true,
        cancelable: true,
      }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('12:00');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(720);
  });
  it.each([true, false])('handles native input and backspace (beforeinput: %s)', (withBefore) => {
    const f = fixture(),
      input = field(f.root);
    type(input, '1234');
    input.setSelectionRange(3, 5);
    if (withBefore)
      input.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'insertText', data: '45', bubbles: true }),
      );
    input.setRangeText('45', input.selectionStart!, input.selectionEnd!, 'end');
    input.dispatchEvent(
      new InputEvent('input', { inputType: 'insertText', data: '45', bubbles: true }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('12:45');
    input.setSelectionRange(5, 5);
    if (withBefore)
      input.dispatchEvent(
        new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true }),
      );
    input.setRangeText('', 4, 5, 'end');
    input.dispatchEvent(
      new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('01:24');
  });
  it('allows zero on the loop without starting an empty timer', () => {
    const f = fixture(),
      input = field(f.root);
    type(input, '0000');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.view.detectChanges();
    expect(input.value).toBe('00:00');
    expect(
      f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!.disabled,
    ).toBe(true);
    expect(f.timers.state(target).running).toBe(false);
  });
  it('locks time entry, minute buttons and ruler while running, then unlocks on Stop', async () => {
    const f = fixture();
    const start = f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!;
    expect(f.root.querySelector('[aria-label="Stop timer for step 1"]')).toBeNull();
    start.click();
    f.view.detectChanges();
    expect(f.root.querySelector('[aria-label="Start timer for step 1"]')).toBeNull();
    expect(f.root.querySelector('[aria-label="Stop timer for step 1"]')).toBe(start);
    expect(start.textContent?.trim()).toBe('Stop');
    const input = field(f.root),
      slider = f.root.querySelector<HTMLElement>('[role=slider]')!;
    expect(input.disabled).toBe(true);
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    for (const button of f.root.querySelectorAll<HTMLButtonElement>('.timer-minute'))
      expect(button.disabled).toBe(true);
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(120);
    await vi.advanceTimersByTimeAsync(3000);
    f.root.querySelector<HTMLButtonElement>('[aria-label="Stop timer for step 1"]')!.click();
    f.view.detectChanges();
    expect(input.disabled).toBe(false);
    expect(f.root.querySelector('[aria-label="Start timer for step 1"]')).toBe(start);
    expect(f.root.querySelector('[aria-label="Stop timer for step 1"]')).toBeNull();
    expect(start.textContent?.trim()).toBe('Start');
    expect(slider.getAttribute('aria-disabled')).toBe('false');
    expect(f.timers.state(target)).toMatchObject({ remaining: 117, running: false });
    f.root.querySelector<HTMLButtonElement>('[aria-label^="Add one minute"]')!.click();
    expect(f.timers.state(target).remaining).toBe(177);
  });
  it('locks an overdue timer until Stop or Reset', async () => {
    const f = fixture();
    f.timers.start(target);
    await vi.advanceTimersByTimeAsync(130000);
    f.view.detectChanges();
    expect(field(f.root).value).toBe('00:10');
    expect(f.root.querySelector('[role=slider]')!.getAttribute('aria-disabled')).toBe('true');
    f.root.querySelector<HTMLButtonElement>('[aria-label="Stop timer for step 1"]')!.click();
    f.view.detectChanges();
    expect(field(f.root).disabled).toBe(false);
    expect(field(f.root).value).toBe('02:00');
  });
  it('discards an open draft if the timer starts elsewhere before blur', () => {
    const f = fixture(),
      input = field(f.root);
    type(input, '3000');
    f.view.detectChanges();
    expect(input.value).toBe('30:00');
    f.timers.start(target);
    f.view.detectChanges();
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('02:00');
    input.dispatchEvent(new FocusEvent('blur'));
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 120, running: true });
  });
  it('keeps Reset available and hides a completed step timer', () => {
    const f = fixture();
    f.timers.start(target);
    f.view.detectChanges();
    f.root.querySelector<HTMLButtonElement>('[aria-label="Reset timer for step 1"]')!.click();
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({
      remaining: 120,
      running: false,
      started: false,
    });
    f.view.componentRef.setInput('completed', true);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });
  it('keeps plus at sixty minutes and minus at zero', () => {
    const f = fixture();
    f.timers.setDuration(target, 3600);
    f.view.detectChanges();
    expect(field(f.root).value).toBe('60:00');
    expect(
      f.root.querySelector<HTMLButtonElement>('[aria-label^="Add one minute"]')!.disabled,
    ).toBe(true);
    f.timers.setDuration(target, 0);
    f.view.detectChanges();
    expect(
      f.root.querySelector<HTMLButtonElement>('[aria-label^="Subtract one minute"]')!.disabled,
    ).toBe(true);
  });
});
