import { LibraryViewToggleComponent } from '../../../shared/components/library-view-toggle';
import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  effect,
  signal,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Recipe } from '../../../core/models/recipe.model';
import { formatRecipeTime } from '../../../core/models/recipe-metadata';
import { RecipeService } from '../../../core/services/recipe.service';
import { CloudCookbookService } from '../../../core/services/cloud-cookbook.service';
import { LibraryViewService } from '../../../core/services/library-view.service';
import { RecipeRailComponent } from '../../../shared/components/recipe-rail';
import {
  FoodPlaceholderComponent,
  photoCardBackground,
} from '../../../shared/components/food-placeholder';
import { IconComponent } from '../../../shared/components/icon';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-list',
  imports: [
    LibraryViewToggleComponent,
    NgTemplateOutlet,
    RecipeRailComponent,
    RouterLink,
    IconComponent,
    FoodDoodleComponent,
    LoadingStateComponent,
    FoodPlaceholderComponent,
  ],
  templateUrl: './recipe-list.html',
  styleUrl: './recipe-list.scss',
})
export class RecipeListComponent {
  private recipeService = inject(RecipeService);
  private router = inject(Router);
  private library = inject(LibraryViewService);
  readonly cloud = inject(CloudCookbookService);
  private initial = this.library.read();
  formatTime = formatRecipeTime;
  photoBackground = photoCardBackground;
  recipes = signal<Recipe[]>([]);
  query = signal(this.initial.query);
  collections = signal<RecipeCollection[]>([]);
  selectedCollectionId = signal(this.initial.categoryId);
  view = signal(this.initial.view);
  restoreRecipeId = signal(this.initial.recipeId);
  categoryTitle = computed(
    () =>
      this.collections().find((c) => c.id === this.selectedCollectionId())?.name ?? 'All recipes',
  );
  filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const collectionId = this.selectedCollectionId();
    return this.recipes().filter((recipe) => {
      if (collectionId && !recipe.collectionIds?.includes(collectionId)) return false;
      const text = [
        recipe.title,
        ...recipe.ingredients,
        ...(recipe.tags ?? []),
        ...(recipe.tagIds ?? []),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  });
  loading = signal(true);
  error = signal('');
  private loadVersion = 0;
  private listRows = viewChildren<ElementRef<HTMLAnchorElement>>('listRow');
  // Restore a row only when returning to the library, never when switching views.
  private pendingListRestoreId = signal(this.initial.view === 'list' ? this.initial.recipeId : '');

  constructor() {
    afterRenderEffect(() => {
      const id = this.pendingListRestoreId();
      const rows = this.listRows();
      if (this.view() !== 'list' || !id) return;
      const row = rows.find((item) => item.nativeElement.dataset['recipeId'] === id)?.nativeElement;
      if (!row) return;
      this.pendingListRestoreId.set('');
      const bounds = row.getBoundingClientRect();
      if (bounds.top < 80 || bounds.bottom > window.innerHeight)
        row.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    let accountVersion = this.recipeService.accountVersion();
    effect(() => {
      const current = this.recipeService.accountVersion();
      if (current !== accountVersion) {
        accountVersion = current;
        const saved = this.library.read();
        this.pendingListRestoreId.set(saved.view === 'list' ? saved.recipeId : '');
        this.recipes.set([]);
        this.collections.set([]);
        this.query.set(saved.query);
        this.selectedCollectionId.set(saved.categoryId);
        this.view.set(saved.view);
        this.restoreRecipeId.set(saved.recipeId);
        this.loading.set(true);
      }
      this.recipeService.revision();
      void this.loadRecipes();
    });
  }
  onCategoryChange(event: Event): void {
    const picker = event.target as HTMLSelectElement;
    if (picker.value === 'manage-categories') {
      picker.value = this.selectedCollectionId();
      void this.router.navigate(['/categories']);
    } else {
      this.selectedCollectionId.set(picker.value);
      this.restoreRecipeId.set('');
      this.library.write({ categoryId: picker.value, recipeId: '' });
    }
  }
  search(query: string): void {
    this.query.set(query);
    this.restoreRecipeId.set('');
    this.library.write({ query, recipeId: '' });
  }
  onSearch(event: Event): void {
    this.search((event.target as HTMLInputElement).value);
  }
  showAll(): void {
    this.selectedCollectionId.set('');
    this.restoreRecipeId.set('');
    this.library.write({ categoryId: '', recipeId: '' });
  }
  setView(view: 'shelf' | 'list'): void {
    this.pendingListRestoreId.set('');
    this.restoreRecipeId.set(this.library.read().recipeId);
    this.view.set(view);
    this.library.write({ view });
  }
  rememberRecipe(id: string): void {
    this.library.write({ recipeId: id });
  }
  private async loadRecipes(): Promise<void> {
    const version = ++this.loadVersion;
    const account = this.recipeService.accountVersion();
    this.error.set('');
    try {
      const [recipes, collections] = await Promise.all([
        this.recipeService.getRecipes(),
        this.recipeService.getCollections(),
      ]);
      if (version !== this.loadVersion || account !== this.recipeService.accountVersion()) return;
      this.collections.set(collections);
      if (!collections.some((c) => c.id === this.selectedCollectionId())) {
        this.selectedCollectionId.set('');
        this.library.write({ categoryId: '' });
      }
      this.recipes.set(recipes);
    } catch {
      if (version === this.loadVersion) this.error.set('Could not load your recipes.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
}
