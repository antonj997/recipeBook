import type { RecipeCollection } from '../../../core/models/recipe-collection.model';
import { Component, computed, inject, effect, signal } from '@angular/core';

import { RouterLink } from '@angular/router';

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
  readonly cloud = inject(CloudCookbookService);

  recipes = signal<Recipe[]>([]);
  query = signal('');
  collections = signal<RecipeCollection[]>([]);
  collectionRails = computed(() =>
    this.collections()
      .map((collection) => ({
        ...collection,
        recipes: this.filteredRecipes().filter((recipe) =>
          recipe.collectionIds?.includes(collection.id),
        ),
      }))
      .filter((collection) => collection.recipes.length),
  );
  // Filter the loaded recipes; the database and stored objects stay unchanged.
  filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.recipes().filter((recipe) => {
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
    effect(() => {
      this.recipeService.revision();
      void this.loadRecipes();
    });
  }

  private async loadRecipes(): Promise<void> {
    const version = ++this.loadVersion;
    this.error.set('');
    try {
      const [result, collections] = await Promise.all([
        this.recipeService.getRecipes(),
        this.recipeService.getCollections(),
      ]);
      if (version !== this.loadVersion) return;
      this.collections.set(collections);

      this.recipes.set(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);

      if (version === this.loadVersion) this.error.set('Could not load your recipes.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
}
