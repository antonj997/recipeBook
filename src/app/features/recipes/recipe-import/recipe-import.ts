import { runtimeConfig } from '../../../core/runtime-config';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { RecipeService } from '../../../core/services/recipe.service';
import { IconComponent } from '../../../shared/components/icon';
import { Component, DestroyRef, inject, signal } from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import type { Recipe } from '../../../core/models/recipe.model';
type RecipeImportDraft = Omit<Recipe, 'id'> & { imageUrl?: string };

import { ImportCookingComponent } from '../../../shared/components/import-cooking';

@Component({
  selector: 'app-recipe-import',
  imports: [IconComponent, RouterLink, ImportCookingComponent],
  templateUrl: './recipe-import.html',
  styleUrl: './recipe-import.scss',
})
export class RecipeImportComponent {
  private router = inject(Router);
  private drafts = inject(RecipeDraftService);
  private recipes = inject(RecipeService);
  private destroyRef = inject(DestroyRef);
  private controller?: AbortController;
  private active = true;
  ready = signal(false);
  readonly localOnly = runtimeConfig.pages;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.active = false;
      this.controller?.abort();
    });
  }

  updateUrl(event: Event): void {
    this.url = (event.target as HTMLInputElement).value;
  }

  url = '';

  importing = signal(false);
  error = signal('');

  async importRecipe(event: Event): Promise<void> {
    event.preventDefault();

    if (this.localOnly || this.importing() || !this.url.trim()) {
      return;
    }

    this.importing.set(true);
    this.error.set('');
    this.ready.set(false);
    this.controller = new AbortController();
    const started = performance.now();

    try {
      // Ask our backend to extract the recipe.
      const response = await fetch('/api/import', {
        method: 'POST',
        signal: this.controller.signal,

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
      const prepared = await this.drafts.fromImport(draft, this.recipes);
      if (!this.active) return;

      // Let one full cooking sequence play; slow imports keep cooking until extraction finishes.
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, 3000 - (performance.now() - started))),
      );
      if (!this.active) return;
      this.ready.set(true);
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      if (!this.active) return;

      this.drafts.set(prepared);
      await this.router.navigate(['/recipes/new']);
    } catch (error) {
      if (!this.active) return;
      console.error('Import failed:', error);

      this.error.set(error instanceof Error ? error.message : 'Could not import the recipe.');
    } finally {
      this.importing.set(false);
    }
  }
}
