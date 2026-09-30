import { AppUpdateService } from '../../core/services/app-update.service';
import { IconComponent } from '../../shared/components/icon';
import { Component, DestroyRef, inject, signal } from '@angular/core';

import { RouterLink } from '@angular/router';

import { RecipeService } from '../../core/services/recipe.service';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';

@Component({
  selector: 'app-settings',
  imports: [IconComponent, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  private recipeService = inject(RecipeService);
  readonly cloud = inject(CloudCookbookService);
  readonly auth = this.cloud.auth;
  readonly app = inject(AppUpdateService);
  private readonly accountVersion = this.auth.accountVersion();
  private active = true;
  private current(): boolean {
    return this.active && this.accountVersion === this.auth.accountVersion();
  }
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.active = false;
    });
  }
  accountBusy = signal(false);
  email = signal('');
  code = signal('');
  codeSent = signal(false);

  setEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }
  setCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }
  async signIn(event: Event): Promise<void> {
    event.preventDefault();
    if (this.accountBusy()) return;
    this.accountBusy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      if (this.codeSent()) {
        await this.auth.verifyCode(this.email().trim(), this.code().trim());
        this.code.set('');
        this.codeSent.set(false);
        this.message.set('Signed in.');
      } else {
        await this.auth.sendCode(this.email().trim());
        this.codeSent.set(true);
        this.message.set(
          'Open the sign-in link in your email, or enter the code if one is included.',
        );
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      this.accountBusy.set(false);
    }
  }
  async signOut(): Promise<void> {
    this.accountBusy.set(true);
    this.error.set('');
    try {
      await this.auth.signOut();
      this.message.set('Signed out. Your account’s offline copy stays on this device.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      this.accountBusy.set(false);
    }
  }
  async copyDeviceRecipes(): Promise<void> {
    if (!this.current()) return;
    if (
      !window.confirm(
        'Copy recipes from this device into your private cookbook? Existing recipes will be skipped. Your device copy will stay intact.',
      )
    )
      return;
    this.accountBusy.set(true);
    this.error.set('');
    try {
      const result = await this.cloud.copyDeviceCookbook();
      if (!this.current()) return;
      this.message.set(
        `Copied ${result.added} recipes. Skipped ${result.skipped} existing recipes.`,
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not copy recipes.');
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
    if (!this.current() || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    this.message.set('');
    this.error.set('');

    try {
      const backup = await this.recipeService.exportBackup();
      if (!this.current()) return;

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

      this.message.set(`Prepared a backup containing ${backup.recipes.length} recipes.`);
    } catch (error) {
      console.error('Export failed:', error);

      this.error.set('Could not export your cookbook.');
    } finally {
      this.exporting.set(false);
    }
  }

  // Restore recipes from a selected file.
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!this.current() || !file || this.importing()) {
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
      if (!this.current()) return;

      const data: unknown = JSON.parse(text);

      // Validate before requesting confirmation.
      const backup = this.recipeService.validateBackup(data);

      const confirmed = window.confirm(
        `Import ${backup.recipes.length} recipes?\n\n` +
          'Recipes already in your cookbook will be skipped.',
      );

      if (!confirmed || !this.current()) {
        return;
      }

      // Import the validated backup.
      const result = await this.recipeService.importBackup(backup);
      if (!this.current()) return;

      this.message.set(
        `Imported ${result.added} recipes. ` + `Skipped ${result.skipped} existing recipes.`,
      );
    } catch (error) {
      console.error('Import failed:', error);

      this.error.set(error instanceof Error ? error.message : 'Could not import the backup.');
    } finally {
      this.importing.set(false);

      // Allow the same file to be selected again.
      input.value = '';
    }
  }
}
