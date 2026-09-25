import { IconComponent } from '../../../shared/components/icon';
import { Component, inject, signal } from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import type { Recipe } from '../../../core/models/recipe.model';
type RecipeImportDraft = Omit<Recipe, 'id'> & { imageUrl?: string };

import { LoadingStateComponent } from '../../../shared/components/loading-state';

@Component({
  selector: 'app-recipe-import',
  imports: [IconComponent, RouterLink, LoadingStateComponent],
  templateUrl: './recipe-import.html',
  styleUrl: './recipe-import.scss',
})
export class RecipeImportComponent {
  private router = inject(Router);

  url = '';

  importing = signal(false);
  error = signal('');

  async importRecipe(event: Event): Promise<void> {
    event.preventDefault();

    if (this.importing() || !this.url.trim()) {
      return;
    }

    this.importing.set(true);
    this.error.set('');

    try {
      // Ask our backend to extract the recipe.
      const response = await fetch('/api/import', {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          url: this.url.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not import recipe.');
      }

      const draft = data as RecipeImportDraft;

      // Temporarily store the extracted recipe.
      sessionStorage.setItem('recipiebook:import-draft', JSON.stringify(draft));

      // Open the existing recipe form for review.
      await this.router.navigate(['/recipes/new'], {
        queryParams: {
          import: '1',
        },
      });
    } catch (error) {
      console.error('Import failed:', error);

      this.error.set(error instanceof Error ? error.message : 'Could not import the recipe.');
    } finally {
      this.importing.set(false);
    }
  }
}
