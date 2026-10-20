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

  it('uses an accessible minute ruler alongside one-minute controls', () => {
    const f = fixture();
    expect(f.root.querySelector('[role="slider"]')).not.toBeNull();
    expect(f.root.querySelector('[aria-label^="Add one minute"]')).not.toBeNull();
    expect(f.root.querySelector('[aria-label^="Subtract one minute"]')).not.toBeNull();
  });
  it('adds and removes one minute without clearing elapsed progress', async () => {
    const f = fixture();
    f.timers.start(target);
    await vi.advanceTimersByTimeAsync(30_000);
    f.view.detectChanges();
    const plus = f.root.querySelector<HTMLButtonElement>('[aria-label^="Add one minute"]');
    const minus = f.root.querySelector<HTMLButtonElement>('[aria-label^="Subtract one minute"]');
    expect(plus).not.toBeNull();
    expect(minus).not.toBeNull();
    plus!.click();
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 150, duration: 180, running: true });
    minus!.click();
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 90, duration: 120, running: true });
  });
  it('keeps Start, Stop and Reset below the ruler, and resumes stopped timers', () => {
    const f = fixture();
    const start = f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!;
    const stop = f.root.querySelector<HTMLButtonElement>('[aria-label="Stop timer for step 1"]')!;
    expect(stop.disabled).toBe(true);
    for (const button of f.root.querySelectorAll('.timer-action'))
      expect(button.closest('.step-timer')).toBeNull();
    start.click();
    f.view.detectChanges();
    expect(start.disabled).toBe(true);
    expect(stop.disabled).toBe(false);
    stop.click();
    f.view.detectChanges();
    expect(f.timers.state(target).running).toBe(false);
    start.click();
    expect(f.timers.state(target).running).toBe(true);
  });

  it.each([
    ['3', 3],
    ['0100', 60],
    ['1234', 754],
    ['6000', 3600],
    ['12000', 7200],
    ['1008000', 604800],
    ['0:01', 1],
    ['12:34', 754],
    ['90:00', 5400],
    ['1:02:03', 3723],
    ['168:00:00', 604800],
  ])('sets %s to %i seconds', (text, seconds) => {
    const f = fixture();
    const input = field(f.root);
    type(input, text);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.view.detectChanges();
    expect(f.timers.state(target).remaining).toBe(seconds);
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it.each(['', '0', '0060', '1:60', '1:60:00', '1:00:60', '169:00:00', '1008001', '10080000'])(
    'keeps the duration and explains invalid input %j',
    (text) => {
      const f = fixture();
      const input = field(f.root);
      type(input, text);
      input.dispatchEvent(new FocusEvent('blur'));
      f.view.detectChanges();
      expect(f.timers.state(target).remaining).toBe(120);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(f.root.querySelector('[role="alert"]')?.textContent).toContain('0:01');
    },
  );

  it('selects the full duration when focusing or tapping the field', () => {
    const f = fixture();
    const input = field(f.root);
    expect(input.inputMode).toBe('numeric');
    input.dispatchEvent(new FocusEvent('focus'));
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    input.setSelectionRange(1, 1);
    pointer(input, 'pointerup');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    expect(input.dispatchEvent(new MouseEvent('mouseup', { cancelable: true }))).toBe(false);
  });

  it('adds separators while consecutive numeric keys replace the selected duration', () => {
    const f = fixture();
    const input = field(f.root);
    input.dispatchEvent(new FocusEvent('focus'));
    for (const [digit, display] of [
      ['0', '00:00'],
      ['1', '00:01'],
      ['0', '00:10'],
      ['0', '01:00'],
      ['0', '10:00'],
      ['0', '01:40:00'],
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
      expect(input.value).toBe(display);
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(6000);
  });

  it('keeps numeric entry editable with backspace and strips nonnumeric pasted characters', () => {
    const f = fixture();
    const input = field(f.root);
    type(input, 'a0b1c0d0');
    f.view.detectChanges();
    expect(input.value).toBe('01:00');
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('00:10');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(10);
  });

  it('keeps the numeric mask stable for keyboards that send input without a cancelable beforeinput', () => {
    const f = fixture();
    const input = field(f.root);
    type(input, '0');
    for (const [raw, display] of [
      ['00:001', '00:01'],
      ['00:010', '00:10'],
      ['00:100', '01:00'],
    ]) {
      input.value = raw;
      input.dispatchEvent(
        new InputEvent('input', {
          inputType: 'insertCompositionText',
          bubbles: true,
        }),
      );
      f.view.detectChanges();
      expect(input.value).toBe(display);
    }
    input.dispatchEvent(new FocusEvent('blur'));
    expect(f.timers.state(target).remaining).toBe(60);
  });

  it.each([
    ['insertText', '3', '00:03', 3],
    ['deleteContentBackward', null, '00:20', 20],
  ])(
    'normalizes a noncancelable %s only after its native edit',
    (inputType, data, display, seconds) => {
      const f = fixture();
      const input = field(f.root);
      input.dispatchEvent(new FocusEvent('focus'));
      if (inputType === 'deleteContentBackward')
        input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType,
          data,
          bubbles: true,
          cancelable: false,
        }),
      );
      // The browser still applies its default edit when beforeinput cannot be cancelled.
      const start = input.selectionStart!;
      const end = input.selectionEnd!;
      input.setRangeText(
        data ?? '',
        inputType === 'deleteContentBackward' ? start - 1 : start,
        end,
        'end',
      );
      input.dispatchEvent(new InputEvent('input', { inputType, data, bubbles: true }));
      f.view.detectChanges();
      expect(input.value).toBe(display);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(f.timers.state(target).remaining).toBe(seconds);
    },
  );

  it('shows hours and minutes separators while numeric entry keeps growing in minutes', () => {
    const f = fixture();
    const input = field(f.root);
    input.dispatchEvent(new FocusEvent('focus'));
    for (const [digit, display] of [
      ['1', '00:01'],
      ['1', '00:11'],
      ['1', '01:11'],
      ['1', '11:11'],
      ['1', '01:51:11'],
      ['1', '18:31:11'],
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
      expect(input.value).toBe(display);
      expect(input.selectionStart).toBe(display.length);
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(66671);
  });

  it.each([true, false])(
    'keeps raw numeric meaning after native edits of an hours display (beforeinput: %s)',
    (withBeforeInput) => {
      const f = fixture();
      const input = field(f.root);
      type(input, '6000');
      f.view.detectChanges();
      expect(input.value).toBe('01:00:00');
      for (const [digit, display] of [
        ['1', '10:00:01'],
        ['1', '100:00:11'],
      ]) {
        input.setSelectionRange(input.value.length, input.value.length);
        if (withBeforeInput)
          input.dispatchEvent(
            new InputEvent('beforeinput', {
              inputType: 'insertText',
              data: digit,
              bubbles: true,
            }),
          );
        input.setRangeText(digit, input.selectionStart!, input.selectionEnd!, 'end');
        input.dispatchEvent(
          new InputEvent('input', { inputType: 'insertText', data: digit, bubbles: true }),
        );
        f.view.detectChanges();
        expect(input.value).toBe(display);
        expect(input.selectionStart).toBe(display.length);
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(f.timers.state(target).remaining).toBe(360011);
    },
  );

  it('backspaces the raw numeric entry after the display gains an hours segment', () => {
    const f = fixture();
    const input = field(f.root);
    type(input, '111111');
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('01:51:11');
    expect(input.selectionStart).toBe(input.value.length);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(6671);
  });

  it.each([true, false])(
    'replaces a selected minutes segment in the hours display (cancelable: %s)',
    (cancelable) => {
      const f = fixture();
      const input = field(f.root);
      type(input, '111111');
      f.view.detectChanges();
      expect(input.value).toBe('18:31:11');
      input.setSelectionRange(3, 5);
      input.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: '45',
          bubbles: true,
          cancelable,
        }),
      );
      if (!cancelable) {
        input.setRangeText('45', input.selectionStart!, input.selectionEnd!, 'end');
        input.dispatchEvent(
          new InputEvent('input', { inputType: 'insertText', data: '45', bubbles: true }),
        );
      }
      f.view.detectChanges();
      expect(input.value).toBe('18:45:11');
      expect(input.selectionStart).toBe(6);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(f.timers.state(target).remaining).toBe(67511);
    },
  );

  it('selects a canonical hours value on focus and replaces the whole duration', () => {
    const f = fixture();
    f.timers.setDuration(target, 7200);
    f.view.detectChanges();
    const input = field(f.root);
    input.dispatchEvent(new FocusEvent('focus'));
    expect(input.value).toBe('02:00:00');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 8]);
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '6000',
        bubbles: true,
        cancelable: true,
      }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('01:00:00');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(3600);
  });

  it('keeps an explicit hours paste editable after a native numeric edit', () => {
    const f = fixture();
    const input = field(f.root);
    type(input, '1:02:03');
    input.setSelectionRange(input.value.length - 2, input.value.length);
    input.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '04',
        bubbles: true,
      }),
    );
    input.setRangeText('04', input.selectionStart!, input.selectionEnd!, 'end');
    input.dispatchEvent(
      new InputEvent('input', { inputType: 'insertText', data: '04', bubbles: true }),
    );
    f.view.detectChanges();
    expect(input.value).toBe('01:02:04');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(f.timers.state(target).remaining).toBe(3724);
  });

  it.each([true, false])(
    'keeps hours entry stable after native backspace (beforeinput: %s)',
    (withBeforeInput) => {
      const f = fixture();
      const input = field(f.root);
      type(input, '111111');
      input.setSelectionRange(input.value.length, input.value.length);
      if (withBeforeInput)
        input.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'deleteContentBackward',
            bubbles: true,
          }),
        );
      input.setRangeText('', input.selectionStart! - 1, input.selectionEnd!, 'end');
      input.dispatchEvent(
        new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }),
      );
      f.view.detectChanges();
      expect(input.value).toBe('01:51:11');
      expect(input.selectionStart).toBe(input.value.length);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(f.timers.state(target).remaining).toBe(6671);
    },
  );
  it('keeps invalid seconds visible when numeric entry gains an hours segment', () => {
    const f = fixture();
    const input = field(f.root);
    type(input, '6075');
    f.view.detectChanges();
    expect(input.value).toBe('01:00:75');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    f.view.detectChanges();
    expect(f.timers.state(target).remaining).toBe(120);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('offers Reset while a timer is running', () => {
    const f = fixture();
    f.timers.start(target);
    f.view.detectChanges();
    const reset = f.root.querySelector<HTMLButtonElement>('[aria-label="Reset timer for step 1"]');
    expect(reset).not.toBeNull();
    reset!.click();
    expect(f.timers.state(target)).toMatchObject({
      remaining: 120,
      running: false,
      started: false,
    });
  });

  it('shows the time elapsed after the deadline with Restart and Reset controls', async () => {
    const f = fixture();
    f.timers.start(target);
    await vi.advanceTimersByTimeAsync(150_000);
    f.view.detectChanges();
    expect(field(f.root).value).toBe('00:30');
    expect(field(f.root).getAttribute('aria-label')).toContain('Time overdue');
    expect(f.root.querySelector('.timer-action')?.textContent?.trim()).toBe('Start');
    f.root.querySelector<HTMLButtonElement>('[aria-label="Reset timer for step 1"]')!.click();
    f.view.detectChanges();
    expect(field(f.root).value).toBe('02:00');
    expect(f.root.querySelector('.timer-action')?.textContent?.trim()).toBe('Start');
  });

  it('keeps an overdue timer stopped when its ruler changes duration until Start is pressed', async () => {
    const f = fixture();
    f.timers.start(target);
    await vi.advanceTimersByTimeAsync(130_000);
    f.view.detectChanges();
    expect(f.timers.state(target).done).toBe(true);
    f.root
      .querySelector('[role="slider"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 180, running: false, done: false });
    f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!.click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.timers.state(target)).toMatchObject({ remaining: 179, running: true });
  });

  it('keeps the ruler geometry stable when the time crosses an hour', () => {
    const f = fixture();
    f.timers.setDuration(target, 3599);
    f.view.detectChanges();
    const before = getComputedStyle(field(f.root)).width;
    f.timers.setDuration(target, 3600);
    f.view.detectChanges();
    expect(field(f.root).value).toBe('01:00:00');
    expect(getComputedStyle(field(f.root)).width).toBe(before);
  });

  it('retains the typed draft while the running countdown ticks', async () => {
    const f = fixture();
    f.timers.start(target);
    const input = field(f.root);
    type(input, '4:');
    await vi.advanceTimersByTimeAsync(3000);
    f.view.detectChanges();
    expect(input.value).toBe('4:');
    expect(f.timers.state(target).remaining).toBe(117);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    f.view.detectChanges();
    expect(input.value).toBe('01:57');
  });

  it('commits on blur while preserving a running countdown', async () => {
    const f = fixture();
    f.timers.start(target);
    const input = field(f.root);
    type(input, '3:15');
    input.dispatchEvent(new FocusEvent('blur'));
    await vi.advanceTimersByTimeAsync(1000);
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({
      remaining: 194,
      running: true,
    });
    expect(input.value).toBe('03:14');
  });

  it('does not rewind a countdown when the field is focused without changing its value', async () => {
    const f = fixture();
    f.timers.start(target);
    const input = field(f.root);
    input.dispatchEvent(new FocusEvent('focus'));
    await vi.advanceTimersByTimeAsync(3000);
    input.dispatchEvent(new FocusEvent('blur'));
    f.view.detectChanges();
    expect(f.timers.state(target).remaining).toBe(117);
    expect(input.value).toBe('01:57');
  });

  it('hides even a started countdown when the step is completed', () => {
    const f = fixture();
    f.timers.start(target);
    f.view.componentRef.setInput('completed', true);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });
});
