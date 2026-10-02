import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { Recipe } from '../../core/models/recipe.model';
import type { RecipeCollection } from '../../core/models/recipe-collection.model';
import { RecipeService } from '../../core/services/recipe.service';
import { LeaveConfirmationService } from '../../core/services/leave-confirmation.service';
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
  private readonly confirmation = inject(LeaveConfirmationService);
  readonly categories = signal<RecipeCollection[]>([]);
  readonly recipes = signal<Recipe[]>([]);
  readonly activeId = signal('');
  readonly selected = signal<Set<string>>(new Set());
  private readonly savedSelection = signal<Set<string>>(new Set());
  readonly query = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly creating = signal(false);
  readonly newName = signal('');
  readonly renaming = signal(false);
  readonly renameName = signal('');
  readonly removing = signal<RecipeCollection | null>(null);
  readonly activeCategory = computed(() =>
    this.categories().find((category) => category.id === this.activeId()),
  );
  readonly filteredRecipes = computed(() => {
    const words = this.query().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.recipes().filter((recipe) =>
      words.every((word) => recipe.title.toLocaleLowerCase().includes(word)),
    );
  });
  readonly changed = computed(
    () =>
      !!this.activeId() &&
      (this.savedSelection().size !== this.selected().size ||
        [...this.savedSelection()].some((id) => !this.selected().has(id))),
  );
  readonly renameChanged = computed(
    () => this.renaming() && this.renameName().trim() !== this.activeCategory()?.name,
  );
  readonly dirty = computed(
    () => this.changed() || this.renameChanged() || (this.creating() && !!this.newName().trim()),
  );
  private readonly removeDialog = viewChild<ElementRef<HTMLDialogElement>>('removeDialog');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private active = true;
  private loadVersion = 0;
  private loadedAccount = this.service.accountVersion();

  constructor() {
    let account = this.service.accountVersion();
    effect(() => {
      const next = this.service.accountVersion();
      if (next !== account) {
        account = next;
        this.activeId.set('');
        this.creating.set(false);
        this.newName.set('');
        this.renaming.set(false);
        this.removing.set(null);
        this.categories.set([]);
        this.recipes.set([]);
        this.selected.set(new Set());
        this.savedSelection.set(new Set());
        this.message.set('');
        this.error.set('');
        this.busy.set(false);
        this.loading.set(true);
      }
      this.service.revision();
      void this.load();
    });
    effect(() => {
      const dialog = this.removeDialog()?.nativeElement;
      if (this.removing()) {
        if (dialog && !dialog.open) dialog.showModal();
      } else if (dialog?.open) dialog.close();
    });
    effect(() => {
      if (this.creating()) this.nameInput()?.nativeElement.focus();
    });
    effect(() => {
      if (this.renaming()) this.renameInput()?.nativeElement.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
    });
  }

  private current(account: number): boolean {
    return this.active && account === this.service.accountVersion();
  }
  private ready(): boolean {
    return !this.busy() && !this.loading() && this.current(this.loadedAccount);
  }

  private async load(): Promise<void> {
    const load = ++this.loadVersion;
    const account = this.service.accountVersion();
    try {
      const [categories, recipes] = await Promise.all([
        this.service.getCollections(),
        this.service.getRecipes(),
      ]);
      if (!this.current(account) || load !== this.loadVersion) return;
      this.loadedAccount = account;
      const preserveSelection = this.changed();
      this.categories.set(categories);
      this.recipes.set(recipes);
      if (this.activeId() && !this.activeCategory()) {
        this.activeId.set('');
        this.selected.set(new Set());
        this.savedSelection.set(new Set());
        this.renaming.set(false);
      } else if (!preserveSelection) this.resetSelection();
    } catch {
      if (this.current(account) && load === this.loadVersion)
        this.error.set('Could not load categories. Reload to try again.');
    } finally {
      if (this.current(account) && load === this.loadVersion) this.loading.set(false);
    }
  }

  count(id: string): number {
    return this.recipes().filter((recipe) => recipe.collectionIds?.includes(id)).length;
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.current(this.loadedAccount)) return true;
    if (this.busy()) return false;
    return (
      !this.dirty() ||
      this.confirmation.confirm('Your category changes have not been saved. Discard them?')
    );
  }

  async open(id: string): Promise<void> {
    if (!this.ready()) return;
    const account = this.service.accountVersion();
    if (!(await this.canLeave()) || !this.current(account)) return;
    this.activeId.set(this.activeId() === id ? '' : id);
    this.resetSelection();
    this.creating.set(false);
    this.newName.set('');
    this.renaming.set(false);
    this.query.set('');
    this.error.set('');
    this.message.set('');
  }

  async toggleCreate(): Promise<void> {
    if (!this.ready()) return;
    const account = this.service.accountVersion();
    if (!(await this.canLeave()) || !this.current(account)) return;
    this.resetSelection();
    this.renaming.set(false);
    this.creating.set(!this.creating());
    this.newName.set('');
    this.error.set('');
    this.message.set('');
  }

  async toggleRename(): Promise<void> {
    if (!this.ready()) return;
    const account = this.service.accountVersion();
    if (
      this.renameChanged() &&
      !(await this.confirmation.confirm('Your category name has not been saved. Discard it?'))
    )
      return;
    if (!this.current(account)) return;
    this.renameName.set(this.activeCategory()?.name ?? '');
    this.renaming.set(!this.renaming());
    this.error.set('');
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  onName(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }
  onRename(event: Event): void {
    this.renameName.set((event.target as HTMLInputElement).value);
  }

  resetSelection(): void {
    const ids = this.recipes()
      .filter((recipe) => recipe.collectionIds?.includes(this.activeId()))
      .map((recipe) => recipe.id);
    this.selected.set(new Set(ids));
    this.savedSelection.set(new Set(ids));
  }

  toggle(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    this.message.set('');
  }

  async create(): Promise<void> {
    if (!this.ready()) return;
    if (!this.newName().trim()) {
      this.error.set('Enter a category name.');
      this.nameInput()?.nativeElement.focus();
      return;
    }
    const account = this.service.accountVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      const category = await this.service.createCollection(this.newName());
      if (!this.current(account)) return;
      await this.load();
      if (!this.current(account)) return;
      this.activeId.set(category.id);
      this.resetSelection();
      this.creating.set(false);
      this.newName.set('');
      this.query.set('');
      this.message.set('Choose recipes for ' + category.name + '.');
    } catch (error) {
      if (this.current(account))
        this.error.set(
          error instanceof Error ? error.message : 'Could not create this category. Try again.',
        );
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }

  async rename(): Promise<void> {
    const category = this.activeCategory();
    if (!this.ready() || !category) return;
    const account = this.service.accountVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.renameCollection(category.id, this.renameName());
      if (!this.current(account)) return;
      await this.load();
      if (!this.current(account)) return;
      this.renaming.set(false);
      this.message.set('Category renamed.');
    } catch (error) {
      if (this.current(account))
        this.error.set(
          error instanceof Error ? error.message : 'Could not rename this category. Try again.',
        );
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }

  requestRemove(category: RecipeCollection): void {
    if (this.ready()) {
      this.error.set('');
      this.removing.set(category);
    }
  }

  cancelRemove(event?: Event): void {
    event?.preventDefault();
    if (!this.busy()) this.removing.set(null);
  }

  async remove(): Promise<void> {
    const category = this.removing();
    if (!this.ready() || !category) return;
    const account = this.service.accountVersion();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.removeCollection(category.id);
      if (!this.current(account)) return;
      this.activeId.set('');
      this.renaming.set(false);
      this.resetSelection();
      this.removing.set(null);
      await this.load();
      if (this.current(account)) this.message.set('Category removed. All recipes were kept.');
    } catch (error) {
      if (this.current(account))
        this.error.set(
          error instanceof Error ? error.message : 'Could not remove this category. Try again.',
        );
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.ready() || !this.activeCategory()) return;
    const account = this.service.accountVersion();
    const selected = new Set(this.selected());
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.assignCollection(
        this.activeId(),
        selected,
        new Set(this.recipes().map((recipe) => recipe.id)),
      );
      if (!this.current(account)) return;
      this.savedSelection.set(selected);
      await this.load();
      if (this.current(account)) this.message.set('Category selection saved.');
    } catch {
      if (this.current(account))
        this.error.set('Could not save the category. Your selection is still here; try again.');
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }
}
