import { Component, computed, inject, OnInit, signal } from '@angular/core';

import { RouterLink } from '@angular/router';

import type { Recipe } from '../../../core/models/recipe.model';

import { RecipeService } from '../../../core/services/recipe.service';

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
export class RecipeListComponent implements OnInit {
  private recipeService = inject(RecipeService);

  recipes = signal<Recipe[]>([]);
  query = signal('');
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

  ngOnInit(): void {
    void this.loadRecipes();
  }

  private async loadRecipes(): Promise<void> {
    try {
      const result = await this.recipeService.getRecipes();

      this.recipes.set(result);
    } catch (error) {
      console.error('Failed to load recipes:', error);

      this.error.set('Could not load your recipes.');
    } finally {
      this.loading.set(false);
    }
  }
}
