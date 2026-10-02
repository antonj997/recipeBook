import { SupabaseService } from '../../../core/services/supabase.service';
import { runtimeConfig } from '../../../core/runtime-config';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { RecipeService } from '../../../core/services/recipe.service';
import { IconComponent } from '../../../shared/components/icon';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  readonly auth = inject(SupabaseService);
  readonly localOnly = computed(() => runtimeConfig.pages && !this.auth.configured());
  readonly needsSignIn = computed(() => this.auth.configured() && !this.auth.user());
  // This tab's link survives the sign-in detour; no account data or credentials are stored here.
  private readonly urlKey = 'recipebook:import-url:' + this.auth.cacheScope;
  url = '';
  importing = signal(false);
  error = signal('');
  notice = signal('');

  constructor() {
    try {
      this.url = sessionStorage.getItem(this.urlKey) ?? '';
    } catch {
      /* Optional continuity. */
    }
    this.destroyRef.onDestroy(() => {
      this.active = false;
      this.controller?.abort();
    });
  }
  updateUrl(event: Event): void {
    this.url = (event.target as HTMLInputElement).value;
    this.rememberUrl();
  }
  rememberUrl(): void {
    try {
      sessionStorage.setItem(this.urlKey, this.url);
    } catch {
      /* Keep the visible link. */
    }
  }
  cancelImport(): void {
    this.controller?.abort();
    this.importing.set(false);
    this.ready.set(false);
    this.notice.set('Import cancelled. Your link is still here.');
    queueMicrotask(() => document.getElementById('recipe-url')?.focus());
  }

  async importRecipe(event: Event): Promise<void> {
    event.preventDefault();
    if (this.localOnly() || this.needsSignIn() || this.importing() || !this.url.trim()) return;
    this.rememberUrl();
    this.importing.set(true);
    this.error.set('');
    this.notice.set('');
    this.ready.set(false);
    const controller = new AbortController();
    this.controller = controller;
    const accountVersion = this.auth.accountVersion();
    const current = () =>
      this.active &&
      !controller.signal.aborted &&
      this.controller === controller &&
      this.auth.accountVersion() === accountVersion;

    try {
      let draft: unknown;
      if (this.auth.configured()) {
        const response = await this.auth.invokeImporter(
          { url: this.url.trim() },
          controller.signal,
        );
        draft = await response.json();
      } else {
        const response = await fetch('/api/import', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: this.url.trim() }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not import recipe.');
        draft = data;
      }
      if (!current()) return;
      const prepared = await this.drafts.fromImport(draft, this.recipes, controller.signal);
      if (!current()) return;
      this.ready.set(true);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 450);
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
      if (!current()) return;
      this.drafts.set(prepared);
      try {
        sessionStorage.removeItem(this.urlKey);
      } catch {
        /* The draft remains usable. */
      }
      await this.router.navigate(['/recipes/new']);
    } catch (error) {
      if (!current()) return;
      console.error('Import failed:', error);
      this.error.set(error instanceof Error ? error.message : 'Could not import the recipe.');
    } finally {
      if (this.controller === controller) this.importing.set(false);
    }
  }
}
