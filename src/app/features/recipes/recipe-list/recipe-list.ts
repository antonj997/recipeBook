import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { Component, computed, inject, effect, signal } from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import type { Recipe } from '../../../core/models/recipe.model';

import { RecipeService } from '../../../core/services/recipe.service';
import { CloudCookbookService } from '../../../core/services/cloud-cookbook.service';

import { RecipeRailComponent } from '../../../shared/components/recipe-rail';

import { IconComponent } from '../../../shared/components/icon';
import { FoodDoodleComponent } from '../../../shared/components/food-doodle';
import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-list',
  imports: [
    RecipeRailComponent,
    RouterLink,
    IconComponent,
    FoodDoodleComponent,
    LoadingStateComponent,
  ],
  templateUrl: './recipe-list.html',
  styleUrl: './recipe-list.scss',
})
export class RecipeListComponent {
  private recipeService = inject(RecipeService);
  private router = inject(Router);
  readonly cloud = inject(CloudCookbookService);

  recipes = signal<Recipe[]>([]);
  query = signal('');
  collections = signal<RecipeCollection[]>([]);
  selectedCollectionId = signal('');
  categoryTitle = computed(
    () =>
      this.collections().find((collection) => collection.id === this.selectedCollectionId())
        ?.name ?? 'All recipes',
  );
  onCategoryChange(event: Event): void {
    const picker = event.target as HTMLSelectElement;
    if (picker.value === 'manage-categories') {
      picker.value = this.selectedCollectionId();
      void this.router.navigate(['/settings'], { fragment: 'categories' });
    } else this.selectedCollectionId.set(picker.value);
  }
  // Filter the loaded recipes; the database and stored objects stay unchanged.
  filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const collectionId = this.selectedCollectionId();
    return this.recipes().filter((recipe) => {
      if (collectionId && !recipe.collectionIds?.includes(collectionId)) return false;
      const text = [
        recipe.title,
        ...(recipe.ingredients ?? []),
        ...(recipe.tags ?? []),
        ...(recipe.tagIds ?? []),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  });
  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  loading = signal(true);
  error = signal('');

  private loadVersion = 0;
  constructor() {
    let accountVersion = this.recipeService.accountVersion();
    effect(() => {
      const current = this.recipeService.accountVersion();
      if (current !== accountVersion) {
        accountVersion = current;
        this.recipes.set([]);
        this.collections.set([]);
        this.query.set('');
        this.selectedCollectionId.set('');
        this.loading.set(true);
      }
      this.recipeService.revision();
      void this.loadRecipes();
    });
  }

  private async loadRecipes(): Promise<void> {
    const version = ++this.loadVersion;
    const accountVersion = this.recipeService.accountVersion();
    this.error.set('');
    try {
      const [result, collections] = await Promise.all([
        this.recipeService.getRecipes(),
        this.recipeService.getCollections(),
      ]);
      if (version !== this.loadVersion || accountVersion !== this.recipeService.accountVersion())
        return;
      this.collections.set(collections);
      if (!collections.some((collection) => collection.id === this.selectedCollectionId()))
        this.selectedCollectionId.set('');

      this.recipes.set(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);

      if (version === this.loadVersion) this.error.set('Could not load your recipes.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
}
