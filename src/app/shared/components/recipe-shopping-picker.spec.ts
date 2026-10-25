import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { ShoppingListService } from '../../core/services/shopping-list.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { RecipeShoppingPickerComponent } from './recipe-shopping-picker';

describe('recipe shopping picker', () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  const recipe: Recipe = {
    id: 'soup',
    title: 'Tomato soup',
    servings: 4,
    ingredients: ['2 kg tomatoes', '1 onion', 'Salt'],
    ingredientSections: ['Soup', 'Soup', 'To finish'],
    instructions: [],
  };
  const accountVersion = signal(0);
  let duplicate = false;
  let saved: { servings: number; indices: readonly number[]; again?: boolean }[];
  let error = false;
  let waitForSave: (() => Promise<number>) | null = null;
  let feedback: FeedbackService;

  beforeEach(() => {
    saved = [];
    duplicate = false;
    error = false;
    waitForSave = null;
    accountVersion.set(0);
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.setAttribute('open', '');
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.removeAttribute('open');
        },
      },
    });
    TestBed.configureTestingModule({
      imports: [RecipeShoppingPickerComponent],
      providers: [
        provideRouter([]),
        {
          provide: RecipeService,
          useValue: { getRecipes: async () => [recipe], accountVersion, revision: signal(0) },
        },
        {
          provide: ShoppingListService,
          useValue: {
            accountVersion,
            hasRecipeSelection: () => duplicate,
            addRecipe: async (
              _recipe: Recipe,
              servings: number,
              indices: readonly number[],
              again?: boolean,
            ) => {
              if (waitForSave) return waitForSave();
              if (error) throw new Error('Could not save. Try again.');
              saved.push({ servings, indices: [...indices], again });
              return indices.length;
            },
          },
        },
      ],
    });
    feedback = TestBed.inject(FeedbackService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    feedback?.dismiss();
    if (originalShowModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  async function fixture(value: Recipe | null = recipe, servings = 8) {
    const host = TestBed.createComponent(RecipeShoppingPickerComponent);
    host.componentRef.setInput('recipe', value);
    host.componentRef.setInput('servings', servings);
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    return host;
  }

  it.each([true, false])('starts with no products selected (direct recipe: %s)', async (direct) => {
    const host = await fixture(direct ? recipe : null);
    if (!direct) {
      (host.nativeElement.querySelector('.recipe-choice') as HTMLButtonElement).click();
      host.detectChanges();
    }
    const inputs = Array.from(
      host.nativeElement.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => !input.checked)).toBe(true);
    expect((host.nativeElement.querySelector('.add-selected') as HTMLButtonElement).disabled).toBe(
      true,
    );
    await host.componentInstance.submit();
    expect(saved).toEqual([]);
    inputs[1].click();
    host.detectChanges();
    await host.componentInstance.submit();
    expect(saved).toEqual([{ servings: direct ? 8 : 4, indices: [1], again: false }]);
  });

  it('clears selections when choosing another recipe but preserves them when changing servings', async () => {
    const host = await fixture();
    host.componentInstance.toggle(1);
    host.componentInstance.changeServings('6');
    expect([...host.componentInstance.selected()]).toEqual([1]);
    host.componentInstance.chooseRecipe({ ...recipe, id: 'other' });
    host.detectChanges();
    expect(host.componentInstance.selectedCount()).toBe(0);
    host.componentInstance.selectAll();
    await host.componentInstance.submit();
    expect(saved).toEqual([{ servings: 4, indices: [0, 1, 2], again: false }]);
  });

  it('scales original ingredients and saves the selected original indices', async () => {
    const host = await fixture();
    host.componentInstance.selectAll();
    host.detectChanges();
    expect(host.nativeElement.textContent).toContain('4 kg tomatoes');
    expect(host.nativeElement.textContent).toContain('Soup');
    const inputs = host.nativeElement.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    inputs[1].click();
    host.detectChanges();
    await host.componentInstance.submit();
    expect(saved).toEqual([{ servings: 8, indices: [0, 2], again: false }]);
    expect(feedback.message()).toBe('2 items added');
    expect(feedback.action()?.label).toBe('View list');
  });

  it('requires an inline confirmation before saving the same recipe selection again', async () => {
    duplicate = true;
    const host = await fixture();
    host.componentInstance.selectAll();
    await host.componentInstance.submit();
    host.detectChanges();
    expect(saved).toEqual([]);
    expect(host.nativeElement.querySelectorAll('dialog')).toHaveLength(1);
    expect(host.nativeElement.textContent).toContain('Add another batch?');
    await host.componentInstance.submit(true);
    expect(saved).toEqual([{ servings: 8, indices: [0, 1, 2], again: true }]);
  });

  it('keeps the selected ingredients when saving fails', async () => {
    const host = await fixture();
    host.componentInstance.selectAll();
    host.detectChanges();
    error = true;
    const inputs = host.nativeElement.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    inputs[1].click();
    host.detectChanges();
    await host.componentInstance.submit();
    host.detectChanges();
    expect(host.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not save',
    );
    expect(
      (host.nativeElement.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(host.nativeElement.querySelector('dialog').open).toBe(true);
  });

  it('searches recipes when no recipe was supplied and handles recipes without ingredients', async () => {
    const host = await fixture(null);
    expect(host.nativeElement.querySelector('input[type="search"]')).not.toBeNull();
    const choice = host.nativeElement.querySelector('.recipe-choice') as HTMLButtonElement;
    choice.click();
    host.detectChanges();
    expect(host.nativeElement.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    host.componentInstance.chooseRecipe({ ...recipe, ingredients: [] });
    host.detectChanges();
    expect(host.nativeElement.textContent).toContain('This recipe has no ingredients');
    expect((host.nativeElement.querySelector('.add-selected') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('closes without submitting a previous account recipe after an account change', async () => {
    const host = await fixture();
    let closed = 0;
    host.componentInstance.closed.subscribe(() => closed++);
    accountVersion.set(1);
    host.detectChanges();
    await host.componentInstance.submit();
    expect(closed).toBe(1);
    expect(saved).toEqual([]);
  });

  it('suppresses stale success feedback when the picker closes during a pending save', async () => {
    let finish!: (count: number) => void;
    waitForSave = () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      });
    const host = await fixture();
    host.componentInstance.selectAll();
    const pending = host.componentInstance.submit();
    host.componentInstance.close();
    finish(3);
    await pending;
    expect(feedback.message()).toBe('');
  });

  it('starts each new picker view at the top after search, recipe, and confirmation changes', async () => {
    const host = await fixture(null);
    const body = host.nativeElement.querySelector('.picker-body') as HTMLElement;
    body.scrollTop = 360;
    host.componentInstance.chooseRecipe(recipe);
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(0);

    body.scrollTop = 240;
    duplicate = true;
    host.componentInstance.selectAll();
    await host.componentInstance.submit();
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(0);

    body.scrollTop = 100;
    host.componentInstance.cancelConfirmation();
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(0);

    body.scrollTop = 200;
    host.componentInstance.changeRecipe();
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(0);
  });

  it('keeps the ingredient reading position when selecting items or changing servings', async () => {
    const host = await fixture();
    const body = host.nativeElement.querySelector('.picker-body') as HTMLElement;
    body.scrollTop = 180;
    host.componentInstance.toggle(1);
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(180);
    host.componentInstance.changeServings('6');
    host.detectChanges();
    await host.whenStable();
    expect(body.scrollTop).toBe(180);
  });
});
