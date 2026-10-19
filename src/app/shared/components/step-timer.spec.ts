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
    const adjust = root.querySelectorAll<HTMLButtonElement>('.step-timer .timer-adjust');
    return { view, root, timers, minus: adjust[0], plus: adjust[1] };
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

  it('keeps Start, Pause, Resume and Reset outside the countdown border', () => {
    const f = fixture();
    for (const action of ['Start', 'Pause', 'Resume']) {
      f.view.detectChanges();
      const button = f.root.querySelector<HTMLButtonElement>('.timer-action')!;
      expect(button.textContent?.trim()).toBe(action);
      expect(button.closest('.step-timer')).toBeNull();
      button.click();
    }
    f.timers.pause(target);
    f.view.detectChanges();
    expect(
      f.root.querySelector('[aria-label="Reset timer for step 1"]')?.closest('.step-timer'),
    ).toBeNull();
  });

  it.each([
    ['3', 180],
    ['1.5', 90],
    [' 4 ', 240],
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

  it.each(['', '0', '-1', '1e2', '2 minutes', '1:60', '1:60:00', '1:00:60', '10081'])(
    'keeps the duration and explains invalid input %j',
    (text) => {
      const f = fixture();
      const input = field(f.root);
      type(input, text);
      input.dispatchEvent(new FocusEvent('blur'));
      f.view.detectChanges();
      expect(f.timers.state(target).remaining).toBe(120);
      expect(input.value).toBe(text);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(f.root.querySelector('[role="alert"]')?.textContent).toContain('0:01');
    },
  );

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
    expect(input.value).toBe('1:57');
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
    expect(input.value).toBe('3:14');
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
    expect(input.value).toBe('1:57');
  });

  it('hides even a started countdown when the step is completed', () => {
    const f = fixture();
    f.timers.start(target);
    f.view.componentRef.setInput('completed', true);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });

  it('changes once on press, then repeats slowly and accelerates', async () => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    expect(f.timers.state(target).remaining).toBe(180);
    await vi.advanceTimersByTimeAsync(449);
    expect(f.timers.state(target).remaining).toBe(180);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.timers.state(target).remaining).toBe(240);
    await vi.advanceTimersByTimeAsync(900);
    expect(f.timers.state(target).remaining).toBe(420);
    await vi.advanceTimersByTimeAsync(300);
    expect(f.timers.state(target).remaining).toBe(480);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.timers.state(target).remaining).toBe(540);
  });

  it('does not add the trailing pointer click after release and keeps keyboard activation', async () => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    await vi.advanceTimersByTimeAsync(450);
    pointer(f.plus, 'pointerup');
    f.plus.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.timers.state(target).remaining).toBe(240);
    f.plus.click();
    expect(f.timers.state(target).remaining).toBe(300);
  });

  it.each(['pointercancel', 'lostpointercapture'])('stops repeat on %s', async (type) => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    pointer(f.plus, type);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.timers.state(target).remaining).toBe(180);
  });

  it('stops on release outside the button and ignores other pointer releases', async () => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    pointer(document.body, 'pointerup', 12);
    await vi.advanceTimersByTimeAsync(450);
    pointer(document.body, 'pointerup');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.timers.state(target).remaining).toBe(240);
  });

  it('stops subtracting at one second and disables the minus button', async () => {
    const f = fixture();
    pointer(f.minus, 'pointerdown');
    await vi.advanceTimersByTimeAsync(2000);
    f.view.detectChanges();
    expect(f.timers.state(target).remaining).toBe(1);
    expect(f.minus.disabled).toBe(true);
  });

  it.each(['completed', 'disabled'])('stops a held button when %s changes', async (input) => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    f.view.componentRef.setInput(input, true);
    f.view.detectChanges();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.timers.state(target).remaining).toBe(180);
  });

  it('stops repeating when the document becomes hidden or the component is destroyed', async () => {
    const f = fixture();
    pointer(f.plus, 'pointerdown');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.timers.state(target).remaining).toBe(180);
    vi.restoreAllMocks();
    pointer(f.plus, 'pointerdown');
    f.view.destroy();
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.timers.state(target).remaining).toBe(240);
  });
});
