import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StepTimerComponent } from './step-timer';
import { StepTimerService } from '../../core/services/step-timer.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';
import { TimerAlertOfferService } from '../../core/services/timer-alert-offer.service';
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
  const offer = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T17:00:00Z'));
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [StepTimerComponent],
      providers: [
        provideRouter([]),
        { provide: TimerAlertOfferService, useValue: { offer } },
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
    root.querySelector<HTMLButtonElement>('.timer-edit:not(:disabled)')?.click();
    const input = root.querySelector<HTMLInputElement>('input.timer-input');
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
  it('offers background alerts when a timer starts, not before', () => {
    offer.mockClear();
    const f = fixture();
    expect(offer).not.toHaveBeenCalled();
    f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!.click();
    expect(offer).toHaveBeenCalledOnce();
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
  it('rests as one quiet row: Start, the time and an edit button', () => {
    const f = fixture();
    const row = f.root.querySelector<HTMLElement>('.timer-row')!;
    expect(row.textContent?.replace(/\s+/g, ' ').trim()).toBe('Start 02:00');
    expect(row.querySelector('[aria-label="Edit time for step 1"]')).not.toBeNull();
    expect(row.querySelector('app-minute-ruler')).toBeNull();
    expect(row.querySelector('[aria-label="Reset timer for step 1"]')).toBeNull();
    expect(f.root.querySelector<HTMLDialogElement>('dialog')!.open).toBe(false);
  });
  it('edits in a sheet and changes the timer only on Set', () => {
    const f = fixture();
    const sheet = f.root.querySelector<HTMLDialogElement>('dialog')!;
    const open = () => {
      f.root.querySelector<HTMLButtonElement>('[aria-label="Edit time for step 1"]')!.click();
      f.view.detectChanges();
    };
    open();
    expect(sheet.open).toBe(true);
    const wheel = sheet.querySelector<HTMLElement>('[role=slider]')!;
    wheel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    f.view.detectChanges();
    expect(sheet.querySelector<HTMLInputElement>('input.timer-input')!.value).toBe('03:00');
    expect(f.timers.state(target).remaining).toBe(120);
    sheet.querySelector<HTMLButtonElement>('.sheet-cancel')!.click();
    f.view.detectChanges();
    expect(sheet.open).toBe(false);
    expect(f.timers.state(target).remaining).toBe(120);
    open();
    sheet.querySelector<HTMLButtonElement>('[aria-label="Add one minute"]')!.click();
    sheet.querySelector<HTMLButtonElement>('[aria-label="Add one minute"]')!.click();
    sheet.querySelector<HTMLButtonElement>('.sheet-set')!.click();
    f.view.detectChanges();
    expect(sheet.open).toBe(false);
    expect(f.timers.state(target).remaining).toBe(240);
    expect(f.root.querySelector('.timer-row')!.textContent).toContain('04:00');
    expect(f.root.querySelector('[aria-label="Reset timer for step 1"]')).not.toBeNull();
  });
  it('saves the time to the recipe only when asked', () => {
    const f = fixture();
    const saved: number[] = [];
    f.view.componentRef.setInput('savable', true);
    f.view.componentInstance.saveDuration.subscribe((seconds) => saved.push(seconds));
    f.view.detectChanges();
    const sheet = f.root.querySelector<HTMLDialogElement>('dialog')!;
    for (const keep of [false, true]) {
      f.root.querySelector<HTMLButtonElement>('[aria-label="Edit time for step 1"]')!.click();
      f.view.detectChanges();
      sheet.querySelector<HTMLButtonElement>('[aria-label="Add one minute"]')!.click();
      const box = sheet.querySelector<HTMLInputElement>('.save-default input')!;
      if (box.checked !== keep) box.click();
      sheet.querySelector<HTMLButtonElement>('.sheet-set')!.click();
      f.view.detectChanges();
    }
    expect(saved).toEqual([240]);
  });
  it('runs as a row with Stop, one more minute, Reset and a thin progress line', async () => {
    const f = fixture();
    f.root.querySelector<HTMLButtonElement>('[aria-label="Start timer for step 1"]')!.click();
    f.view.detectChanges();
    const toggle = f.root.querySelector<HTMLButtonElement>('[aria-label="Stop timer for step 1"]')!;
    expect(toggle.textContent?.trim()).toBe('Stop');
    expect(f.root.querySelector('[aria-label="Edit time for step 1"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    f.view.detectChanges();
    const line = f.root.querySelector<HTMLElement>('[role=progressbar]')!;
    expect(line.getAttribute('aria-valuenow')).toBe('117');
    f.root
      .querySelector<HTMLButtonElement>('[aria-label="Add one minute to step 1 timer"]')!
      .click();
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 177, duration: 180, running: true });
    expect(f.root.querySelector('.timer-time')!.textContent?.trim()).toBe('02:57');
    toggle.click();
    f.view.detectChanges();
    expect(f.timers.state(target)).toMatchObject({ remaining: 177, running: false });
    expect(f.root.querySelector('[aria-label="Edit time for step 1"]')).not.toBeNull();
    expect(f.root.querySelector('[role=progressbar]')).not.toBeNull();
  });
  it('blocks one more minute while expiry validation is pending at zero', () => {
    const adjust = vi.fn();
    TestBed.overrideProvider(StepTimerService, {
      useValue: {
        state: () => ({
          duration: 120,
          remaining: 0,
          running: true,
          paused: false,
          started: true,
          done: false,
          elapsed: 0,
        }),
        adjust,
      },
    });
    const f = fixture();
    const add = f.root.querySelector<HTMLButtonElement>('.timer-add')!;
    expect(add.disabled).toBe(true);
    add.click();
    expect(adjust).not.toHaveBeenCalled();
  });
  it('stops an overdue timer without resetting its time', async () => {
    const f = fixture();
    const time = () => f.root.querySelector('.timer-time')!.textContent?.trim();
    f.timers.start(target);
    await vi.advanceTimersByTimeAsync(130000);
    f.view.detectChanges();
    expect(time()).toBe('00:10');
    expect(f.root.querySelector('.timer-time.is-overdue')).not.toBeNull();
    f.root.querySelector<HTMLButtonElement>('[aria-label="Stop timer for step 1"]')!.click();
    await vi.advanceTimersByTimeAsync(5000);
    f.view.detectChanges();
    expect(time()).toBe('00:10');
    f.root.querySelector<HTMLButtonElement>('[aria-label="Reset timer for step 1"]')!.click();
    f.view.detectChanges();
    expect(time()).toBe('02:00');
    expect(f.root.querySelector('[role=progressbar]')).toBeNull();
  });
  it('closes the sheet and drops its draft if the timer starts elsewhere', () => {
    const f = fixture(),
      input = field(f.root);
    type(input, '3000');
    f.view.detectChanges();
    expect(input.value).toBe('30:00');
    f.timers.start(target);
    f.view.detectChanges();
    expect(f.root.querySelector<HTMLDialogElement>('dialog')!.open).toBe(false);
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
  it('keeps the sheet between zero and sixty minutes', () => {
    const f = fixture();
    f.timers.setDuration(target, 3600);
    f.view.detectChanges();
    const sheet = f.root.querySelector<HTMLDialogElement>('dialog')!;
    f.root.querySelector<HTMLButtonElement>('[aria-label="Edit time for step 1"]')!.click();
    f.view.detectChanges();
    const plus = sheet.querySelector<HTMLButtonElement>('[aria-label="Add one minute"]')!;
    const minus = sheet.querySelector<HTMLButtonElement>('[aria-label="Subtract one minute"]')!;
    expect(plus.disabled).toBe(true);
    expect(minus.disabled).toBe(false);
    f.timers.start(target);
    f.view.detectChanges();
    expect(f.root.querySelector<HTMLButtonElement>('.timer-add')!.disabled).toBe(true);
    f.timers.reset(target);
    f.timers.setDuration(target, 0);
    f.view.detectChanges();
    f.root.querySelector<HTMLButtonElement>('[aria-label="Edit time for step 1"]')!.click();
    f.view.detectChanges();
    expect(minus.disabled).toBe(true);
  });
});
