import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { CloudCookbookService } from './cloud-cookbook.service';
import { FeedbackService } from './feedback.service';

@Service()
export class GuestRecipesService {
  private readonly cloud = inject(CloudCookbookService);
  private readonly feedback = inject(FeedbackService);
  readonly auth = this.cloud.auth;
  readonly recipes = signal(0);
  readonly categories = signal(0);
  readonly checking = signal(false);
  readonly busy = signal<'add' | 'delete' | null>(null);
  readonly error = signal('');
  private readonly checkedVersion = signal(-1);
  private request = 0;
  readonly required = computed(
    () =>
      !!this.auth.user() &&
      (this.checkedVersion() !== this.auth.accountVersion() ||
        this.recipes() > 0 ||
        this.categories() > 0 ||
        !!this.error()),
  );

  constructor() {
    let previous = this.auth.accountVersion();
    effect(() => {
      const version = this.auth.accountVersion();
      if (previous !== version) {
        previous = version;
        this.error.set('');
        this.busy.set(null);
        this.recipes.set(0);
        this.categories.set(0);
      }
      // Angular effects run after the auth callback. No asynchronous work holds its auth lock.
      untracked(() => void this.refresh());
    });
  }

  async refresh(): Promise<void> {
    const request = ++this.request;
    const version = this.auth.accountVersion();
    if (!this.auth.user()) {
      this.checking.set(false);
      return;
    }
    this.checking.set(true);
    try {
      const counts = await this.cloud.deviceRecordCounts();
      if (version !== this.auth.accountVersion() || request !== this.request) return;
      this.recipes.set(counts.recipes);
      this.categories.set(counts.collections);
      this.error.set('');
      this.checkedVersion.set(version);
    } catch {
      if (version === this.auth.accountVersion() && request === this.request)
        this.error.set('Could not check your device recipes. Your saved data is safe. Try again.');
    } finally {
      if (request === this.request) this.checking.set(false);
    }
  }

  async choose(choice: 'add' | 'delete'): Promise<void> {
    if (this.busy() || this.checking() || !this.auth.user()) return;
    const version = this.auth.accountVersion();
    this.busy.set(choice);
    this.error.set('');
    try {
      await this.cloud.resolveDeviceRecipes(choice);
      if (version !== this.auth.accountVersion()) return;
      await this.refresh();
      if (version !== this.auth.accountVersion()) return;
      if (!this.error())
        this.feedback.show(
          choice === 'add'
            ? 'Device recipes added to your account. Changes saved here will sync when online.'
            : 'Device recipes deleted. Your account cookbook is unchanged.',
        );
    } catch (error) {
      if (version === this.auth.accountVersion())
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Could not finish. Your remaining device recipes are safe. Try again.',
        );
    } finally {
      if (version === this.auth.accountVersion()) this.busy.set(null);
    }
  }
}
