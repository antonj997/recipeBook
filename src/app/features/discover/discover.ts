import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { t, TranslatePipe } from '../../core/i18n/i18n';
import { recipeBackground } from '../../core/models/recipe-color';
import {
  SharingService,
  type DiscoverCursor,
  type SharedRecipe,
} from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { FoodPlaceholderComponent } from '../../shared/components/food-placeholder';
import { IconComponent } from '../../shared/components/icon';
import { LoadingStateComponent } from '../../shared/components/loading-state';

/** Public recipes anyone can read, and, signed in, the recipes people shared with you. */
@Component({
  selector: 'app-discover',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    IconComponent,
    FoodPlaceholderComponent,
    LoadingStateComponent,
    TranslatePipe,
  ],
  templateUrl: './discover.html',
  styleUrl: './discover.scss',
})
export class DiscoverComponent implements OnInit {
  private readonly sharing = inject(SharingService);
  private readonly auth = inject(SupabaseService);
  readonly query = signal('');
  readonly items = signal<SharedRecipe[]>([]);
  readonly next = signal<DiscoverCursor | undefined>(undefined);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly sharedWithMe = signal<SharedRecipe[]>([]);
  private readonly covers = signal<Record<string, string>>({});
  readonly background = (item: SharedRecipe) => recipeBackground(item.recipe);
  private request = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private active = true;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
      clearTimeout(this.timer);
    });
  }

  ngOnInit(): void {
    void this.load();
    if (this.auth.user())
      void this.sharing
        .sharedWithMe()
        .then((items) => {
          if (!this.active) return;
          this.sharedWithMe.set(items);
          void this.loadCovers(items);
        })
        .catch(() => undefined);
  }

  search(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 300);
  }

  author(item: SharedRecipe): string {
    return item.author ? t('by @{name}', { name: item.author }) : t('by a Recipebook cook');
  }

  cover(item: SharedRecipe): string | undefined {
    return this.covers()[item.recipe.id];
  }

  emptyMessage(): string {
    const query = this.query().trim();
    return query ? t('No recipes match “{query}”.', { query }) : t('No public recipes yet.');
  }

  async load(more = false): Promise<void> {
    const request = ++this.request;
    const after = more ? this.next() : undefined;
    if (more) this.loadingMore.set(true);
    else this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.sharing.discover(this.query(), after);
      if (request !== this.request || !this.active) return;
      this.items.update((items) => (more ? [...items, ...page.items] : page.items));
      this.next.set(page.next);
      void this.loadCovers(page.items);
    } catch (error) {
      if (request === this.request && this.active)
        this.error.set(error instanceof Error ? t(error.message) : t('Could not load recipes.'));
    } finally {
      if (request === this.request && this.active) {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    }
  }

  /** Covers arrive one by one after the rows, so the list never waits on photos. */
  private async loadCovers(items: SharedRecipe[]): Promise<void> {
    for (const item of items) {
      if (!this.active) return;
      if (!item.cover || this.covers()[item.recipe.id]) continue;
      const photo = await this.sharing.photo(item.owner, item.cover).catch(() => undefined);
      if (photo && this.active)
        this.covers.update((covers) => ({ ...covers, [item.recipe.id]: photo }));
    }
  }
}
