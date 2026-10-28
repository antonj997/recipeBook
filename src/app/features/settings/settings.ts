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

@Component({
  selector: 'app-settings',
  imports: [
    SlowMotionSwitchComponent,
    IconComponent,
    RouterLink,
    AccountAccessComponent,
    TimerAlertPreferencesComponent,
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
      ? 'Last backup from this device: ' +
          new Date(at).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }) +
          '.'
      : 'No backup downloaded on this device yet.';
  });
  readonly syncStatus = computed(() => {
    if (!this.cloud.online()) return 'Offline · changes saved on this device';
    if (this.cloud.syncing()) return 'Syncing your cookbook…';
    if (this.cloud.error()) return 'Saved on this device · sync needs attention';
    if (this.cloud.pending()) return this.cloud.pending() + ' changes waiting to sync';
    return this.cloud.lastSynced() ? 'Your cookbook is synced' : 'Checking your cloud cookbook…';
  });
  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
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
        this.message.set('Check your email for a link to reset your password.');
    } catch (error) {
      if (this.current(version))
        this.error.set(error instanceof Error ? error.message : 'Could not send a reset email.');
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
          pending +
            ' changes are saved only on this device. They will upload when you sign back into this account. Keep this browser’s site data until then, or download a backup before leaving.',
          { title: 'Sign out anyway?', confirm: 'Sign out', cancel: 'Stay signed in' },
        ))
      )
        return;
      if (!this.current(version)) return;
      await this.timerAlerts.disableForSignOut().catch(() => undefined);
      if (!this.current(version)) return;
      await this.auth.signOut();
      if (this.active)
        this.message.set(
          'Signed out. Your account’s recipes, shopping list and pending changes stay on this device. Sign back into the same account to see them.',
        );
    } catch (error) {
      if (this.current(version))
        this.error.set(error instanceof Error ? error.message : 'Could not sign out.');
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
        `Prepared a backup containing ${backup.recipes.length} recipes and ${backup.shoppingItems?.length ?? 0} shopping items.`,
      );
    } catch (error) {
      console.error('Export failed:', error);

      if (this.current(version)) this.error.set('Could not export your cookbook.');
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
        throw new Error('Backup file is too large.');
      }

      // Read the selected JSON file.
      const text = await file.text();
      if (!this.current(version)) return;

      const data: unknown = JSON.parse(text);

      // Validate before requesting confirmation.
      const backup = this.recipeService.validateBackup(data);

      const confirmed = await this.confirmation.confirm(
        `Import ${backup.recipes.length} recipes and ${backup.shoppingItems?.length ?? 0} shopping items? ` +
          'Existing recipes and shopping items are kept. Items already imported are skipped.',
        { title: 'Restore this backup?', confirm: 'Import', cancel: 'Cancel' },
      );

      if (!confirmed || !this.current(version)) {
        return;
      }

      // Import the validated backup.
      const result = await this.recipeService.importBackup(backup);
      if (!this.current(version)) return;

      this.message.set(
        `Imported ${result.added} recipes and ${result.shoppingAdded ?? 0} shopping items. ` +
          `Skipped ${result.skipped} existing recipes.`,
      );
    } catch (error) {
      console.error('Import failed:', error);

      if (this.current(version))
        this.error.set(error instanceof Error ? error.message : 'Could not import the backup.');
    } finally {
      this.importing.set(false);

      // Allow the same file to be selected again.
      input.value = '';
    }
  }
}
