import { AppUpdateService } from '../../core/services/app-update.service';
import { IconComponent } from '../../shared/components/icon';
import { AccountAccessComponent } from './account-access';
import { TimerAlertPreferencesComponent } from '../../shared/components/timer-alert-preferences';
import { TimerPushService } from '../../core/services/timer-push.service';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';

import { ActivatedRoute, RouterLink } from '@angular/router';

import { RecipeService } from '../../core/services/recipe.service';
import { LeaveConfirmationService } from '../../core/services/leave-confirmation.service';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';
import {
  StorageDurabilityService,
  storageSummary,
} from '../../core/services/storage-durability.service';
import { SlowMotionSwitchComponent } from '../../shared/components/slow-motion-switch';
import { SelectMenuComponent } from '../../shared/components/select-menu';
import {
  dateLocale,
  languagePreference,
  msg,
  plural,
  setLanguagePreference,
  t,
  TranslatePipe,
} from '../../core/i18n/i18n';

@Component({
  selector: 'app-settings',
  imports: [
    SelectMenuComponent,
    SlowMotionSwitchComponent,
    IconComponent,
    RouterLink,
    AccountAccessComponent,
    TimerAlertPreferencesComponent,
    TranslatePipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  private recipeService = inject(RecipeService);
  readonly cloud = inject(CloudCookbookService);
  readonly auth = this.cloud.auth;
  readonly app = inject(AppUpdateService);
  private readonly timerAlerts = inject(TimerPushService);
  private readonly confirmation = inject(LeaveConfirmationService);
  readonly returnToImport =
    inject(ActivatedRoute).snapshot.queryParamMap.get('returnTo') === '/recipes/import';
  private active = true;
  private current(version: number): boolean {
    return this.active && version === this.auth.accountVersion();
  }
  readonly feedbackSection = signal<'account' | 'backup'>('account');
  private readonly durability = inject(StorageDurabilityService);
  readonly storageStatus = computed(() =>
    storageSummary(this.durability.status(), !!this.auth.user(), this.durability.browserTab()),
  );
  readonly lastBackup = computed(() => {
    const at = this.durability.lastBackupAt();
    return at
      ? t('Last backup from this device: {date}.', {
          date: new Date(at).toLocaleDateString(dateLocale(), {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        })
      : t('No backup downloaded on this device yet.');
  });
  // Short enough for one line beside the monogram on a phone.
  readonly syncStatus = computed(() => {
    if (!this.cloud.online()) return t('Offline · saved on this device');
    if (this.cloud.syncing()) return t('Syncing…');
    if (this.cloud.error()) return t('Sync needs attention');
    if (this.cloud.pending())
      return plural(this.cloud.pending(), '{n} change waiting', '{n} changes waiting');
    return t(this.cloud.lastSynced() ? 'Synced' : 'Checking…');
  });
  readonly languagePreference = languagePreference;
  // Language names stay in their own language so anyone can find theirs.
  readonly languageOptions = computed(() => [
    { value: 'auto', label: t('Automatic') },
    { value: 'en', label: 'English' }, // i18n-ignore: a language's own name
    { value: 'sv', label: 'Svenska' }, // i18n-ignore: a language's own name
  ]);
  setLanguage(value: string): void {
    if (value === 'auto' || value === 'en' || value === 'sv') setLanguagePreference(value);
  }
  /** The account card's monogram: the first letter of the email address. */
  initial(email?: string | null): string {
    return (email?.trim()[0] ?? '?').toLocaleUpperCase();
  }
  constructor() {
    let account = this.auth.accountVersion();
    effect(() => {
      const next = this.auth.accountVersion();
      if (next !== account) {
        account = next;
        this.message.set('');
        this.error.set('');
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
    });
  }
  readonly accountBusy = this.auth.busy;
  async requestPasswordReset(): Promise<void> {
    this.feedbackSection.set('account');
    const version = this.auth.accountVersion();
    const email = this.auth.user()?.email;
    if (!email || this.accountBusy()) return;
    this.accountBusy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.auth.sendPasswordReset(email);
      if (this.current(version))
        this.message.set(t('Check your email for a link to reset your password.'));
    } catch (error) {
      if (this.current(version))
        this.error.set(t(error instanceof Error ? error.message : 'Could not send a reset email.'));
    } finally {
      this.accountBusy.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.feedbackSection.set('account');
    if (this.accountBusy()) return;
    const version = this.auth.accountVersion();
    this.accountBusy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const pending = await this.cloud.prepareSignOut();
      if (!this.current(version)) return;
      if (
        pending &&
        !(await this.confirmation.confirm(
          plural(
            pending,
            '{n} change is saved only on this device. It will upload when you sign back into this account. Keep this browser’s site data until then, or download a backup before leaving.',
            '{n} changes are saved only on this device. They will upload when you sign back into this account. Keep this browser’s site data until then, or download a backup before leaving.',
          ),
          { title: t('Sign out anyway?'), confirm: t('Sign out'), cancel: t('Stay signed in') },
        ))
      )
        return;
      if (!this.current(version)) return;
      await this.timerAlerts.disableForSignOut().catch(() => undefined);
      if (!this.current(version)) return;
      await this.auth.signOut();
      if (this.active)
        this.message.set(
          t(
            'Signed out. Your account’s recipes, shopping list and pending changes stay on this device. Sign back into the same account to see them.',
          ),
        );
    } catch (error) {
      if (this.current(version))
        this.error.set(t(error instanceof Error ? error.message : 'Could not sign out.'));
    } finally {
      this.accountBusy.set(false);
    }
  }

  exporting = signal(false);
  importing = signal(false);

  message = signal('');
  error = signal('');

  // Download the cookbook as JSON.
  async exportBackup(): Promise<void> {
    this.feedbackSection.set('backup');
    const version = this.auth.accountVersion();
    if (!this.current(version) || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    this.message.set('');
    this.error.set('');

    try {
      const backup = await this.recipeService.exportBackup();
      if (!this.current(version)) return;

      // Convert the backup into JSON.
      const json = JSON.stringify(backup, null, 2);

      // Create a downloadable file.
      const blob = new Blob([json], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);

      // Create a temporary download link.
      const link = document.createElement('a');

      link.href = url;

      link.download = `recipiebook-backup-${new Date().toISOString().slice(0, 10)}.json`;

      document.body.appendChild(link);

      // Start the download.
      link.click();

      // Clean up.
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
      this.durability.markBackup(backup.exportedAt);

      this.message.set(
        t('Prepared a backup with {recipes} and {items}.', {
          recipes: plural(backup.recipes.length, '{n} recipe', '{n} recipes'),
          items: plural(
            backup.shoppingItems?.length ?? 0,
            '{n} shopping item',
            '{n} shopping items',
          ),
        }),
      );
    } catch (error) {
      console.error('Export failed:', error);

      if (this.current(version)) this.error.set(t('Could not export your cookbook.'));
    } finally {
      this.exporting.set(false);
    }
  }

  // Restore recipes from a selected file.
  async onFileSelected(event: Event): Promise<void> {
    this.feedbackSection.set('backup');
    const version = this.auth.accountVersion();
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!this.current(version) || !file || this.importing()) {
      return;
    }

    this.importing.set(true);
    this.message.set('');
    this.error.set('');

    try {
      // Reject unusually large files.
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(msg('Backup file is too large.'));
      }

      // Read the selected JSON file.
      const text = await file.text();
      if (!this.current(version)) return;

      const data: unknown = JSON.parse(text);

      // Validate before requesting confirmation.
      const backup = this.recipeService.validateBackup(data);

      const confirmed = await this.confirmation.confirm(
        t(
          'Import {recipes} and {items}? Existing recipes and shopping items are kept. Items already imported are skipped.',
          {
            recipes: plural(backup.recipes.length, '{n} recipe', '{n} recipes'),
            items: plural(
              backup.shoppingItems?.length ?? 0,
              '{n} shopping item',
              '{n} shopping items',
            ),
          },
        ),
        { title: t('Restore this backup?'), confirm: t('Import'), cancel: t('Cancel') },
      );

      if (!confirmed || !this.current(version)) {
        return;
      }

      // Import the validated backup.
      const result = await this.recipeService.importBackup(backup);
      if (!this.current(version)) return;

      this.message.set(
        t('Imported {recipes} and {items}. Skipped {skipped}.', {
          recipes: plural(result.added, '{n} recipe', '{n} recipes'),
          items: plural(result.shoppingAdded ?? 0, '{n} shopping item', '{n} shopping items'),
          skipped: plural(result.skipped, '{n} existing recipe', '{n} existing recipes'),
        }),
      );
    } catch (error) {
      console.error('Import failed:', error);

      if (this.current(version))
        this.error.set(t(error instanceof Error ? error.message : 'Could not import the backup.'));
    } finally {
      this.importing.set(false);

      // Allow the same file to be selected again.
      input.value = '';
    }
  }
}
