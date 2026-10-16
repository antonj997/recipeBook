import { Service, effect, inject, signal } from '@angular/core';
import type { Recipe } from '../models/recipe.model';
import { RecipeService } from './recipe.service';

export interface RecipeMenu {
  recipe: Recipe;
  x: number;
  y: number;
  trigger: HTMLElement;
  /** The finger that opened the menu and has not been released yet. */
  pointerId?: number;
  fromDetail?: boolean;
  afterDelete?: () => Promise<unknown>;
}
export interface RecipeDeleteRequest {
  recipe: Recipe;
  afterDelete?: () => Promise<unknown>;
}
@Service()
export class RecipeActionsService {
  menu = signal<RecipeMenu | null>(null);
  deletion = signal<RecipeDeleteRequest | null>(null);
  private recipes = inject(RecipeService);
  constructor() {
    let version = this.recipes.accountVersion();
    effect(() => {
      const current = this.recipes.accountVersion();
      if (current !== version) {
        version = current;
        this.menu.set(null);
        this.deletion.set(null);
      }
    });
  }
  open(recipe: Recipe, x: number, y: number, trigger: HTMLElement, pointerId?: number): void {
    this.menu.set({ recipe, x, y, trigger, pointerId });
  }
  openDetails(recipe: Recipe, trigger: HTMLElement, afterDelete: () => Promise<unknown>): void {
    if (this.menu()?.trigger === trigger) {
      this.menu.set(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    this.menu.set({
      recipe,
      trigger,
      x: rect.right - 260,
      y: rect.bottom + 8,
      fromDetail: true,
      afterDelete,
    });
  }
  delete(recipe: Recipe, afterDelete?: () => Promise<unknown>): void {
    this.menu.set(null);
    this.deletion.set({ recipe, afterDelete });
  }
}
