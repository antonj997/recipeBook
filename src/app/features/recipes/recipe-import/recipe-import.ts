import { SupabaseService } from '../../../core/services/supabase.service';
import { runtimeConfig } from '../../../core/runtime-config';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { RecipeService } from '../../../core/services/recipe.service';
import { IconComponent } from '../../../shared/components/icon';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { parseRecipeText } from '../../../core/models/recipe-text';
import { ImportCookingComponent } from '../../../shared/components/import-cooking';
import { motionMs } from '../../../core/motion';
import { msg, TranslatePipe } from '../../../core/i18n/i18n';

@Component({
  selector: 'app-recipe-import',
  imports: [IconComponent, RouterLink, ImportCookingComponent, TranslatePipe],
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
  /** A recipe pasted or shared as plain text, imported without a link. */
  readonly text = signal('');
  readonly canPaste = typeof navigator.clipboard?.readText === 'function';
  importing = signal(false);
  error = signal('');
  notice = signal('');

  constructor() {
    try {
      this.url = sessionStorage.getItem(this.urlKey) ?? '';
    } catch {
      /* Optional continuity. */
    }
    // A link or text shared to the app, or a ?url= link, starts the import right away.
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const shared = query.get('url')?.trim();
    if (shared && isLink(shared)) {
      this.url = shared;
      queueMicrotask(() => void this.start());
    }
    this.text.set(query.get('text') ?? '');
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
    this.notice.set(msg('Import cancelled. Your link is still here.'));
    queueMicrotask(() => document.getElementById('recipe-url')?.focus());
  }

  /** A lone link pasted into the empty field imports at once. */
  pasteIntoField(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text/plain').trim() ?? '';
    if (this.url.trim() || !isLink(pasted)) return;
    event.preventDefault();
    this.url = pasted;
    void this.start();
  }

  /** One tap: read the link from the clipboard and import it. */
  async pasteLink(): Promise<void> {
    this.error.set('');
    let pasted = '';
    try {
      pasted = (await navigator.clipboard.readText()).trim();
    } catch {
      this.error.set(
        msg('Recipebook could not read the clipboard. Paste the link into the field.'),
      );
      return;
    }
    if (isLink(pasted)) {
      this.url = pasted;
      await this.start();
    } else if (pasted.includes('\n')) {
      this.text.set(pasted);
      this.notice.set(msg('That looks like recipe text. Check it below and choose Use text.'));
    } else this.error.set(msg('There is no link on the clipboard. Copy the recipe link first.'));
  }

  updateText(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  /** Recipe text skips the importer: it is parsed here and opens in the same review. */
  async importText(): Promise<void> {
    if (this.importing()) return;
    this.error.set('');
    this.notice.set('');
    const accountVersion = this.auth.accountVersion();
    try {
      const parsed = parseRecipeText(this.text());
      const prepared = await this.drafts.fromImport(parsed, this.recipes);
      if (!this.active || this.auth.accountVersion() !== accountVersion) return;
      this.drafts.set(prepared);
      await this.router.navigate(['/recipes/new']);
    } catch (error) {
      if (this.active)
        this.error.set(
          error instanceof Error ? error.message : msg('Could not read the recipe text.'),
        );
    }
  }

  importRecipe(event: Event): Promise<void> {
    event.preventDefault();
    return this.start();
  }

  private async start(): Promise<void> {
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
        if (!response.ok) throw new Error(data.error ?? msg('Could not import recipe.'));
        draft = data;
      }
      if (!current()) return;
      const prepared = await this.drafts.fromImport(draft, this.recipes, controller.signal);
      if (!current()) return;
      this.ready.set(true);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, motionMs(450));
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
      this.error.set(error instanceof Error ? error.message : msg('Could not import the recipe.'));
    } finally {
      if (this.controller === controller) this.importing.set(false);
    }
  }
}

function isLink(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}
