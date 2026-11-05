import { DOCUMENT } from '@angular/common';
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
import { Router } from '@angular/router';
import { msg, t, TranslatePipe } from '../../core/i18n/i18n';
import type { Recipe } from '../../core/models/recipe.model';
import { FeedbackService } from '../../core/services/feedback.service';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import {
  normalizeUsername,
  SharingService,
  type Person,
  type Recipient,
  type RecipeVisibility,
  type ShareOutcome,
} from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { lockPageScroll } from '../page-scroll-lock';
import { IconComponent } from './icon';
import { SelectMenuComponent } from './select-menu';
import { UsernameFieldComponent, type UsernameStatus } from './username-field';

const outcomes: Record<ShareOutcome, string> = {
  shared: msg('Shared with {name}.'),
  not_found: msg('No one found with that email or username.'),
  self: msg('You can’t share with yourself.'),
  limited: msg('Wait a moment before sharing again.'),
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who can open a recipe, in the order sharing sheets use: add people, people with access, then
 * general access (only those people, or anyone). A bottom sheet on phones, a dialog on wide screens.
 */
@Component({
  selector: 'app-recipe-share-dialog',
  imports: [IconComponent, SelectMenuComponent, TranslatePipe, UsernameFieldComponent],
  templateUrl: './recipe-share-dialog.html',
  styleUrl: './recipe-share-dialog.scss',
})
export class RecipeShareDialogComponent {
  private readonly actions = inject(RecipeActionsService);
  private readonly auth = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  private readonly document = inject(DOCUMENT);
  readonly sharing = inject(SharingService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly recipe = signal<Recipe | null>(null);
  readonly loading = signal(false);
  readonly visibility = signal<RecipeVisibility | null>(null);
  readonly recipients = signal<Recipient[]>([]);
  readonly query = signal('');
  readonly results = signal<Person[]>([]);
  readonly searching = signal(false);
  readonly choosingPublic = signal(false);
  readonly draftName = signal('');
  readonly nameStatus = signal<UsernameStatus>('empty');
  readonly nameError = signal('');
  readonly outcome = signal('');
  readonly error = signal('');
  readonly busy = signal<string | null>(null);
  readonly keyboard = signal(0);
  readonly title = computed(() => {
    const recipe = this.recipe();
    return recipe && (this.sharing.isShared(recipe.id) || this.recipients().length)
      ? msg('Manage sharing')
      : msg('Share recipe');
  });
  readonly emailMatch = computed(() => {
    const query = this.query().trim();
    return emailPattern.test(query) ? query : null;
  });
  readonly accessOptions = computed(() => [
    { value: 'private', label: t('Only people you add') },
    { value: 'public', label: t('Anyone (public)') },
  ]);
  readonly access = computed(() =>
    this.choosingPublic() ? 'public' : (this.visibility() ?? 'private'),
  );
  private version = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchTicket = 0;
  private unlock?: () => void;
  private stopKeyboard?: () => void;
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
    inject(DestroyRef).onDestroy(() => this.release());
  }

  link(): string {
    const recipe = this.recipe();
    const user = this.auth.user();
    return recipe && user ? this.sharing.link(user.id, recipe.id) : '';
  }

  initial(name: string): string {
    return (name.replace(/^@/, '')[0] ?? '?').toLocaleUpperCase();
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
    this.query.set('');
    this.results.set([]);
    this.choosingPublic.set(false);
    this.draftName.set('');
    this.nameError.set('');
    this.outcome.set('');
    this.error.set('');
    this.loading.set(true);
    const dialog = this.dialog()?.nativeElement;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      this.unlock ??= lockPageScroll(this.document);
      this.followKeyboard();
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

  search(value: string): void {
    this.query.set(value);
    this.outcome.set('');
    clearTimeout(this.searchTimer);
    const ticket = ++this.searchTicket;
    const cleaned = normalizeUsername(value);
    if (!cleaned || this.emailMatch()) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchTimer = setTimeout(async () => {
      try {
        const people = await this.sharing.searchPeople(cleaned);
        if (ticket !== this.searchTicket) return;
        const added = new Set(this.recipients().map((person) => person.id));
        this.results.set(people.filter((person) => !added.has(person.id)));
      } catch (error) {
        if (ticket === this.searchTicket) this.error.set(this.message(error));
      } finally {
        if (ticket === this.searchTicket) this.searching.set(false);
      }
    }, 250);
  }

  addPerson(person: Person): Promise<void> {
    return this.add('@' + person.username, (id) => this.sharing.shareWith(id, person.id));
  }

  addEmail(email: string): Promise<void> {
    return this.add(email, (id) => this.sharing.share(id, email));
  }

  private async add(
    name: string,
    share: (recipeId: string) => Promise<ShareOutcome>,
  ): Promise<void> {
    const recipe = this.recipe();
    if (!recipe || this.busy()) return;
    const version = this.version;
    this.busy.set('add');
    this.error.set('');
    try {
      const outcome = await share(recipe.id);
      if (!this.current(version, recipe)) return;
      this.outcome.set(t(outcomes[outcome] ?? outcomes.not_found, { name }));
      if (outcome !== 'shared') return;
      this.query.set('');
      this.results.set([]);
      const recipients = await this.sharing.recipients(recipe.id);
      if (this.current(version, recipe)) this.recipients.set(recipients);
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.busy.set(null);
    }
  }

  async remove(person: Recipient): Promise<void> {
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

  chooseAccess(value: string): void {
    if (value === 'public') {
      if (this.visibility() === 'public') return;
      // A public recipe shows its author; offer the username first when there is none.
      if (this.sharing.username() === null) this.choosingPublic.set(true);
      else void this.publish();
    } else {
      this.choosingPublic.set(false);
      if (this.visibility() === 'public') void this.makePrivate();
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
      if (!this.current(version, recipe)) return;
      this.visibility.set('public');
      this.choosingPublic.set(false);
    } catch (error) {
      if (this.current(version, recipe)) this.error.set(this.message(error));
    } finally {
      if (this.current(version, recipe)) this.busy.set(null);
    }
  }

  private async makePrivate(): Promise<void> {
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

  close(): void {
    this.actions.sharing.set(null);
    this.closeDialog();
  }

  protected backdropClick(event: MouseEvent): void {
    if (this.backdropPressed && event.target === event.currentTarget) this.close();
  }

  /** iOS keeps the layout viewport under the keyboard; lift the sheet by what the keyboard covers. */
  private followKeyboard(): void {
    const viewport = this.document.defaultView?.visualViewport;
    if (!viewport || this.stopKeyboard) return;
    const win = this.document.defaultView!;
    const update = () =>
      this.keyboard.set(
        Math.max(0, Math.round(win.innerHeight - viewport.height - viewport.offsetTop)),
      );
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    this.stopKeyboard = () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      this.keyboard.set(0);
    };
  }

  private closeDialog(): void {
    this.recipe.set(null);
    this.busy.set(null);
    clearTimeout(this.searchTimer);
    this.searchTicket++;
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    this.release();
  }

  private release(): void {
    this.stopKeyboard?.();
    this.stopKeyboard = undefined;
    const unlock = this.unlock;
    this.unlock = undefined;
    unlock?.();
  }

  private current(version: number, recipe: Recipe): boolean {
    return version === this.auth.accountVersion() && this.recipe() === recipe;
  }

  private message(error: unknown): string {
    return error instanceof Error ? t(error.message) : t('Something went wrong. Try again.');
  }
}
