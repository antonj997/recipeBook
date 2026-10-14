import { recipeBackground } from '../../../core/models/recipe-color';
import { RecipeContextDirective } from '../../../shared/components/recipe-context';
import { SelectMenuComponent } from '../../../shared/components/select-menu';
import { LibraryViewToggleComponent } from '../../../shared/components/library-view-toggle';
import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  effect,
  signal,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { LibraryPageData } from '../../../core/services/recipe-page-resolvers';
import { RecipeTransitionPartDirective } from '../../../shared/components/recipe-transition-part';
import type { Recipe } from '../../../core/models/recipe.model';
import { formatRecipeTime } from '../../../core/models/recipe-metadata';
import { RecipeService } from '../../../core/services/recipe.service';
import { CloudCookbookService } from '../../../core/services/cloud-cookbook.service';
import { LibraryViewService } from '../../../core/services/library-view.service';
import { RecipeRailComponent } from '../../../shared/components/recipe-rail';
import { FoodPlaceholderComponent } from '../../../shared/components/food-placeholder';
import { IconComponent } from '../../../shared/components/icon';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

type AddMenuOwner = 'toolbar' | 'shelf' | 'list';

@Component({
  selector: 'app-recipe-list',
  host: { '(window:resize)': 'onViewportResize()' },
  imports: [
    RecipeTransitionPartDirective,
    SelectMenuComponent,
    RecipeContextDirective,
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
export class RecipeListComponent implements OnDestroy {
  private recipeService = inject(RecipeService);
  private router = inject(Router);
  private library = inject(LibraryViewService);
  readonly cloud = inject(CloudCookbookService);
  private initial = this.library.read();
  private readonly resolvedData = inject(ActivatedRoute).snapshot.data['libraryPage'] as
    LibraryPageData | undefined;
  private readonly pageData =
    this.resolvedData?.accountVersion === this.recipeService.accountVersion()
      ? this.resolvedData
      : undefined;
  formatTime = formatRecipeTime;
  recipeBackground = recipeBackground;
  addMenuOwner = signal<AddMenuOwner | null>(null);
  private pendingAddMenuOwner: AddMenuOwner = 'toolbar';
  prepareAddMenu(owner: AddMenuOwner): void {
    this.pendingAddMenuOwner = owner;
  }
  onAddMenuToggle(event: Event): void {
    this.addMenuOwner.set(
      (event as ToggleEvent).newState === 'open' ? this.pendingAddMenuOwner : null,
    );
  }
  recipes = signal<Recipe[]>(this.pageData?.recipes ?? []);
  query = signal(this.initial.query);
  collections = signal<RecipeCollection[]>(this.pageData?.collections ?? []);
  categoryOptions = computed(() => [
    { value: '', label: 'All recipes' },
    ...this.collections().map((collection) => ({ value: collection.id, label: collection.name })),
    { value: 'manage-categories', label: 'Manage categories…', action: true },
  ]);
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
      const text = [recipe.title, ...recipe.ingredients].join(' ').toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  });
  loading = signal(!this.pageData);
  error = signal(this.pageData?.error ?? '');
  private loadVersion = 0;
  private viewportWidth = window.innerWidth;
  private portraitScrollFrame = 0;
  private portraitScrollTimer?: ReturnType<typeof setTimeout>;
  onViewportResize(): void {
    const previousWidth = this.viewportWidth;
    this.viewportWidth = window.innerWidth;
    // Width changes identify rotation; keyboard and browser-bar height changes stay untouched.
    if (this.viewportWidth >= previousWidth || this.viewportWidth > 600 || this.view() !== 'shelf')
      return;
    this.cancelPortraitScrollReset();
    this.portraitScrollFrame = requestAnimationFrame(() => {
      this.portraitScrollFrame = 0;
      this.restorePortraitScroll();
    });
    // Mobile browsers can restore the old offset after the initial layout pass.
    this.portraitScrollTimer = setTimeout(() => {
      this.portraitScrollTimer = undefined;
      this.restorePortraitScroll();
    }, 300);
  }
  private restorePortraitScroll(): void {
    if (
      this.view() === 'shelf' &&
      this.recipes().length &&
      window.innerWidth <= 600 &&
      window.innerHeight >= window.innerWidth
    )
      window.scrollTo({ top: 0, left: window.scrollX, behavior: 'instant' });
  }
  private cancelPortraitScrollReset(): void {
    cancelAnimationFrame(this.portraitScrollFrame);
    this.portraitScrollFrame = 0;
    clearTimeout(this.portraitScrollTimer);
    this.portraitScrollTimer = undefined;
  }
  ngOnDestroy(): void {
    this.cancelPortraitScrollReset();
  }
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
    if (
      this.pageData &&
      !this.pageData.collections.some((c) => c.id === this.selectedCollectionId())
    ) {
      this.selectedCollectionId.set('');
      this.library.write({ categoryId: '' });
    }
    let firstLoad = true;
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
      const revision = this.recipeService.revision();
      if (firstLoad) {
        firstLoad = false;
        if (this.pageData && revision === this.pageData.revision) return;
      }
      void this.loadRecipes();
    });
  }
  onCategoryChange(value: string): void {
    if (value === 'manage-categories') {
      void this.router.navigate(['/categories']);
    } else {
      this.selectedCollectionId.set(value);
      this.restoreRecipeId.set('');
      this.library.write({ categoryId: value, recipeId: '' });
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
