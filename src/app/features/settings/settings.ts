import { IconComponent } from '../../shared/components/icon';
import { Component, inject, signal } from '@angular/core';

import { RouterLink } from '@angular/router';

import { RecipeService } from '../../core/services/recipe.service';

@Component({
  selector: 'app-settings',
  imports: [IconComponent, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  private recipeService = inject(RecipeService);

  exporting = signal(false);
  importing = signal(false);

  message = signal('');
  error = signal('');

  // Download the cookbook as JSON.
  async exportBackup(): Promise<void> {
    if (this.exporting()) {
      return;
    }

    this.exporting.set(true);
    this.message.set('');
    this.error.set('');

    try {
      const backup = await this.recipeService.exportBackup();

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

    if (!file || this.importing()) {
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

      const data: unknown = JSON.parse(text);

      // Validate before requesting confirmation.
      const backup = this.recipeService.validateBackup(data);

      const confirmed = window.confirm(
        `Import ${backup.recipes.length} recipes?\n\n` +
          'Recipes already in your cookbook will be skipped.',
      );

      if (!confirmed) {
        return;
      }

      // Import the validated backup.
      const result = await this.recipeService.importBackup(backup);

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
