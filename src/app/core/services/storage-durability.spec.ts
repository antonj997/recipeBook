import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageDurabilityService, storageSummary } from './storage-durability.service';
import { SupabaseService } from './supabase.service';

describe('StorageDurabilityService', () => {
  const user = signal<{ id: string } | null>(null);
  let persisted: boolean;
  let persist: ReturnType<typeof vi.fn>;

  function useStorage(storage: unknown) {
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
  }
  function create() {
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { user, cacheScope: 'https://example.test/' } },
      ],
    });
    return TestBed.inject(StorageDurabilityService);
  }

  beforeEach(() => {
    localStorage.clear();
    user.set(null);
    persisted = false;
    persist = vi.fn(async () => {
      persisted = true;
      return true;
    });
    useStorage({ persisted: async () => persisted, persist });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    useStorage(undefined);
  });

  it('reports storage the browser already keeps as persisted', async () => {
    persisted = true;
    const service = create();
    await service.ready;
    expect(service.status()).toBe('persisted');
  });

  it('asks the browser to persist storage at most once per session', async () => {
    const service = create();
    await service.ready;
    expect(service.status()).toBe('best-effort');
    expect(await service.ensurePersisted()).toBe(true);
    expect(await service.ensurePersisted()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('persisted');
  });

  it('keeps best-effort storage when the browser declines', async () => {
    persist.mockResolvedValue(false);
    const service = create();
    expect(await service.ensurePersisted()).toBe(false);
    expect(service.status()).toBe('best-effort');
  });

  it('reports unsupported storage without the StorageManager API', async () => {
    useStorage(undefined);
    const service = create();
    await service.ready;
    expect(await service.ensurePersisted()).toBe(false);
    expect(service.status()).toBe('unsupported');
  });

  it('remembers the last backup separately for each account and the device', () => {
    const service = create();
    service.markBackup('2026-10-27T10:00:00.000Z');
    expect(service.lastBackupAt()).toBe('2026-10-27T10:00:00.000Z');
    user.set({ id: 'alice' });
    expect(service.lastBackupAt()).toBeNull();
    service.markBackup('2026-10-28T10:00:00.000Z');
    user.set(null);
    expect(service.lastBackupAt()).toBe('2026-10-27T10:00:00.000Z');
  });

  it('nudges a signed-out browser-tab user only once and only without persistence', async () => {
    const service = create();
    await service.ready;
    expect(service.shouldNudge()).toBe(true);
    service.markNudged();
    expect(service.shouldNudge()).toBe(false);
    TestBed.resetTestingModule();
    const later = create();
    await later.ready;
    expect(later.shouldNudge()).toBe(false);
  });

  it('never nudges a signed-in user, whose cookbook also lives in the cloud', async () => {
    user.set({ id: 'alice' });
    const service = create();
    await service.ready;
    expect(service.shouldNudge()).toBe(false);
  });

  it('never nudges once storage is persisted', async () => {
    persisted = true;
    const service = create();
    await service.ready;
    expect(service.shouldNudge()).toBe(false);
  });
});

describe('storageSummary', () => {
  it('reassures signed-in users that the account holds the cookbook', () => {
    expect(storageSummary('best-effort', true, true)).toBe(
      'Your cookbook is kept in your account. This device keeps an offline copy.',
    );
  });
  it('warns a browser tab that the browser may clear the device cookbook', () => {
    expect(storageSummary('best-effort', false, true)).toBe(
      'This browser may clear the cookbook on this device after a while. Install Recipebook, sign in or keep a backup.',
    );
  });
  it('names low storage as the risk for an installed app without persistence', () => {
    expect(storageSummary('best-effort', false, false)).toBe(
      'This device may clear the cookbook if storage runs low. Keep a backup.',
    );
  });
  it('confirms persisted storage', () => {
    expect(storageSummary('persisted', false, true)).toBe(
      'This device keeps the cookbook until you clear its site data.',
    );
  });
  it('admits when the browser does not say', () => {
    expect(storageSummary('unsupported', false, true)).toBe(
      'This browser does not say whether it keeps the cookbook. Keep a backup.',
    );
  });
});
