import { DestroyRef, inject, Service, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Service()
export class AppUpdateService {
  readonly available = signal(false);
  readonly offlineReady = signal(false);
  readonly installable = signal(false);
  readonly installed = signal(window.matchMedia('(display-mode: standalone)').matches);
  private installPrompt?: InstallPrompt;
  readonly updates = inject(SwUpdate);
  private lastCheck = 0;

  constructor() {
    const install = (event: Event) => {
      event.preventDefault();
      this.installPrompt = event as InstallPrompt;
      this.installable.set(true);
    };
    const installed = () => {
      this.installed.set(true);
      this.installable.set(false);
    };
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', installed);
    });
    if (!this.updates.isEnabled) return;
    // This worker message completes only after its initial app cache is prepared.
    void this.updates
      .checkForUpdate()
      .then(() => this.offlineReady.set(true))
      .catch(() => undefined);
    this.updates.versionUpdates.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'VERSION_READY') this.available.set(true);
    });
    const check = () => {
      if (
        !navigator.onLine ||
        document.visibilityState !== 'visible' ||
        Date.now() - this.lastCheck < 60 * 60 * 1000
      )
        return;
      this.lastCheck = Date.now();
      void this.updates.checkForUpdate().catch(() => undefined);
    };
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    });
  }

  async install(): Promise<void> {
    const prompt = this.installPrompt;
    if (!prompt) return;
    this.installPrompt = undefined;
    this.installable.set(false);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* The browser’s own installation menu remains available. */
    }
  }

  reload(): void {
    // Reload the entire version together; never hot-swap mismatched lazy bundles.
    // Existing beforeunload protection still applies to unsaved recipes.
    window.location.reload();
  }
}
