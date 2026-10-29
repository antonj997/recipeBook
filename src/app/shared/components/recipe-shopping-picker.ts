import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  afterRenderEffect,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Recipe } from '../../core/models/recipe.model';
import { scaleIngredient } from '../../core/models/ingredient-quantity';
import { RecipeService } from '../../core/services/recipe.service';
import { RecipeImagesService } from '../../core/services/recipe-images.service';
import { hasPhoto } from '../../core/models/recipe-image';
import { ShoppingListService } from '../../core/services/shopping-list.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { BasketService } from '../../core/services/basket.service';
import { recipeBackground } from '../../core/models/recipe-color';
import { CheckboxMarkComponent } from './checkbox-mark';
import { FoodPlaceholderComponent } from './food-placeholder';
import { IconComponent } from './icon';
import { SelectMenuComponent } from './select-menu';
import { msg, plural, PluralPipe, t, TranslatePipe } from '../../core/i18n/i18n';

@Component({
  selector: 'app-recipe-shopping-picker',
  imports: [
    CheckboxMarkComponent,
    FoodPlaceholderComponent,
    IconComponent,
    SelectMenuComponent,
    TranslatePipe,
    PluralPipe,
  ],
  templateUrl: './recipe-shopping-picker.html',
  styleUrl: './recipe-shopping-picker.scss',
})
export class RecipeShoppingPickerComponent {
  readonly recipe = input<Recipe | null>(null);
  readonly servings = input<number | null>(null);
  readonly closed = output<void>();
  private readonly recipesService = inject(RecipeService);
  private readonly shopping = inject(ShoppingListService);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly basket = inject(BasketService);
  private readonly pickerBody = viewChild<ElementRef<HTMLDivElement>>('pickerBody');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly ingredientHeading =
    viewChild<ElementRef<HTMLHeadingElement>>('ingredientHeading');
  private readonly confirmHeading = viewChild<ElementRef<HTMLHeadingElement>>('confirmHeading');
  readonly selectedRecipe = signal<Recipe | null>(null);
  readonly recipes = signal<Recipe[]>([]);
  readonly query = signal('');
  readonly selected = signal<Set<number>>(new Set());
  readonly selectedServings = signal(4);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirming = signal(false);
  readonly failedPhotos = signal<Set<string>>(new Set());
  readonly hasPhoto = hasPhoto;
  private readonly images = inject(RecipeImagesService);
  photoUrl(recipe: Recipe): string | undefined {
    return this.images.peek(recipe, 'thumb');
  }
  readonly selectedCount = computed(() => this.selected().size);
  readonly baseServings = computed(() => this.validServings(this.selectedRecipe()?.servings) ?? 4);
  readonly servingOptions = computed(() =>
    [...new Set([2, 4, 6, 8, 10, this.baseServings(), this.selectedServings()])]
      .sort((a, b) => a - b)
      .map((count) => ({
        value: String(count),
        label: plural(count, '{n} serving', '{n} servings'),
      })),
  );
  readonly filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.recipes().filter((recipe) =>
      words.every((word) => recipe.title.toLocaleLowerCase().includes(word)),
    );
  });
  readonly ingredientGroups = computed(() => {
    const recipe = this.selectedRecipe();
    const groups: { section: string; ingredients: { index: number; text: string }[] }[] = [];
    recipe?.ingredients.forEach((text, index) => {
      const ingredient = {
        index,
        text: scaleIngredient(text, this.baseServings(), this.selectedServings()),
      };
      const section = recipe.ingredientSections?.[index] ?? '';
      const previous = groups.at(-1);
      if (previous?.section === section) previous.ingredients.push(ingredient);
      else groups.push({ section, ingredients: [ingredient] });
    });
    return groups;
  });
  private readonly account = this.shopping.accountVersion();
  private active = true;
  private finished = false;
  private loadedRecipes = false;
  private focusOrigin: HTMLElement | null = null;
  private backdropPressed = false;

  constructor() {
    effect(() => {
      const recipe = this.recipe();
      const servings = this.servings();
      untracked(() => {
        if (recipe) this.chooseRecipe(recipe, servings);
        else {
          this.selectedRecipe.set(null);
          void this.loadRecipes();
        }
      });
    });
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open && !this.finished) {
        this.focusOrigin =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
    });
    effect(() => {
      if (this.shopping.accountVersion() !== this.account) untracked(() => this.close());
    });
    effect(() => {
      if (this.confirming()) this.confirmHeading()?.nativeElement.focus({ preventScroll: true });
    });
    effect(() => {
      if (this.selectedRecipe() && !this.confirming())
        this.ingredientHeading()?.nativeElement.focus({ preventScroll: true });
      else if (!this.selectedRecipe())
        this.searchInput()?.nativeElement.focus({ preventScroll: true });
    });
    afterRenderEffect(() => {
      this.selectedRecipe();
      this.confirming();
      const body = this.pickerBody()?.nativeElement;
      if (body && this.active && !this.finished) body.scrollTop = 0;
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
      this.dialog()?.nativeElement.close();
      this.restoreFocus();
    });
  }

  private validServings(value: number | null | undefined): number | undefined {
    return value && Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  private current(): boolean {
    return this.active && !this.finished && this.account === this.shopping.accountVersion();
  }
  async loadRecipes(): Promise<void> {
    if (this.loadedRecipes || this.loading() || !this.current()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const recipes = await this.recipesService.getRecipes();
      if (!this.current()) return;
      this.recipes.set(recipes);
      void this.images.prepare(recipes, 'thumb');
      this.loadedRecipes = true;
    } catch {
      if (this.current()) this.error.set(msg('Could not load recipes. Try again.'));
    } finally {
      if (this.current()) this.loading.set(false);
    }
  }
  chooseRecipe(recipe: Recipe, servings: number | null = null): void {
    if (this.busy() || !this.current()) return;
    this.selectedRecipe.set(recipe);
    this.selectedServings.set(
      this.validServings(servings) ?? this.validServings(recipe.servings) ?? 4,
    );
    this.selected.set(new Set());
    this.confirming.set(false);
    this.error.set('');
  }
  changeRecipe(): void {
    if (this.busy()) return;
    this.selectedRecipe.set(null);
    this.query.set('');
    this.error.set('');
    this.confirming.set(false);
    void this.loadRecipes();
  }
  changeServings(value: string): void {
    const count = Number(value);
    if (!this.busy() && this.servingOptions().some((option) => option.value === value)) {
      this.selectedServings.set(count);
      this.confirming.set(false);
      this.error.set('');
    }
  }
  toggle(index: number): void {
    if (this.busy()) return;
    this.selected.update((current) => {
      const next = new Set(current);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
    this.confirming.set(false);
    this.error.set('');
  }
  selectAll(): void {
    if (this.busy()) return;
    this.selected.set(new Set(this.selectedRecipe()?.ingredients.map((_, index) => index) ?? []));
    this.confirming.set(false);
    this.error.set('');
  }
  deselectAll(): void {
    if (this.busy()) return;
    this.selected.set(new Set());
    this.confirming.set(false);
    this.error.set('');
  }
  cancelConfirmation(): void {
    this.confirming.set(false);
  }
  async submit(allowDuplicate = false): Promise<void> {
    const recipe = this.selectedRecipe();
    if (!this.current() || this.busy() || !recipe || !this.selectedCount()) return;
    const indices = [...this.selected()].sort((a, b) => a - b);
    const servings = this.selectedServings();
    if (!allowDuplicate && this.shopping.hasRecipeSelection(recipe, servings, indices)) {
      this.confirming.set(true);
      this.error.set('');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      // Measure before closing: the items fly from the button that added them.
      const button = this.dialog()?.nativeElement.querySelector<HTMLElement>('.add-selected');
      const count = await this.shopping.addRecipe(recipe, servings, indices, allowDuplicate);
      if (!this.current()) return;
      if (button?.isConnected)
        void this.basket.flyFrom(
          button.getBoundingClientRect(),
          count,
          `color-mix(in srgb, ${recipeBackground(recipe)} 52%, var(--color-ink))`,
        );
      const account = this.account;
      this.feedback.show(plural(count, '{n} item added', '{n} items added'), {
        label: t('View list'),
        run: async () => {
          if (account !== this.shopping.accountVersion()) return;
          this.close();
          await this.router.navigateByUrl('/shopping-list');
        },
      });
      this.close();
    } catch (error) {
      if (!this.current()) return;
      // i18n-ignore: compares the shopping list's English error key.
      if (error instanceof Error && error.message === 'These ingredients are already on your list.')
        this.confirming.set(true);
      else
        this.error.set(
          error instanceof Error
            ? error.message
            : msg('Could not add these ingredients. Try again.'),
        );
    } finally {
      if (this.active) this.busy.set(false);
    }
  }
  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  hidePhoto(id: string): void {
    this.failedPhotos.update((current) => new Set([...current, id]));
  }
  backdropStart(event: PointerEvent): void {
    this.backdropPressed = event.target === event.currentTarget;
  }
  backdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) this.close();
    this.backdropPressed = false;
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
  close(): void {
    if (this.finished) return;
    this.finished = true;
    this.dialog()?.nativeElement.close();
    this.closed.emit();
    this.restoreFocus();
  }
  private restoreFocus(): void {
    if (this.focusOrigin?.isConnected) this.focusOrigin.focus({ preventScroll: true });
  }
}
