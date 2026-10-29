import { IconComponent } from './icon';
import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Recipe } from '../../core/models/recipe.model';
import type { RecipeCollection } from '../../core/models/recipe-collection.model';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { CookingSessionService } from '../../core/services/cooking-session.service';
import { CheckboxMarkComponent } from './checkbox-mark';
import { motionMs } from '../../core/motion';
import { recipeBackground } from '../../core/models/recipe-color';
import { msg, t, TranslatePipe } from '../../core/i18n/i18n';

@Component({
  selector: 'app-recipe-actions',
  host: {
    '(window:resize)': 'actions.menu.set(null)',
    '(window:scroll)': 'actions.menu.set(null)',
  },
  imports: [CheckboxMarkComponent, IconComponent, TranslatePipe],
  template: `
    <span id="recipe-actions-hint" class="sr-only">{{
      'Hold a recipe or right-click for actions. With a keyboard, press Shift F10.' | t
    }}</span>
    <div
      #menu
      id="recipe-actions-menu"
      popover
      class="recipe-context-menu glass-menu"
      [style.left.px]="menuLeft()"
      [style.top.px]="menuTop()"
      role="menu"
      [attr.aria-label]="'Recipe actions' | t"
      (beforetoggle)="menuToggle($event)"
      (keydown)="menuKey($event)"
    >
      @if (actions.menu(); as selected) {
        @if (!selected.fromDetail) {
          <p>{{ selected.recipe.title }}</p>
          <button type="button" role="menuitem" (click)="changeCategories()">
            <app-icon name="category" />{{ 'Change categories' | t }}
          </button>
        }
        <button type="button" role="menuitem" (click)="edit()">
          <app-icon name="pencil" />{{ 'Edit recipe' | t }}
        </button>
        <button type="button" role="menuitem" class="remove-recipe" (click)="requestDelete()">
          <app-icon name="trash" />{{ 'Delete recipe' | t }}
        </button>
      }
    </div>
    <dialog
      #categoriesDialog
      class="categories-dialog"
      aria-labelledby="recipe-categories-title"
      (cancel)="cancelCategories($event)"
      (close)="closedCategories()"
    >
      <h2 id="recipe-categories-title">{{ 'Recipe categories' | t }}</h2>
      @if (categoryRecipe(); as recipe) {
        <p>{{ recipe.title }}</p>
      }
      @if (loadingCategories()) {
        <p role="status">{{ 'Loading categories…' | t }}</p>
      } @else {
        <div class="category-choices">
          @for (category of collections(); track category.id) {
            <label class="check-control"
              ><input
                type="checkbox"
                [checked]="selectedCategories().has(category.id)"
                (change)="toggleCategory(category.id)"
                [disabled]="savingCategories()"
              />
              <app-checkbox-mark />{{ category.name }}</label
            >
          } @empty {
            <p>{{ 'No categories yet. Create them from Manage categories.' | t }}</p>
          }
        </div>
      }
      @if (categoryError()) {
        <p role="alert">{{ categoryError() | t }}</p>
      }
      <div class="dialog-actions">
        <button type="button" [disabled]="savingCategories()" (click)="categoryRecipe.set(null)">
          {{ 'Cancel' | t }}
        </button>
        <button
          type="button"
          class="primary"
          [disabled]="savingCategories() || loadingCategories() || !categoriesReady()"
          (click)="saveCategories()"
        >
          {{ (savingCategories() ? 'Saving…' : 'Save') | t }}
        </button>
      </div>
    </dialog>
    <dialog
      #deleteDialog
      class="delete-dialog"
      aria-labelledby="recipe-delete-title"
      aria-describedby="recipe-delete-copy"
      (cancel)="cancelDelete($event)"
      (close)="closedDelete()"
    >
      @if (actions.deletion(); as request) {
        <!-- The recipe as a small torn-out page; on delete it crumples and is tossed. -->
        <div
          class="doomed-page"
          aria-hidden="true"
          [class.is-crumpling]="deleteSucceeded()"
          [style.--page-color]="pageColor(request.recipe)"
        >
          <span class="doomed-title">{{ request.recipe.title }}</span>
          <span class="doomed-lines"><span></span><span></span><span></span></span>
        </div>
      }
      <h2 id="recipe-delete-title">
        {{ (deleteSucceeded() ? 'Recipe deleted' : 'Delete recipe?') | t }}
      </h2>
      <p id="recipe-delete-copy" aria-live="polite">
        {{
          deleteSucceeded()
            ? ('Returning to your recipes…' | t)
            : ('“{recipe}” will be removed from your cookbook. You can undo right after.'
              | t: { recipe: actions.deletion()?.recipe?.title ?? '' })
        }}
      </p>
      @if (deleteError()) {
        <p role="alert">{{ deleteError() | t }}</p>
      }
      <div class="dialog-actions" [class.is-done]="deleteSucceeded()">
        <button
          type="button"
          autofocus
          [disabled]="deleting()"
          (click)="actions.deletion.set(null)"
        >
          {{ 'Keep' | t }}
        </button>
        <button
          type="button"
          class="delete-button"
          [disabled]="deleting()"
          [attr.aria-busy]="deleting()"
          (click)="deleteRecipe()"
        >
          {{ 'Delete' | t }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .recipe-context-menu {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 8px;
      width: min(260px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow: auto;
      border: 1px solid var(--color-border);
    }
    .recipe-context-menu p {
      margin: 4px 12px 8px;
      max-height: 3em;
      overflow: hidden;
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .recipe-context-menu button {
      display: flex;
      width: 100%;
      justify-content: flex-start;
      border: 0;
      padding: 10px 12px;
      background: transparent;
    }
    .remove-recipe {
      color: var(--color-danger);
    }
    dialog {
      width: min(440px, calc(100vw - 32px));
      padding: 28px;
      border: 1px solid var(--color-border);
      border-radius: 14px;
      background: var(--color-surface);
      color: var(--color-ink);
    }
    dialog::backdrop {
      background: #14141355;
      backdrop-filter: blur(4px);
    }
    dialog h2 {
      font-size: 1.6rem;
    }
    dialog p {
      color: var(--color-muted);
    }
    .dialog-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .dialog-actions button {
      flex: 1;
    }
    .category-choices {
      max-height: min(380px, 50dvh);
      overflow: auto;
    }
    .category-choices label {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
      font-weight: 400;
    }
    .delete-dialog {
      text-align: center;
    }
    .delete-dialog h2 {
      margin: 20px 0 8px;
    }
    .delete-dialog p {
      margin: 0;
    }
    .delete-dialog .dialog-actions {
      transition: opacity var(--motion-fast) var(--motion-ease-standard);
    }
    .delete-dialog .dialog-actions.is-done {
      opacity: 0;
      pointer-events: none;
    }
    .delete-dialog .delete-button {
      background: var(--color-danger);
      border-color: var(--color-danger);
      color: var(--color-surface);
    }
    .doomed-page {
      --page-ink: color-mix(in srgb, var(--page-color) 45%, var(--color-ink));
      position: relative;
      display: grid;
      align-content: start;
      gap: 12px;
      width: 132px;
      height: 156px;
      margin: 4px auto 0;
      padding: 18px 16px;
      border: 1px solid var(--page-ink);
      border-radius: 10px 10px 3px 3px;
      background: var(--page-color);
      rotate: -4deg;
      text-align: left;
      box-shadow: 0 10px 20px #14141314;
    }
    .doomed-title {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      font:
        400 1.05rem/1.2 Georgia,
        'Times New Roman',
        serif;
      overflow-wrap: anywhere;
    }
    .doomed-lines {
      display: grid;
      gap: 7px;
    }
    .doomed-lines span {
      height: 3px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--page-ink) 35%, transparent);
    }
    .doomed-lines span:nth-child(2) {
      width: 80%;
    }
    .doomed-lines span:nth-child(3) {
      width: 55%;
    }
    /* Crumple: lift, squeeze into a ball with creases, hop once and drop out of the sheet. */
    .doomed-page::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background:
        linear-gradient(35deg, transparent 46%, #14141326 48%, transparent 52%),
        linear-gradient(-50deg, transparent 40%, #1414131f 43%, transparent 47%),
        linear-gradient(80deg, transparent 58%, #1414131a 60%, transparent 63%);
      opacity: 0;
    }
    .doomed-page.is-crumpling {
      animation: page-crumple calc(1000ms * var(--motion-scale)) linear both;
    }
    .doomed-page.is-crumpling > span {
      animation: page-text-out calc(300ms * var(--motion-scale)) var(--motion-ease-standard) both;
    }
    .doomed-page.is-crumpling::after {
      animation: page-creases calc(1000ms * var(--motion-scale)) linear both;
    }
    @keyframes page-crumple {
      0% {
        transform: none;
        animation-timing-function: var(--motion-ease-out);
      }
      14% {
        transform: translateY(-6px) scale(1.04) rotate(-3deg);
        animation-timing-function: cubic-bezier(0.5, 0, 0.3, 1);
      }
      46% {
        transform: scale(0.42, 0.36) rotate(70deg);
        opacity: 1;
        border-radius: 44% 56% 40% 60% / 58% 42% 56% 44%;
        animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
      }
      62% {
        transform: translateY(-22px) scale(0.36) rotate(150deg);
        border-radius: 48% 52% 42% 58% / 55% 45% 58% 42%;
        opacity: 1;
        animation-timing-function: cubic-bezier(0.55, 0, 0.9, 0.4);
      }
      100% {
        transform: translate(90px, 150px) scale(0.3) rotate(320deg);
        border-radius: 48% 52% 42% 58% / 55% 45% 58% 42%;
        opacity: 0;
      }
    }
    @keyframes page-creases {
      30%,
      100% {
        opacity: 1;
      }
    }
    @keyframes page-text-out {
      to {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .doomed-page.is-crumpling {
        animation: none;
        opacity: 0;
      }
    }
  `,
})
export class RecipeActionsOverlayComponent {
  readonly actions = inject(RecipeActionsService);
  private recipes = inject(RecipeService);
  private router = inject(Router);
  private feedback = inject(FeedbackService);
  private sessions = inject(CookingSessionService);
  menu = viewChild<ElementRef<HTMLDivElement>>('menu');
  categoriesDialog = viewChild<ElementRef<HTMLDialogElement>>('categoriesDialog');
  deleteDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteDialog');
  menuLeft = signal(16);
  menuTop = signal(16);
  categoryRecipe = signal<Recipe | null>(null);
  collections = signal<RecipeCollection[]>([]);
  selectedCategories = signal<Set<string>>(new Set());
  categoriesReady = signal(false);
  loadingCategories = signal(false);
  savingCategories = signal(false);
  categoryError = signal('');
  deleting = signal(false);
  deleteSucceeded = signal(false);
  deleteError = signal('');
  private categoryVersion = 0;
  private categoryRequest = 0;
  private focusOrigin?: HTMLElement;
  private focusVersion = 0;
  private transferringFocus = false;
  private destroyed = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    let account = this.recipes.accountVersion();
    effect(() => {
      const current = this.recipes.accountVersion();
      if (current !== account) {
        account = current;
        this.categoryRecipe.set(null);
      }
    });
    effect(() => {
      const selected = this.actions.menu(),
        menu = this.menu()?.nativeElement;
      if (!menu) return;
      if (selected) {
        this.focusOrigin = selected.trigger;
        this.focusVersion = this.recipes.accountVersion();
        this.menuLeft.set(
          Math.max(16, Math.min(selected.x, innerWidth - Math.min(260, innerWidth - 32) - 16)),
        );
        this.menuTop.set(Math.max(16, Math.min(selected.y, innerHeight - 200)));
        if (!menu.matches(':popover-open')) menu.showPopover();
        if (selected.pointerId !== undefined) {
          // Touch initially captures on the card. Retarget its release to the menu so
          // native light-dismiss cannot close it, and the release cannot click an action.
          try {
            menu.setPointerCapture(selected.pointerId);
          } catch (error) {
            // A fast release can precede this render; there is then no pointer to capture.
            if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
          }
        }
        requestAnimationFrame(() => {
          if (this.actions.menu() === selected) {
            const bounds = menu.getBoundingClientRect();
            this.menuLeft.set(Math.max(16, Math.min(selected.x, innerWidth - bounds.width - 16)));
            this.menuTop.set(Math.max(16, Math.min(selected.y, innerHeight - bounds.height - 16)));
            menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
          }
        });
      } else if (menu.matches(':popover-open')) menu.hidePopover();
    });
    effect(() => {
      const recipe = this.categoryRecipe(),
        dialog = this.categoriesDialog()?.nativeElement;
      if (!dialog) return;
      if (recipe && !dialog.open) dialog.showModal();
      else if (!recipe && dialog.open) dialog.close();
    });
    effect(() => {
      const request = this.actions.deletion(),
        dialog = this.deleteDialog()?.nativeElement;
      if (!dialog) return;
      if (request && !dialog.open) {
        this.deleteSucceeded.set(false);
        this.deleteError.set('');
        this.deleting.set(false);
        dialog.showModal();
      } else if (!request && dialog.open) dialog.close();
    });
  }
  menuToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'closed') {
      this.actions.menu.set(null);
      if (!this.transferringFocus) this.restoreFocus();
      this.transferringFocus = false;
    }
  }
  menuKey(event: KeyboardEvent): void {
    const buttons = Array.from(
      this.menu()?.nativeElement.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  }
  edit(): void {
    const recipe = this.actions.menu()?.recipe;
    if (!recipe) return;
    this.transferringFocus = true;
    this.actions.menu.set(null);
    void this.router.navigate(['/recipes', recipe.id, 'edit']);
  }
  requestDelete(): void {
    const selected = this.actions.menu();
    if (selected) {
      this.transferringFocus = true;
      this.actions.delete(selected.recipe, selected.afterDelete);
    }
  }
  async changeCategories(): Promise<void> {
    const recipe = this.actions.menu()?.recipe;
    if (!recipe) return;
    this.transferringFocus = true;
    this.actions.menu.set(null);
    const version = (this.categoryVersion = this.recipes.accountVersion());
    const load = ++this.categoryRequest;
    this.savingCategories.set(false);
    this.categoryError.set('');
    this.collections.set([]);
    this.categoriesReady.set(false);
    this.loadingCategories.set(true);
    this.selectedCategories.set(new Set(recipe.collectionIds ?? []));
    this.categoryRecipe.set(recipe);
    try {
      const collections = await this.recipes.getCollections();
      if (
        this.recipes.accountVersion() === version &&
        this.categoryRecipe()?.id === recipe.id &&
        load === this.categoryRequest
      ) {
        this.collections.set(collections);
        this.categoriesReady.set(true);
      }
    } catch {
      if (this.recipes.accountVersion() === version && load === this.categoryRequest)
        this.categoryError.set(msg('Could not load categories. Close this window and try again.'));
    } finally {
      if (this.recipes.accountVersion() === version && load === this.categoryRequest)
        this.loadingCategories.set(false);
    }
  }
  toggleCategory(id: string): void {
    this.selectedCategories.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  private restoreFocus(): void {
    const origin = this.focusOrigin;
    if (origin?.isConnected && this.focusVersion === this.recipes.accountVersion())
      queueMicrotask(() => {
        if (origin.isConnected) origin.focus({ preventScroll: true });
      });
  }
  closedCategories(): void {
    this.categoryRequest++;
    this.categoryRecipe.set(null);
    this.restoreFocus();
  }
  cancelCategories(event: Event): void {
    if (this.savingCategories()) event.preventDefault();
    else this.categoryRecipe.set(null);
  }
  async saveCategories(): Promise<void> {
    const recipe = this.categoryRecipe(),
      version = this.categoryVersion,
      request = this.categoryRequest;
    if (!recipe || this.savingCategories() || version !== this.recipes.accountVersion()) return;
    this.savingCategories.set(true);
    this.categoryError.set('');
    try {
      await this.recipes.updateRecipe(recipe.id, {
        collectionIds: [...this.selectedCategories()].filter((id) =>
          this.collections().some((c) => c.id === id),
        ),
      });
      if (version === this.recipes.accountVersion()) {
        this.categoryRecipe.set(null);
        this.feedback.show(t('Categories updated'));
      }
    } catch {
      if (version === this.recipes.accountVersion())
        this.categoryError.set(msg('Could not save categories. Please try again.'));
    } finally {
      if (version === this.recipes.accountVersion() && request === this.categoryRequest)
        this.savingCategories.set(false);
    }
  }
  pageColor(recipe: Recipe): string {
    return recipeBackground(recipe);
  }
  closedDelete(): void {
    if (!this.deleteSucceeded()) {
      this.actions.deletion.set(null);
      this.restoreFocus();
    }
  }
  cancelDelete(event: Event): void {
    if (this.deleting()) event.preventDefault();
    else this.actions.deletion.set(null);
  }
  async deleteRecipe(): Promise<void> {
    const request = this.actions.deletion();
    if (!request || this.deleting()) return;
    const version = this.recipes.accountVersion(),
      progress = this.sessions.read(request.recipe.id);
    this.deleting.set(true);
    this.deleteError.set('');
    try {
      const restore = await this.recipes.deleteWithUndo(request.recipe.id);
      if (version !== this.recipes.accountVersion() || this.destroyed) return;
      this.sessions.clear(request.recipe.id);
      this.deleteSucceeded.set(true);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        await new Promise<void>((resolve) => setTimeout(resolve, motionMs(1000)));
      if (version !== this.recipes.accountVersion() || this.destroyed) return;
      this.actions.deletion.set(null);
      await request.afterDelete?.();
      if (version !== this.recipes.accountVersion()) return;
      this.feedback.show(t('Recipe deleted'), {
        label: t('Undo'),
        pendingLabel: t('Restoring…'),
        successMessage: t('Recipe restored'),
        errorMessage: t('Could not restore the recipe. Try Undo again.'),
        run: async () => {
          await restore();
          if (progress && version === this.recipes.accountVersion())
            this.sessions.save(request.recipe.id, progress);
        },
      });
    } catch {
      if (version === this.recipes.accountVersion())
        this.deleteError.set(msg('Could not delete the recipe. Please try again.'));
    } finally {
      if (
        version === this.recipes.accountVersion() &&
        (!this.actions.deletion() || this.actions.deletion() === request)
      )
        this.deleting.set(false);
    }
  }
}
