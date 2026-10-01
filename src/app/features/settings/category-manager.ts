import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import type { Recipe } from '../../core/models/recipe.model';
import type { RecipeCollection } from '../../core/models/recipe-collection.model';
import { RecipeService } from '../../core/services/recipe.service';
import { CheckboxMarkComponent } from '../../shared/components/checkbox-mark';
import { IconComponent } from '../../shared/components/icon';

@Component({
  selector: 'app-category-manager',
  imports: [CheckboxMarkComponent, IconComponent],
  templateUrl: './category-manager.html',
  styleUrl: './category-manager.scss',
})
export class CategoryManagerComponent {
  private readonly service = inject(RecipeService);
  readonly categories = signal<RecipeCollection[]>([]);
  readonly recipes = signal<Recipe[]>([]);
  readonly activeId = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly query = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly creating = signal(false);
  readonly activeCategory = computed(() => this.categories().find((c) => c.id === this.activeId()));
  readonly filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.recipes().filter((recipe) =>
      words.every((word) => recipe.title.toLocaleLowerCase().includes(word)),
    );
  });
  readonly changed = computed(() =>
    this.recipes().some(
      (recipe) =>
        !!recipe.collectionIds?.includes(this.activeId()) !== this.selected().has(recipe.id),
    ),
  );
  private active = true;
  private loadVersion = 0;

  constructor() {
    let account = this.service.accountVersion();
    effect(() => {
      const next = this.service.accountVersion();
      if (next !== account) {
        account = next;
        this.activeId.set('');
        this.creating.set(false);
        this.categories.set([]);
        this.recipes.set([]);
        this.selected.set(new Set());
        this.message.set('');
        this.error.set('');
      }
      this.service.revision();
      void this.load();
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
    });
  }

  private async load(): Promise<void> {
    const load = ++this.loadVersion;
    const account = this.service.accountVersion();
    try {
      const [categories, recipes] = await Promise.all([
        this.service.getCollections(),
        this.service.getRecipes(),
      ]);
      if (!this.active || load !== this.loadVersion || account !== this.service.accountVersion())
        return;
      this.categories.set(categories);
      this.recipes.set(recipes);
    } catch {
      if (this.active && load === this.loadVersion)
        this.error.set('Could not load categories. Reload to try again.');
    } finally {
      if (this.active && load === this.loadVersion) this.loading.set(false);
    }
  }

  count(id: string): number {
    return this.recipes().filter((recipe) => recipe.collectionIds?.includes(id)).length;
  }

  open(id: string): void {
    if (this.busy()) return;
    if (
      this.changed() &&
      !window.confirm('Your category selection has not been saved. Discard this selection?')
    )
      return;
    this.activeId.set(this.activeId() === id ? '' : id);
    this.resetSelection();
    this.query.set('');
    this.error.set('');
    this.message.set('');
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  resetSelection(): void {
    this.selected.set(
      new Set(
        this.recipes()
          .filter((recipe) => recipe.collectionIds?.includes(this.activeId()))
          .map((recipe) => recipe.id),
      ),
    );
  }

  toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    this.message.set('');
  }

  async create(input: HTMLInputElement): Promise<void> {
    const name = input.value.trim();
    if (this.busy()) return;
    if (!name) {
      this.error.set('Enter a category name.');
      input.focus();
      return;
    }
    const account = this.service.accountVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      const category = await this.service.createCollection(name);
      if (!this.active || account !== this.service.accountVersion()) return;
      await this.load();
      this.activeId.set(category.id);
      this.resetSelection();
      this.creating.set(false);
      this.query.set('');
      this.message.set('Choose recipes for ' + category.name + '.');
    } catch {
      if (this.active && account === this.service.accountVersion())
        this.error.set('Could not create this category. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.busy() || !this.activeCategory()) return;
    const account = this.service.accountVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.assignCollection(
        this.activeId(),
        this.selected(),
        new Set(this.recipes().map((recipe) => recipe.id)),
      );
      if (!this.active || account !== this.service.accountVersion()) return;
      await this.load();
      // Keep the submitted selection: a revision-triggered refresh can finish after this load.
      this.message.set('Category saved.');
    } catch {
      if (this.active && account === this.service.accountVersion())
        this.error.set('Could not save the category. Your selection is still here; try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
