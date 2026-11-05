import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { plural, t, TranslatePipe } from '../../core/i18n/i18n';
import type { Recipe } from '../../core/models/recipe.model';
import { FeedbackService } from '../../core/services/feedback.service';
import { RecipeImagesService } from '../../core/services/recipe-images.service';
import { RecipeService } from '../../core/services/recipe.service';
import { recipeBackground } from '../../core/models/recipe-color';
import {
  SharingService,
  type DiscoverCursor,
  type SharedRecipe,
  type SharedState,
} from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { FoodPlaceholderComponent } from '../../shared/components/food-placeholder';
import { IconComponent } from '../../shared/components/icon';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { SwipeRevealDirective } from '../../shared/directives/swipe-reveal';

/** Public recipes anyone can read, and, signed in, the recipes people shared with you. */
@Component({
  selector: 'app-discover',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    IconComponent,
    FoodPlaceholderComponent,
    LoadingStateComponent,
    SwipeRevealDirective,
    TranslatePipe,
  ],
  templateUrl: './discover.html',
  styleUrl: './discover.scss',
})
export class DiscoverComponent implements OnInit {
  private readonly sharing = inject(SharingService);
  private readonly auth = inject(SupabaseService);
  private readonly recipes = inject(RecipeService);
  private readonly images = inject(RecipeImagesService);
  private readonly feedback = inject(FeedbackService);
  /** Your own recipes that are public or shared with someone, with how they are shared. */
  readonly mine = signal<{ recipe: Recipe; state: SharedState }[]>([]);
  readonly stopping = signal<string | null>(null);
  readonly query = signal('');
  readonly items = signal<SharedRecipe[]>([]);
  readonly next = signal<DiscoverCursor | undefined>(undefined);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly sharedWithMe = signal<SharedRecipe[]>([]);
  private readonly covers = signal<Record<string, string>>({});
  readonly background = (item: SharedRecipe) => recipeBackground(item.recipe);
  readonly ownBackground = (recipe: Recipe) => recipeBackground(recipe);
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
    if (this.auth.user()) void this.loadMine();
  }

  private async loadMine(): Promise<void> {
    try {
      await this.sharing.refreshShared();
      const shared = this.sharing.shared();
      const recipes = (await this.recipes.getRecipes()).filter((recipe) => shared.has(recipe.id));
      if (!this.active) return;
      await this.images.prepare(recipes, 'thumb').catch(() => undefined);
      this.mine.set(
        recipes
          .map((recipe) => ({ recipe, state: shared.get(recipe.id)! }))
          .sort((a, b) => a.recipe.title.localeCompare(b.recipe.title)),
      );
    } catch {
      /* The section stays away offline; the recipes themselves are untouched. */
    }
  }

  status(state: SharedState): string {
    if (state.visibility === 'public')
      return state.recipients
        ? plural(state.recipients, 'Public · with {n} person', 'Public · with {n} people')
        : t('Public');
    return plural(state.recipients, 'With {n} person', 'With {n} people');
  }

  ownCover(recipe: Recipe): string | undefined {
    return this.images.peek(recipe, 'thumb');
  }

  /** Stops all sharing at once (public and people); Undo puts every part back. */
  async stopSharing(entry: { recipe: Recipe; state: SharedState }): Promise<void> {
    if (this.stopping()) return;
    this.stopping.set(entry.recipe.id);
    try {
      const before = await this.sharing.stopSharing(entry.recipe.id);
      if (!this.active) return;
      this.mine.update((list) => list.filter((item) => item.recipe.id !== entry.recipe.id));
      this.feedback.show(t('Stopped sharing {title}', { title: entry.recipe.title }), {
        label: t('Undo'),
        run: async () => {
          await this.sharing.restoreSharing(entry.recipe.id, before);
          if (this.active) void this.loadMine();
        },
      });
    } catch (error) {
      this.feedback.show(
        error instanceof Error ? t(error.message) : t('Something went wrong. Try again.'),
      );
    } finally {
      if (this.active) this.stopping.set(null);
    }
  }

  sharedBy(item: SharedRecipe): string {
    return item.author
      ? t('Shared by @{name}', { name: item.author })
      : t('Shared by a Recipebook cook');
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
