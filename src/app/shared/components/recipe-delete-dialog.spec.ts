import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeActionsOverlayComponent } from './recipe-actions-overlay';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { CookingSessionService } from '../../core/services/cooking-session.service';
import type { Recipe } from '../../core/models/recipe.model';

describe('recipe delete dialog', () => {
  const recipe: Recipe = {
    id: 'chokladbollar',
    title: 'Chokladbollar',
    color: 'mint',
    ingredients: [],
    instructions: [],
  } as Recipe;
  const restore = vi.fn().mockResolvedValue(undefined);
  const show = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: RecipeService,
          useValue: { accountVersion: signal(0), deleteWithUndo: async () => restore },
        },
        { provide: FeedbackService, useValue: { show } },
        { provide: CookingSessionService, useValue: { read: () => null, clear: vi.fn() } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    show.mockClear();
  });

  function open() {
    const view = TestBed.createComponent(RecipeActionsOverlayComponent);
    view.detectChanges();
    TestBed.inject(RecipeActionsService).delete(recipe);
    view.detectChanges();
    const dialog = (view.nativeElement as HTMLElement).querySelector<HTMLDialogElement>(
      '.delete-dialog',
    )!;
    return { view, dialog };
  }

  it('shows the recipe as a small page in its own colour above a clear choice', () => {
    const { dialog } = open();
    const page = dialog.querySelector<HTMLElement>('.doomed-page')!;
    expect(page.textContent).toContain('Chokladbollar');
    expect(page.style.getPropertyValue('--page-color')).not.toBe('');
    expect(dialog.querySelector('app-food-doodle')).toBeNull();
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('.dialog-actions button')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Keep', 'Delete']);
  });

  it('crumples the page, then offers Undo once the recipe is gone', async () => {
    const { view, dialog } = open();
    dialog.querySelector<HTMLButtonElement>('.delete-button')!.click();
    await vi.advanceTimersByTimeAsync(0);
    view.detectChanges();
    expect(dialog.querySelector('.doomed-page')!.classList).toContain('is-crumpling');
    expect(dialog.querySelector('h2')!.textContent).toContain('Recipe deleted');
    expect(show).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1200);
    view.detectChanges();
    expect(show).toHaveBeenCalledWith('Recipe deleted', expect.objectContaining({ label: 'Undo' }));
  });
});
