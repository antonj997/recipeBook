import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeContextDirective } from './recipe-context';
import { RecipeActionsOverlayComponent } from './recipe-actions-overlay';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { CookingSessionService } from '../../core/services/cooking-session.service';

@Component({
  imports: [RecipeContextDirective, RecipeActionsOverlayComponent],
  template: `<a href="/recipes/test" [appRecipeContext]="recipe">Test recipe</a>
    <app-recipe-actions />`,
})
class Host {
  recipe = { id: 'test', title: 'Test recipe', ingredients: [], instructions: [] };
}

describe('recipe long-press menu', () => {
  let openPopovers: WeakSet<HTMLElement>;
  const originalMatches = HTMLElement.prototype.matches;
  beforeEach(() => {
    vi.useFakeTimers();
    openPopovers = new WeakSet();
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector,
    ) {
      return selector === ':popover-open'
        ? openPopovers.has(this)
        : originalMatches.call(this, selector);
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 16),
    );
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideRouter([]),
        { provide: RecipeService, useValue: { accountVersion: signal(0) } },
        { provide: FeedbackService, useValue: {} },
        { provide: CookingSessionService, useValue: {} },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  function fixture() {
    const host = TestBed.createComponent(Host);
    const menu = host.nativeElement.querySelector('#recipe-actions-menu') as HTMLElement;
    menu.showPopover = () => openPopovers.add(menu);
    menu.hidePopover = () => openPopovers.delete(menu);
    menu.setPointerCapture = vi.fn();
    const card = host.nativeElement.querySelector('a') as HTMLElement;
    card.setPointerCapture = vi.fn();
    host.detectChanges();
    const actions = TestBed.inject(RecipeActionsService);
    return { host, menu, card, actions };
  }
  function pointer(target: HTMLElement, type: string, x = 100, y = 200) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
      pointerId: { value: 7 },
    });
    target.dispatchEvent(event);
  }

  it('hands the held pointer to the opened menu so release cannot light-dismiss it', async () => {
    const f = fixture();
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(510);
    f.host.detectChanges();
    expect(f.actions.menu()).toEqual(expect.objectContaining({ trigger: f.card, pointerId: 7 }));
    expect(f.menu.matches(':popover-open')).toBe(true);
    expect(f.menu.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('keeps the menu after the opening release and allows a separate action tap', async () => {
    const f = fixture();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(510);
    f.host.detectChanges();
    pointer(f.menu, 'pointerup');
    f.menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(f.actions.menu()?.recipe.id).toBe('test');
    expect(navigate).not.toHaveBeenCalled();
    const edit = [...f.menu.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Edit recipe'),
    )!;
    edit.click();
    expect(navigate).toHaveBeenCalledWith(['/recipes', 'test', 'edit']);
    expect(f.actions.menu()).toBe(null);
  });

  it('captures a native touch context menu that arrives before the hold timer', async () => {
    const f = fixture();
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(350);
    pointer(f.card, 'contextmenu');
    f.host.detectChanges();
    expect(f.actions.menu()).toEqual(expect.objectContaining({ pointerId: 7 }));
    expect(f.menu.setPointerCapture).toHaveBeenCalledWith(7);
    await vi.advanceTimersByTimeAsync(600);
    f.host.detectChanges();
    expect(f.menu.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  it('does not replace the held menu if native contextmenu arrives after the timer', async () => {
    const f = fixture();
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(510);
    f.host.detectChanges();
    const selected = f.actions.menu();
    pointer(f.card, 'contextmenu');
    f.host.detectChanges();
    expect(f.actions.menu()).toBe(selected);
    expect(f.menu.setPointerCapture).toHaveBeenCalledTimes(1);
  });

  it('does not turn a normal tap into a menu', async () => {
    const f = fixture();
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(150);
    pointer(f.card, 'pointerup');
    await vi.advanceTimersByTimeAsync(600);
    f.host.detectChanges();
    expect(f.actions.menu()).toBe(null);
  });

  it.each(['pointermove', 'pointercancel'])('cancels a hold on %s', async (type) => {
    const f = fixture();
    pointer(f.card, 'pointerdown');
    pointer(f.card, type, 130, 230);
    await vi.advanceTimersByTimeAsync(600);
    f.host.detectChanges();
    expect(f.actions.menu()).toBe(null);
  });

  it('keeps right-click and keyboard menus independent of a held pointer', () => {
    const f = fixture();
    f.card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    f.host.detectChanges();
    expect(f.actions.menu()?.recipe.id).toBe('test');
    expect(f.menu.setPointerCapture).not.toHaveBeenCalled();
    f.actions.menu.set(null);
    f.host.detectChanges();
    f.card.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
    );
    f.host.detectChanges();
    expect(f.actions.menu()?.recipe.id).toBe('test');
    expect(f.menu.setPointerCapture).not.toHaveBeenCalled();
  });

  it('still opens if the finger ended before the menu rendered', async () => {
    const f = fixture();
    vi.mocked(f.menu.setPointerCapture).mockImplementation(() => {
      throw new DOMException('Pointer is no longer active', 'NotFoundError');
    });
    pointer(f.card, 'pointerdown');
    await vi.advanceTimersByTimeAsync(510);
    expect(() => f.host.detectChanges()).not.toThrow();
    expect(f.actions.menu()?.recipe.id).toBe('test');
    expect(f.menu.matches(':popover-open')).toBe(true);
  });
});
