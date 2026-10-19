import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerPushService } from './timer-push.service';
import { SupabaseService } from './supabase.service';

describe('optional timer push alerts', () => {
  const user = signal<{ id: string } | null>({ id: 'account-a' });
  const accountVersion = signal(1);
  const subscription = new BehaviorSubject<PushSubscription | null>(null);
  const nativeSubscription = {
    toJSON: () => ({
      endpoint: 'https://push.example/test',
      keys: { p256dh: 'public', auth: 'key' },
    }),
  } as unknown as PushSubscription;
  const invoke = vi.fn();
  const requestSubscription = vi.fn();
  const unsubscribe = vi.fn();
  const target = { key: 'step-1', recipeId: 'recipe-1', index: 0, seconds: 120 };
  let online = true;

  function configure(): TimerPushService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            user,
            accountVersion,
            configured: signal(true),
            cacheScope: 'push-tests',
            client: { functions: { invoke } },
          },
        },
        {
          provide: SwPush,
          useValue: { isEnabled: true, subscription, requestSubscription, unsubscribe },
        },
      ],
    });
    const service = TestBed.inject(TimerPushService);
    TestBed.tick();
    return service;
  }
  async function ready(): Promise<TimerPushService> {
    const service = configure();
    await vi.advanceTimersByTimeAsync(0);
    await service.enable();
    await vi.advanceTimersByTimeAsync(0);
    invoke.mockClear();
    return service;
  }
  const syncs = () => invoke.mock.calls.filter(([, options]) => options.body.action === 'sync');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    localStorage.clear();
    user.set({ id: 'account-a' });
    accountVersion.set(1);
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    subscription.next(null);
    invoke.mockReset().mockImplementation(async (_name, options) => ({
      data:
        options.body.action === 'config' ? { ready: true, publicKey: 'public-key' } : { ok: true },
      error: null,
    }));
    requestSubscription.mockReset().mockImplementation(async () => {
      subscription.next(nativeSubscription);
      return nativeSubscription;
    });
    unsubscribe.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('requests permission during the enable gesture before asynchronous subscription work', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });
    const service = configure();
    await vi.advanceTimersByTimeAsync(0);
    const enabling = service.enable();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(service.enabled()).toBe(false);
    await enabling;
    expect(service.enabled()).toBe(true);
  });

  it('coalesces held adjustments and sends a newer cancellation for removed timers', async () => {
    const service = await ready();
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    service.replaceTimers([{ target, deadline: Date.now() + 180_000 }]);
    service.replaceTimers([{ target, deadline: Date.now() + 240_000 }]);
    await vi.advanceTimersByTimeAsync(299);
    expect(syncs()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncs()).toHaveLength(1);
    const first = syncs()[0][1].body.timers[0];
    expect(first.deadline).toBe(Date.now() - 300 + 240_000);
    service.replaceTimers([]);
    await vi.advanceTimersByTimeAsync(300);
    const cancel = syncs()[1][1].body.timers[0];
    expect(cancel).toMatchObject({ key: target.key, deadline: null });
    expect(cancel.revision).toBeGreaterThan(first.revision);
  });

  it('restores offline cancellations after reload and retries them online', async () => {
    let service = await ready();
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    online = false;
    window.dispatchEvent(new Event('offline'));
    service.replaceTimers([]);
    await vi.advanceTimersByTimeAsync(300);
    TestBed.resetTestingModule();
    invoke.mockClear();
    service = configure();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(0);
    expect(service.message()).toMatch(/offline|connection/i);
    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs().at(-1)?.[1].body.timers).toEqual([
      expect.objectContaining({ key: target.key, deadline: null }),
    ]);
  });

  it('reconnects an unchanged overdue run without creating a new delivery revision', async () => {
    const service = await ready();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const deadline = Date.now() - 61_000;
    service.replaceTimers([{ target, deadline }]);
    await vi.advanceTimersByTimeAsync(300);
    const original = { ...syncs()[0][1].body.timers[0] };
    invoke.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300);
    const reconnected = syncs().at(-1)?.[1].body.timers[0];
    expect(reconnected).toEqual(original);
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs().at(-1)?.[1].body.timers[0].revision).toBeGreaterThan(original.revision);
  });

  it('keeps a cancellation queued when an older schedule is still in flight', async () => {
    const service = await ready();
    let acknowledge!: (value: unknown) => void;
    let first = true;
    invoke.mockImplementation(async (_name, options) => {
      if (options.body.action === 'sync' && first) {
        first = false;
        return new Promise(resolve => { acknowledge = resolve; });
      }
      return { data: {ok:true}, error:null };
    });
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    service.replaceTimers([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs()).toHaveLength(1);
    acknowledge({ data: { ok: true }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(2);
    expect(syncs()[1][1].body.timers[0].deadline).toBeNull();
  });

  it('ignores a completed registration after the account changes', async () => {
    const service = configure();
    await vi.advanceTimersByTimeAsync(0);
    let acknowledge!: (value: unknown) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const enabling = service.enable();
    await vi.advanceTimersByTimeAsync(0);
    user.set({ id: 'account-b' });
    accountVersion.update((value) => value + 1);
    TestBed.tick();
    acknowledge({ data: { ok: true }, error: null });
    await enabling;
    expect(service.enabled()).toBe(false);
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs()).toHaveLength(0);
  });

  it('finishes a saved disable after reload even when notification permission was revoked', async () => {
    const service = await ready();
    online = false;
    window.dispatchEvent(new Event('offline'));
    await service.disable();
    expect(service.message()).toMatch(/previously scheduled alerts may still arrive/i);
    TestBed.resetTestingModule();
    online = true;
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    invoke.mockClear();
    const restored = configure();
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke.mock.calls.some(([, options]) => options.body.action === 'disable')).toBe(true);
    expect(restored.status()).toBe('off');
  });

  it('requires durable device storage before opting into background alerts', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const service = configure();
    await vi.advanceTimersByTimeAsync(0);
    await service.enable();
    expect(service.enabled()).toBe(false);
    expect(service.canEnable()).toBe(false);
    expect(service.message()).toMatch(/storage/i);
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it('keeps an unsynced recipe pending until the server accepts it on retry', async () => {
    const service = await ready();
    let first = true;
    invoke.mockImplementation(async (_name, options) => {
      if (options.body.action !== 'sync' || !first) return {data:{ok:true},error:null};
      first = false;
      return {
      data: {
        ok: true,
        scheduled: 0,
        unavailable: [{ key: target.key, reason: 'recipe-not-synced' }],
      },
      error: null,
    };
    });
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    expect(service.status()).toBe('pending');
    expect(service.message()).toMatch(/sync your cookbook.*retry/i);
    service.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncs()).toHaveLength(2);
    // A rejected version is a backend tombstone; retry must supersede it.
    expect(syncs()[1][1].body.timers[0].revision).toBeGreaterThan(
      syncs()[0][1].body.timers[0].revision,
    );
    expect(service.status()).toBe('enabled');
  });

  it('splits large syncs into serialized batches within the endpoint limits', async () => {
    const service = await ready();
    service.replaceTimers(
      Array.from({ length: 151 }, (_, index) => ({
        target: { ...target, key: 'é'.repeat(248) + index, index },
        deadline: Date.now() + 120_000,
      })),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs().length).toBeGreaterThan(1);
    expect(syncs().flatMap(([, options]) => options.body.timers)).toHaveLength(151);
    for (const [, options] of syncs()) {
      expect(options.body.timers.length).toBeLessThanOrEqual(100);
      expect(new TextEncoder().encode(JSON.stringify(options.body)).byteLength).toBeLessThanOrEqual(
        64 * 1024,
      );
    }
  });

  it('explains the Home Screen requirement in an iPhone browser tab', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15',
    );
    const service = configure();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.canEnable()).toBe(false);
    expect(service.message()).toMatch(/home screen/i);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it('accepts timer keys and recipe IDs at the endpoint bounds', async () => {
    const service = await ready();
    const boundary = { ...target, key: 'x'.repeat(1000), recipeId: 'r'.repeat(200) };
    service.replaceTimers([{ target: boundary, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs()[0]?.[1].body.timers[0]).toMatchObject({
      key: boundary.key,
      recipeId: boundary.recipeId,
    });
  });

  it('reflects revoked permission on return while still sending timer cancellations', async () => {
    const service = await ready();
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.enabled()).toBe(false);
    expect(service.message()).toMatch(/blocked|device settings/i);
    service.replaceTimers([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs().at(-1)?.[1].body.timers[0].deadline).toBeNull();
    expect(service.status()).not.toBe('enabled');
  });

  it('reads another tab cancellation before reconnecting, even before a storage event arrives', async () => {
    await ready();
    const key = 'recipebook:timer-push:push-tests:account-a';
    const service = TestBed.inject(TimerPushService);
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    await vi.advanceTimersByTimeAsync(300);
    const saved = JSON.parse(localStorage.getItem(key)!);
    const cancellation = { ...saved.known[0], deadline: null, revision: saved.revision + 1 };
    localStorage.setItem(
      key,
      JSON.stringify({
        ...saved,
        revision: cancellation.revision,
        known: [],
        pending: [cancellation],
      }),
    );
    invoke.mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs().flatMap(([, options]) => options.body.timers)).toEqual([cancellation]);
  });

  it('adopts another tab disabled preference without writing it back or reviving a pending timer', async () => {
    const service = await ready();
    service.replaceTimers([{ target, deadline: Date.now() + 120_000 }]);
    const key = 'recipebook:timer-push:push-tests:account-a';
    const saved = JSON.parse(localStorage.getItem(key)!);
    const value = JSON.stringify({
      ...saved,
      enabled: false,
      disablePending: false,
      known: [],
      pending: [],
    });
    localStorage.setItem(key, value);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(service.enabled()).toBe(false);
    expect(service.status()).toBe('off');
    expect(syncs()).toHaveLength(0);
    expect(write).not.toHaveBeenCalled();
  });

  it('ignores another account storage events', async () => {
    const service = await ready();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'recipebook:timer-push:push-tests:account-b',
        newValue: null,
        storageArea: localStorage,
      }),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(service.enabled()).toBe(true);
    expect(syncs()).toHaveLength(0);
  });

  it('does not queue unsupported step indices', async () => {
    const service = await ready();
    service.replaceTimers([
      { target: { ...target, index: 10_000 }, deadline: Date.now() + 120_000 },
    ]);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncs()).toHaveLength(0);
  });
  it('reports visible timer activity per tab and clears only this tab when hidden', async () => {
    const visible=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    const service=await ready();
    service.replaceTimers([{target,deadline:Date.now()+120_000}]);
    await vi.advanceTimersByTimeAsync(300);
    const presences=()=>invoke.mock.calls.filter(([,options])=>options.body.action==='presence');
    expect(presences().at(-1)?.[1].body).toMatchObject({visible:true});
    const tabId=presences().at(-1)?.[1].body.tabId;
    expect(tabId).toMatch(/^[0-9a-f-]{36}$/i);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(presences().filter(([,options])=>options.body.visible)).toHaveLength(2);
    visible.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(presences().at(-1)?.[1].body).toMatchObject({visible:false,tabId});
    const count=presences().length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(presences()).toHaveLength(count);
  });
  it('stops presence activity when the final timer is reset or the account changes', async () => {
    vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    const service=await ready();
    service.replaceTimers([{target,deadline:Date.now()+120_000}]);
    await vi.advanceTimersByTimeAsync(300);
    service.replaceTimers([]);
    await vi.advanceTimersByTimeAsync(300);
    const presences=()=>invoke.mock.calls.filter(([,options])=>options.body.action==='presence');
    expect(presences().at(-1)?.[1].body.visible).toBe(false);
    user.set(null); accountVersion.update(v=>v+1); TestBed.tick();
    const count=presences().length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(presences()).toHaveLength(count);
  });

});
