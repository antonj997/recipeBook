import { Component, ElementRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { msg, t, TranslatePipe } from '../../core/i18n/i18n';
import type { Recipe } from '../../core/models/recipe.model';
import { FeedbackService } from '../../core/services/feedback.service';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import {
  normalizeUsername,
  SharingService,
  type RecipeVisibility,
  type ShareOutcome,
} from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { IconComponent } from './icon';
import { UsernameFieldComponent, type UsernameStatus } from './username-field';

const outcomes: Record<ShareOutcome, string> = {
  shared: msg('Shared with {name}.'),
  not_found: msg('No one found with that email or username.'),
  self: msg('You can’t share with yourself.'),
  limited: msg('Wait a moment before sharing again.'),
};

/** Make a recipe public or share it with a person; opened from the recipe's options menu. */
@Component({
  selector: 'app-recipe-share-dialog',
  imports: [IconComponent, TranslatePipe, UsernameFieldComponent],
  templateUrl: './recipe-share-dialog.html',
  styleUrl: './recipe-share-dialog.scss',
})
export class RecipeShareDialogComponent {
  private readonly actions = inject(RecipeActionsService);
  private readonly auth = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  readonly sharing = inject(SharingService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly recipe = signal<Recipe | null>(null);
  readonly loading = signal(false);
  readonly visibility = signal<RecipeVisibility | null>(null);
  readonly recipients = signal<{ id: string; label: string }[]>([]);
  readonly draftName = signal('');
  readonly nameStatus = signal<UsernameStatus>('empty');
  readonly nameError = signal('');
  readonly recipient = signal('');
  readonly outcome = signal('');
  readonly error = signal('');
  readonly busy = signal<'publish' | 'private' | 'share' | null>(null);
  private version = 0;
  protected backdropPressed = false;

  constructor() {
    effect(() => {
      const recipe = this.actions.sharing();
      untracked(() => (recipe ? this.open(recipe) : this.closeDialog()));
    });
    let account = this.auth.accountVersion();
    effect(() => {
      const next = this.auth.accountVersion();
      if (next === account) return;
      account = next;
      untracked(() => this.close());
    });
  }

  link(): string {
    const recipe = this.recipe();
    const user = this.auth.user();
    return recipe && user ? this.sharing.link(user.id, recipe.id) : '';
  }

  private async open(recipe: Recipe): Promise<void> {
    if (!this.auth.user()) {
      this.actions.sharing.set(null);
      void this.router.navigate(['/settings'], { fragment: 'account' });
      return;
    }
    const version = (this.version = this.auth.accountVersion());
    this.recipe.set(recipe);
    this.visibility.set(null);
    this.recipients.set([]);
    this.draftName.set('');
    this.nameError.set('');
    this.recipient.set('');
    this.outcome.set('');
    this.error.set('');
    this.loading.set(true);
    const dialog = this.dialog()?.nativeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    try {
      const [visibility, recipients] = await Promise.all([
        this.sharing.visibility(recipe.id),
        this.sharing.recipients(recipe.id),
        this.sharing.username() === undefined ? this.sharing.loadProfile() : undefined,
      ]);
      if (!this.current(version, recipe)) return;
      this.visibility.set(visibility);
      this.recipients.set(recipients);
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.loading.set(false);
    }
  }

  async publish(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || this.busy()) return;
    const version = this.version;
    this.busy.set('publish');
    this.error.set('');
    this.nameError.set('');
    try {
      const name = normalizeUsername(this.draftName());
      if (this.sharing.username() === null && name) {
        const saved = await this.sharing.setUsername(name);
        if (!this.current(version, recipe)) return;
        if (saved === 'taken') return this.nameError.set(t('Taken'));
      }
      await this.sharing.setVisibility(recipe.id, 'public');
      if (this.current(version, recipe)) this.visibility.set('public');
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.busy.set(null);
    }
  }

  async makePrivate(): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || this.busy()) return;
    const version = this.version;
    this.busy.set('private');
    this.error.set('');
    try {
      await this.sharing.setVisibility(recipe.id, 'private');
      if (this.current(version, recipe)) this.visibility.set('private');
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.busy.set(null);
    }
  }

  async shareLink(): Promise<void> {
    const recipe = this.recipe();
    const url = this.link();
    if (!recipe || !url) return;
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: recipe.title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.feedback.show(t('Link copied'));
    } catch {
      this.error.set(t('Could not copy the link. Select it and copy it yourself.'));
    }
  }

  async shareWithPerson(): Promise<void> {
    const recipe = this.recipe();
    const recipient = this.recipient().trim();
    if (!recipe || !recipient || this.busy()) return;
    const version = this.version;
    this.busy.set('share');
    this.outcome.set('');
    this.error.set('');
    try {
      const outcome = await this.sharing.share(recipe.id, recipient);
      if (!this.current(version, recipe)) return;
      this.outcome.set(t(outcomes[outcome] ?? outcomes.not_found, { name: recipient }));
      if (outcome === 'shared') {
        this.recipient.set('');
        const recipients = await this.sharing.recipients(recipe.id);
        if (this.current(version, recipe)) this.recipients.set(recipients);
      }
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.busy.set(null);
    }
  }

  async remove(person: { id: string; label: string }): Promise<void> {
    const recipe = this.recipe();
    if (!recipe) return;
    const version = this.version;
    try {
      await this.sharing.unshare(recipe.id, person.id);
      if (this.current(version, recipe))
        this.recipients.update((list) => list.filter((entry) => entry.id !== person.id));
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    }
  }

  close(): void {
    this.actions.sharing.set(null);
    this.closeDialog();
  }

  protected backdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) this.close();
  }

  private closeDialog(): void {
    this.recipe.set(null);
    this.busy.set(null);
    const dialog = this.dialog()?.nativeElement;
    if (!dialog?.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  private current(version: number, recipe: Recipe): boolean {
    return version === this.auth.accountVersion() && this.recipe() === recipe;
  }

  private message(error: unknown): string {
    return error instanceof Error ? t(error.message) : t('Something went wrong. Try again.');
  }
}
