import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { recipeBackground } from '../../core/models/recipe-color';
import type { ShoppingGroup } from '../../core/models/shopping-item';
import { groupByShoppingDepartment } from '../../core/models/shopping-department';
import { ShoppingListService } from '../../core/services/shopping-list.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedbackService } from '../../core/services/feedback.service';
import {
  LeaveConfirmationService,
  type ConfirmBeforeLeaving,
} from '../../core/services/leave-confirmation.service';
import { CheckboxMarkComponent } from '../../shared/components/checkbox-mark';
import { IconComponent } from '../../shared/components/icon';
import { RecipeShoppingPickerComponent } from '../../shared/components/recipe-shopping-picker';

interface ItemEditor {
  key: string;
  ids: string[];
  text: string;
}
interface SourceRecipeInfo {
  title: string;
  color: string;
}
interface SourceLabel extends SourceRecipeInfo {
  recipeId: string;
  exists: boolean;
}

@Component({
  selector: 'app-shopping-list',
  imports: [RouterLink, CheckboxMarkComponent, IconComponent, RecipeShoppingPickerComponent],
  templateUrl: './shopping-list.html',
  styleUrl: './shopping-list.scss',
})
export class ShoppingListComponent implements ConfirmBeforeLeaving {
  readonly shopping = inject(ShoppingListService);
  private readonly recipeService = inject(RecipeService);
  private readonly feedback = inject(FeedbackService);
  private readonly confirmation = inject(LeaveConfirmationService);
  private readonly addInput = viewChild<ElementRef<HTMLInputElement>>('addInput');
  private readonly editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');
  private readonly clearDialog = viewChild<ElementRef<HTMLDialogElement>>('clearDialog');
  readonly draft = signal('');
  readonly adding = signal(false);
  readonly busy = signal(false);
  readonly localError = signal('');
  readonly editor = signal<ItemEditor | null>(null);
  readonly pickerOpen = signal(false);
  readonly clearing = signal<string[] | null>(null);
  private readonly sourceRecipes = signal<ReadonlyMap<string, SourceRecipeInfo>>(new Map());
  private readonly labelsByGroup = computed(() => {
    const recipes = this.sourceRecipes();
    return new Map(
      this.shopping.groups().map((group) => {
        const labels = new Map<string, SourceLabel>();
        for (const source of group.sources) {
          if (labels.has(source.recipeId)) continue;
          const recipe = recipes.get(source.recipeId);
          labels.set(source.recipeId, {
            recipeId: source.recipeId,
            title: recipe?.title ?? source.recipeTitle,
            color: recipe?.color ?? recipeBackground({ id: source.recipeId }),
            exists: !!recipe,
          });
        }
        return [group.key, [...labels.values()]] as const;
      }),
    );
  });
  readonly sourceLegend = computed(() => {
    const sources = new Map<string, SourceLabel>();
    for (const labels of this.labelsByGroup().values()) {
      for (const source of labels) {
        if (!sources.has(source.recipeId)) sources.set(source.recipeId, source);
      }
    }
    return [...sources.values()];
  });
  readonly error = computed(() => this.localError() || this.shopping.error());
  readonly toBuy = computed(() => this.shopping.groups().filter((group) => !group.checked));
  readonly checked = computed(() => this.shopping.groups().filter((group) => group.checked));
  readonly departments = computed(() => [
    ...groupByShoppingDepartment(this.toBuy()),
    // Checked items stay visible after all departments, without repeating their headings.
    { id: 'checked', label: '', groups: this.checked() },
  ]);
  private active = true;
  private loadVersion = 0;
  private focusFrame = 0;
  private cancelItemHold = () => {};
  private allowItemClick = () => {};
  private clearOrigin: HTMLElement | null = null;
  private clearAccount: number | null = null;
  private clearBackdropPressed = false;

  constructor() {
    let account = this.shopping.accountVersion();
    effect(() => {
      const next = this.shopping.accountVersion();
      if (next !== account) {
        account = next;
        this.cancelItemHold();
        this.allowItemClick();
        this.draft.set('');
        this.editor.set(null);
        this.clearing.set(null);
        this.pickerOpen.set(false);
        this.localError.set('');
        this.busy.set(false);
        this.adding.set(false);
        this.sourceRecipes.set(new Map());
      }
      this.recipeService.revision();
      untracked(() => void this.loadSourceRecipes());
    });
    effect(() => {
      if (this.editor()) {
        const input = this.editInput()?.nativeElement;
        input?.focus({ preventScroll: true });
      }
    });
    effect(() => {
      const dialog = this.clearDialog()?.nativeElement;
      if (this.clearing()) {
        if (dialog && !dialog.open) dialog.showModal();
      } else if (dialog?.open) {
        dialog.close();
        if (this.clearAccount !== null) this.restoreClearFocus(this.clearAccount, this.clearOrigin);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
      this.cancelItemHold();
      this.allowItemClick();
      cancelAnimationFrame(this.focusFrame);
      this.clearDialog()?.nativeElement.close();
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.busy() || this.adding()) return false;
    return (
      (!this.draft().trim() && !this.editor()) ||
      this.confirmation.confirm('Your shopping list changes have not been saved. Discard them?')
    );
  }

  private current(account: number): boolean {
    return this.active && account === this.shopping.accountVersion();
  }
  private async loadSourceRecipes(): Promise<void> {
    const request = ++this.loadVersion;
    const account = this.shopping.accountVersion();
    try {
      const recipes = await this.recipeService.getRecipes();
      if (this.current(account) && request === this.loadVersion)
        // Keep only the metadata needed here; do not retain recipe photos.
        this.sourceRecipes.set(
          new Map(
            recipes.map((recipe) => [
              recipe.id,
              {
                title: recipe.title,
                color: recipeBackground(recipe),
              },
            ]),
          ),
        );
    } catch {
      // Source snapshots remain readable even when the recipe lookup is unavailable.
      if (this.current(account) && request === this.loadVersion) this.sourceRecipes.set(new Map());
    }
  }
  sourceLabels(group: ShoppingGroup): readonly SourceLabel[] {
    return this.labelsByGroup().get(group.key) ?? [];
  }
  onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }
  onEdit(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editor.update((editor) => (editor ? { ...editor, text: value } : null));
  }
  async addItems(text = this.draft()): Promise<void> {
    if (this.adding() || !text.trim() || this.shopping.loading()) return;
    const account = this.shopping.accountVersion();
    const draft = this.draft();
    this.adding.set(true);
    this.localError.set('');
    try {
      const count = await this.shopping.addManual(text);
      if (!this.current(account)) return;
      if (text === draft && this.draft() === draft) this.draft.set('');
      if (count > 1) this.feedback.show(count + ' items added');
      this.addInput()?.nativeElement.focus({ preventScroll: true });
    } catch (error) {
      if (this.current(account)) this.showError(error, 'Could not add this item. Try again.');
    } finally {
      if (this.current(account)) this.adding.set(false);
    }
  }
  pasteItems(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n]/.test(text) || this.adding() || this.shopping.loading()) return;
    event.preventDefault();
    void this.addItems(text);
  }
  async toggleGroup(group: ShoppingGroup, event?: Event): Promise<void> {
    if (this.busy()) return;
    const ids = group.items.map((item) => item.id);
    const input = event?.target instanceof HTMLElement ? event.target : null;
    const next = this.nextItem(input);
    const account = this.shopping.accountVersion();
    this.busy.set(true);
    this.localError.set('');
    try {
      await this.shopping.setChecked(ids, !group.checked);
      if (this.current(account) && input) this.focusAfterRemoval(input, next);
    } catch (error) {
      if (this.current(account)) this.showError(error, 'Could not update this item. Try again.');
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }
  holdItem(group: ShoppingGroup, event: PointerEvent): void {
    this.cancelItemHold();
    if (this.busy() || !event.isPrimary || event.button !== 0) return;
    const account = this.shopping.accountVersion();
    const move = (next: PointerEvent) => {
      if (
        next.pointerId === event.pointerId &&
        Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 10
      )
        cancel();
    };
    const release = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId) cancel();
    };
    const cancel = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('scroll', cancel, true);
      window.removeEventListener('blur', cancel);
      this.cancelItemHold = () => {};
    };
    const timer = setTimeout(() => {
      cancel();
      if (!this.current(account) || this.busy()) return;
      this.suppressHoldClick();
      this.startEdit(group);
    }, 500);
    // Track only the active hold; scrolling and normal taps keep their native behavior.
    document.addEventListener('pointermove', move, { capture: true, passive: true });
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('scroll', cancel, { capture: true, passive: true });
    window.addEventListener('blur', cancel);
    this.cancelItemHold = cancel;
  }
  editItemContext(group: ShoppingGroup, event: MouseEvent): void {
    event.preventDefault();
    this.cancelItemHold();
    if (this.busy()) return;
    this.suppressHoldClick();
    this.startEdit(group);
  }
  editItemKey(group: ShoppingGroup, event: KeyboardEvent): void {
    if (
      event.key === 'F2' ||
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      event.preventDefault();
      this.cancelItemHold();
      this.startEdit(group);
    }
  }
  private suppressHoldClick(): void {
    this.allowItemClick();
    const consume = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
    };
    const released = () => {
      clearTimeout(timeout);
      timeout = setTimeout(clear, 1200);
    };
    const clear = () => {
      clearTimeout(timeout);
      document.removeEventListener('click', consume, true);
      document.removeEventListener('pointerup', released, true);
      document.removeEventListener('pointercancel', released, true);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('keydown', clear, true);
      this.allowItemClick = () => {};
    };
    // The held label is replaced by the editor. Catch the release click even if
    // the browser retargets it to the editor or another row; a fresh tap is allowed.
    let timeout = setTimeout(clear, 30_000);
    document.addEventListener('click', consume, true);
    document.addEventListener('pointerup', released, true);
    document.addEventListener('pointercancel', released, true);
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('keydown', clear, true);
    this.allowItemClick = clear;
  }
  startEdit(group: ShoppingGroup): void {
    if (this.busy()) return;
    this.editor.set({ key: group.key, ids: group.items.map((item) => item.id), text: group.text });
    this.localError.set('');
  }
  cancelEdit(): void {
    if (this.busy()) return;
    const id = this.editor()?.ids[0];
    this.editor.set(null);
    this.focusRow(id);
  }
  async saveEdit(): Promise<void> {
    const editor = this.editor();
    if (!editor || this.busy() || !editor.text.trim()) return;
    const account = this.shopping.accountVersion();
    this.busy.set(true);
    this.localError.set('');
    try {
      await this.shopping.edit(editor.ids, editor.text);
      if (!this.current(account)) return;
      this.editor.set(null);
      this.focusRow(editor.ids[0]);
    } catch (error) {
      if (this.current(account))
        this.showError(error, 'Could not save this item. Your edit is still here; try again.');
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }
  async removeGroup(group: ShoppingGroup, event?: Event): Promise<void> {
    const origin = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const next = this.nextItem(origin);
    await this.removeItems(
      group.items.map((item) => item.id),
      'Item deleted',
    );
    if (origin) this.focusAfterRemoval(origin, next);
  }
  private async removeItems(ids: readonly string[], message: string): Promise<void> {
    if (this.busy() || !ids.length) return;
    const account = this.shopping.accountVersion();
    this.busy.set(true);
    this.localError.set('');
    try {
      const undo = await this.shopping.remove(ids);
      if (!this.current(account)) return;
      this.editor.set(null);
      this.clearing.set(null);
      this.feedback.show(message, {
        label: 'Undo',
        run: undo,
        successMessage: 'Items restored',
        errorMessage: 'Could not restore these items. Try again.',
      });
    } catch (error) {
      if (this.current(account)) this.showError(error, 'Could not delete these items. Try again.');
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }
  async clearChecked(): Promise<void> {
    if (this.busy() || !this.checked().length) return;
    const account = this.shopping.accountVersion();
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.busy.set(true);
    this.localError.set('');
    try {
      const undo = await this.shopping.clear(true);
      if (!this.current(account)) return;
      this.feedback.show('Checked items cleared', {
        label: 'Undo',
        run: undo,
        successMessage: 'Items restored',
        errorMessage: 'Could not restore these items. Try again.',
      });
      this.restoreClearFocus(account, origin);
    } catch (error) {
      if (this.current(account)) this.showError(error, 'Could not clear checked items. Try again.');
    } finally {
      if (this.current(account)) this.busy.set(false);
    }
  }
  async requestClear(): Promise<void> {
    if (this.busy() || !this.shopping.items().length) return;
    const ids = this.shopping.items().map((item) => item.id);
    const account = this.shopping.accountVersion();
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!this.toBuy().length) {
      await this.removeItems(ids, 'Shopping list cleared');
      this.restoreClearFocus(account, origin);
      return;
    }
    this.clearOrigin = origin;
    this.clearAccount = account;
    this.clearing.set(ids);
  }
  async confirmClear(): Promise<void> {
    const ids = this.clearing();
    if (ids) await this.removeItems(ids, 'Shopping list cleared');
  }
  cancelClear(event?: Event): void {
    event?.preventDefault();
    if (!this.busy()) this.clearing.set(null);
  }
  clearBackdropStart(event: PointerEvent): void {
    this.clearBackdropPressed = event.target === event.currentTarget;
  }
  clearBackdropClick(event: MouseEvent): void {
    if (this.clearBackdropPressed && event.target === event.currentTarget) this.cancelClear();
    this.clearBackdropPressed = false;
  }
  openPicker(): void {
    if (!this.busy()) this.pickerOpen.set(true);
  }
  private showError(error: unknown, fallback: string): void {
    this.localError.set(error instanceof Error ? error.message : fallback);
  }
  private restoreClearFocus(account: number, origin: HTMLElement | null): void {
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      if (!this.current(account)) return;
      (origin?.isConnected ? origin : this.addInput()?.nativeElement)?.focus({
        preventScroll: true,
      });
    });
  }
  private nextItem(origin: HTMLElement | null): HTMLInputElement | null {
    const row = origin?.closest('.shopping-row');
    if (!row) return null;
    const rows = Array.from(row.closest('section')?.querySelectorAll('.shopping-row') ?? []);
    return (
      rows[rows.indexOf(row) + 1]?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null
    );
  }
  private focusAfterRemoval(origin: HTMLElement, next: HTMLElement | null): void {
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      if (
        !this.active ||
        origin.isConnected ||
        (document.activeElement !== document.body && document.activeElement?.isConnected)
      )
        return;
      (next?.isConnected ? next : this.addInput()?.nativeElement)?.focus({ preventScroll: true });
    });
  }
  private focusRow(id?: string): void {
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      if (!this.active) return;
      const input = id ? document.getElementById('shopping-item-' + id) : null;
      (input ?? this.addInput()?.nativeElement)?.focus({ preventScroll: true });
    });
  }
}
