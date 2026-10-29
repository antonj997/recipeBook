import { computed, inject, Service, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { t } from '../i18n/i18n';

export type StorageDurability = 'unknown' | 'persisted' | 'best-effort' | 'unsupported';

export function storageSummary(
  status: StorageDurability,
  signedIn: boolean,
  browserTab: boolean,
): string {
  if (signedIn)
    return t('Your cookbook is kept in your account. This device keeps an offline copy.');
  if (status === 'persisted')
    return t('This device keeps the cookbook until you clear its site data.');
  if (status === 'unsupported' || status === 'unknown')
    return t('This browser does not say whether it keeps the cookbook. Keep a backup.');
  return t(
    browserTab
      ? 'This browser may clear the cookbook on this device after a while. Install Recipebook, sign in or keep a backup.'
      : 'This device may clear the cookbook if storage runs low. Keep a backup.',
  );
}

/** Whether the browser may clear this device's cookbook, and when it was last backed up. */
@Service()
export class StorageDurabilityService {
  private readonly auth = inject(SupabaseService);
  readonly status = signal<StorageDurability>('unknown');
  // Installed apps get their own storage lifetime; a browser tab can be cleared after inactivity.
  readonly browserTab = signal(
    !(typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) &&
      !(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  private readonly backups = signal(0);
  private requested?: Promise<boolean>;
  readonly ready: Promise<void>;

  private get scope(): string {
    return JSON.stringify([this.auth.cacheScope, this.auth.user()?.id ?? 'device']);
  }
  readonly lastBackupAt = computed(() => {
    this.backups();
    return this.read('recipebook:last-backup:' + this.scope);
  });

  constructor() {
    const storage = this.storage;
    this.ready = storage
      ? storage.persisted().then(
          (persisted) => this.status.set(persisted ? 'persisted' : 'best-effort'),
          () => this.status.set('best-effort'),
        )
      : Promise.resolve(this.status.set('unsupported'));
  }

  /** Asks once per session; browsers may grant it silently or decline. */
  ensurePersisted(): Promise<boolean> {
    const storage = this.storage;
    if (!storage) {
      this.status.set('unsupported');
      return Promise.resolve(false);
    }
    this.requested ??= this.ready.then(async () => {
      if (this.status() === 'persisted') return true;
      const granted = await storage.persist().catch(() => false);
      this.status.set(granted ? 'persisted' : 'best-effort');
      return granted;
    });
    return this.requested;
  }

  markBackup(at: string): void {
    this.write('recipebook:last-backup:' + this.scope, at);
    this.backups.update((value) => value + 1);
  }

  /** A signed-out cookbook in a browser tab lives only in storage the browser may clear. */
  shouldNudge(): boolean {
    return (
      !this.auth.user() &&
      this.browserTab() &&
      this.status() !== 'persisted' &&
      !this.read('recipebook:storage-nudged:' + this.auth.cacheScope)
    );
  }

  markNudged(): void {
    this.write('recipebook:storage-nudged:' + this.auth.cacheScope, '1');
  }

  private get storage(): Pick<StorageManager, 'persist' | 'persisted'> | undefined {
    const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
    return typeof storage?.persist === 'function' && typeof storage.persisted === 'function'
      ? storage
      : undefined;
  }
  private read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Status still works for this session. */
    }
  }
}
