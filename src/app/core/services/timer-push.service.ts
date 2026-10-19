import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { take } from 'rxjs';
import type { StepTimerTarget } from '../models/step-timer';
import { SupabaseService } from './supabase.service';

interface AlertTimer {
  key: string;
  recipeId: string;
  index: number;
  definitionSeconds: number;
  deadline: number | null;
  revision: number;
}
interface DeviceState {
  deviceId: string;
  enabled: boolean;
  disablePending: boolean;
  revision: number;
  known: AlertTimer[];
  pending: AlertTimer[];
}
interface AccountDevice {
  key: string;
  userId: string;
  version: number;
  client: NonNullable<SupabaseService['client']>;
  state: DeviceState;
  stored?: string | null;
  registered: boolean;
  flushing: boolean;
}
type AlertStatus = 'off' | 'unavailable' | 'loading' | 'pending' | 'enabled' | 'error';
const MAX_PAYLOAD = 64 * 1024;
const MAX_SAVED_TIMERS = 10_000;

@Service()
export class TimerPushService {
  private readonly auth = inject(SupabaseService);
  private readonly push = inject(SwPush, { optional: true });
  private readonly isEnabled = signal(false);
  private readonly currentStatus = signal<AlertStatus>('off');
  private readonly currentMessage = signal('Background timer alerts are off.');
  private readonly working = signal(false);
  private readonly publicKey = signal('');
  private readonly online = signal(navigator.onLine);
  private readonly storageProblem = signal(false);
  private readonly pendingDisable = signal(false);
  private readonly permission = signal(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  readonly enabled = this.isEnabled.asReadonly();
  readonly status = this.currentStatus.asReadonly();
  readonly message = this.currentMessage.asReadonly();
  readonly busy = this.working.asReadonly();
  readonly canEnable = computed(
    () =>
      !!this.auth.user() &&
      !!this.publicKey() &&
      this.online() &&
      !this.busy() &&
      !this.enabled() &&
      !this.storageProblem() &&
      !this.pendingDisable() &&
      this.permission() !== 'denied',
  );
  private account?: AccountDevice;
  private nativeSubscription: PushSubscription | null = null;
  private network: Promise<unknown> = Promise.resolve();
  private debounce?: ReturnType<typeof setTimeout>;
  private alive = true;

  constructor() {
    const destroy = inject(DestroyRef);
    this.push?.subscription.pipe(takeUntilDestroyed()).subscribe((subscription) => {
      this.nativeSubscription = subscription;
      const account = this.account;
      if (account && this.current(account) && account.state.enabled && !this.busy()) {
        account.registered = false;
        if (subscription) this.schedule(account);
        else {
          this.isEnabled.set(false);
          this.setStatus('error', 'Alerts need to be enabled again on this device.');
        }
      }
    });
    effect(() => {
      this.auth.user();
      this.auth.accountVersion();
      this.auth.configured?.();
      untracked(() => this.selectAccount());
    });
    const connection = () => {
      this.online.set(navigator.onLine);
      if (!navigator.onLine) {
        if (this.account?.state.enabled || this.account?.state.disablePending)
          this.setStatus(
            'pending',
            'Offline. Timer alert changes are saved here; reconnect to send them.',
          );
      } else this.retry();
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') return;
      this.permission.set(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
      this.selectAccount();
      const account = this.account;
      if (!account) return;
      const unavailable = this.unavailable();
      if (unavailable) {
        this.isEnabled.set(false);
        this.setStatus('unavailable', unavailable);
        // A blocked permission must never prevent cancellation of an old alert.
        if (
          account.state.disablePending ||
          account.state.pending.some((timer) => timer.deadline === null)
        )
          this.schedule(account, 0);
        return;
      }
      // A fresh SwPush observer reads the browser's current native subscription.
      this.push?.subscription
        .pipe(take(1), takeUntilDestroyed(destroy))
        .subscribe((subscription) => {
          if (!this.current(account)) return;
          this.nativeSubscription = subscription;
          account.registered = false;
          if (account.state.enabled && !subscription) {
            this.isEnabled.set(false);
            this.setStatus('error', 'Enable alerts again to reconnect this device.');
          } else this.retry();
        });
    };
    const storage = (event: StorageEvent) => {
      const account = this.account;
      if (
        !account ||
        !this.current(account) ||
        (event.storageArea && event.storageArea !== localStorage) ||
        (event.key !== null && event.key !== account.key)
      )
        return;
      if (
        this.reloadDevice(account) &&
        (account.state.disablePending || account.state.pending.length)
      )
        this.schedule(account, 0);
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visibility);
    destroy.onDestroy(() => {
      this.alive = false;
      clearTimeout(this.debounce);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
    });
  }

  /** Called with the complete current account's timer collection, including paused timers. */
  replaceTimers(timers: readonly { target: StepTimerTarget; deadline?: number }[]): void {
    this.selectAccount();
    const account = this.account;
    if (!account || !this.current(account) || !account.state.enabled) return;
    const known = new Map(account.state.known.map((timer) => [timer.key, timer]));
    const pending = new Map(account.state.pending.map((timer) => [timer.key, timer]));
    const next = new Map<string, AlertTimer>();
    for (const { target, deadline } of timers) {
      if (typeof deadline !== 'number' || !Number.isSafeInteger(deadline) || deadline <= 0)
        continue;
      const previous = known.get(target.key);
      if (
        previous &&
        previous.deadline === deadline &&
        previous.definitionSeconds === target.seconds
      ) {
        next.set(target.key, previous);
        continue;
      }
      const timer: AlertTimer = {
        key: target.key,
        recipeId: target.recipeId,
        index: target.index,
        definitionSeconds: target.seconds,
        deadline,
        revision: this.revision(account),
      };
      if (!validTimer(timer)) continue;
      next.set(timer.key, timer);
      pending.set(timer.key, timer);
    }
    for (const [key, timer] of known) {
      if (!next.has(key))
        pending.set(key, { ...timer, deadline: null, revision: this.revision(account) });
    }
    account.state.known = [...next.values()];
    account.state.pending = [...pending.values()];
    this.persist(account);
    if (pending.size) {
      this.setStatus(
        'pending',
        navigator.onLine
          ? 'Updating timer alerts. Keep Recipebook open until this finishes.'
          : 'Offline. Timer alert changes are saved here; reconnect to send them.',
      );
      this.schedule(account);
    }
  }

  async enable(): Promise<void> {
    this.selectAccount();
    const account = this.account;
    const key = this.publicKey();
    if (!account || !this.canEnable() || !key || !this.push) return;
    this.working.set(true);
    this.setStatus('loading', 'Enabling timer alerts…');
    try {
      // iOS requires the permission prompt directly in the user's tap, before any await.
      const permission =
        Notification.permission === 'granted'
          ? Promise.resolve<NotificationPermission>('granted')
          : Notification.requestPermission();
      const allowed = await permission;
      if (!this.current(account)) return;
      this.permission.set(allowed);
      if (allowed !== 'granted') {
        this.setStatus('error', permissionHelp());
        return;
      }
      const subscription = await this.push.requestSubscription({ serverPublicKey: key });
      if (!this.current(account)) return;
      this.nativeSubscription = subscription;
      await this.serial(account, async () => {
        await this.invoke(account, {
          action: 'register',
          deviceId: account.state.deviceId,
          subscription: subscription.toJSON(),
        });
        if (!this.current(account)) return;
        account.registered = true;
        account.state.enabled = true;
        account.state.disablePending = false;
        this.pendingDisable.set(false);
        this.refreshKnown(account);
        this.persist(account);
        this.isEnabled.set(true);
        this.setStatus(
          account.state.pending.length ? 'pending' : 'enabled',
          account.state.pending.length
            ? 'Updating timer alerts. Keep Recipebook open until this finishes.'
            : 'Timer alerts are on for this account and device.',
        );
      });
      if (this.current(account)) this.schedule(account);
    } catch {
      if (this.current(account))
        this.setStatus(
          'error',
          Notification.permission === 'denied'
            ? permissionHelp()
            : 'Could not enable alerts. Check your connection and try again.',
        );
    } finally {
      if (this.current(account)) this.working.set(false);
    }
  }

  async disable(): Promise<void> {
    this.selectAccount();
    const account = this.account;
    if (!account || this.busy() || !this.current(account)) return;
    clearTimeout(this.debounce);
    this.debounce = undefined;
    account.state.enabled = false;
    account.state.disablePending = true;
    this.pendingDisable.set(true);
    account.state.known = [];
    account.state.pending = [];
    this.persist(account);
    this.isEnabled.set(false);
    this.working.set(true);
    this.setStatus('pending', 'Turning off background alerts…');
    try {
      if (!navigator.onLine) throw new Error('offline');
      await this.serial(account, async () => {
        await this.invoke(account, { action: 'disable', deviceId: account.state.deviceId });
        if (!this.current(account)) return;
        account.state.disablePending = false;
        this.pendingDisable.set(false);
        account.registered = false;
        this.persist(account);
        this.setStatus('off', 'Background timer alerts are off.');
      });
    } catch {
      if (this.current(account))
        this.setStatus(
          'pending',
          'Connect and retry to finish turning alerts off. Previously scheduled alerts may still arrive.',
        );
    } finally {
      if (this.current(account)) this.working.set(false);
    }
  }

  async disableForSignOut(): Promise<void> {
    // A revoked sign-in session also prevents delivery; an offline disable must not block sign-out.
    if (this.account?.state.enabled || this.account?.state.disablePending) await this.disable();
  }

  retry(): void {
    this.selectAccount();
    const account = this.account;
    if (!account || !this.current(account) || !navigator.onLine || this.busy()) return;
    if (!this.persist(account)) return;
    if (!this.publicKey() && !account.state.disablePending) void this.loadConfig(account);
    else this.schedule(account, 0);
  }

  private selectAccount(): void {
    const user = this.auth.user();
    const client = this.auth.client;
    const key = 'recipebook:timer-push:' + this.auth.cacheScope + ':' + (user?.id ?? '');
    if (this.account?.key === key && this.current(this.account)) {
      this.reloadDevice(this.account);
      return;
    }
    clearTimeout(this.debounce);
    this.debounce = undefined;
    this.account = undefined;
    this.publicKey.set('');
    this.isEnabled.set(false);
    this.working.set(false);
    this.storageProblem.set(false);
    this.pendingDisable.set(false);
    if (!user || !client) {
      this.setStatus(
        'unavailable',
        'Sign in to enable background timer alerts. Local timers still work.',
      );
      return;
    }
    const account: AccountDevice = {
      key,
      userId: user.id,
      version: this.auth.accountVersion(),
      client,
      state: readDevice(key),
      registered: false,
      flushing: false,
    };
    this.account = account;
    this.reloadDevice(account);
    this.pendingDisable.set(account.state.disablePending);
    if (account.state.disablePending) {
      this.setStatus(
        'pending',
        'Connect and retry to finish turning alerts off. Previously scheduled alerts may still arrive.',
      );
      if (navigator.onLine) this.schedule(account, 0);
      return;
    }
    const unavailable = this.unavailable();
    if (unavailable) {
      this.setStatus('unavailable', unavailable);
      return;
    }
    if (!this.persist(account)) return;
    if (account.state.enabled && this.nativeSubscription && Notification.permission === 'granted')
      this.isEnabled.set(true);
    if (!navigator.onLine) {
      this.setStatus('pending', 'Offline. Connect to set up or update background timer alerts.');
      return;
    }
    void this.loadConfig(account);
  }

  private unavailable(): string {
    const appleMobile =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (
      appleMobile &&
      !window.matchMedia?.('(display-mode: standalone)').matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone
    )
      return 'On iPhone or iPad, use Add to Home Screen, then open Recipebook from its icon to enable background alerts.';
    if (typeof Notification === 'undefined' || !this.push?.isEnabled)
      return 'Background alerts are not available here. On iPhone, use Add to Home Screen, then open Recipebook from its icon.';
    if (Notification.permission === 'denied') return permissionHelp();
    return '';
  }

  private async loadConfig(account: AccountDevice): Promise<void> {
    if (!this.current(account) || this.unavailable()) return;
    this.setStatus('loading', 'Checking background timer alerts…');
    try {
      const config = await this.serial(account, () => this.invoke(account, { action: 'config' }));
      if (!this.current(account)) return;
      if (
        !config ||
        config['ready'] !== true ||
        typeof config['publicKey'] !== 'string' ||
        !config['publicKey']
      ) {
        this.setStatus('unavailable', 'Background timer alerts are not set up on the server yet.');
        return;
      }
      this.publicKey.set(config['publicKey']);
      if (account.state.enabled && !this.nativeSubscription) {
        this.isEnabled.set(false);
        this.setStatus('error', 'Enable alerts again to reconnect this device.');
      } else if (account.state.enabled || account.state.disablePending) {
        this.setStatus('pending', 'Reconnecting timer alerts…');
        this.schedule(account, 0);
      } else
        this.setStatus(
          'off',
          'Get timer alerts even when Recipebook is closed. Delivery depends on your device and connection.',
        );
    } catch {
      if (this.current(account))
        this.setStatus(
          'error',
          'Could not check background alerts. Connect to the internet and retry.',
        );
    }
  }

  private schedule(account: AccountDevice, delay = 300): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.flush(account);
    }, delay);
  }

  private async flush(account: AccountDevice): Promise<void> {
    if (!this.current(account) || account.flushing || !navigator.onLine) return;
    account.flushing = true;
    try {
      await this.serial(account, async () => {
        this.reloadDevice(account);
        if (account.state.disablePending) {
          await this.invoke(account, { action: 'disable', deviceId: account.state.deviceId });
          if (!this.current(account)) return;
          account.state.disablePending = false;
          this.pendingDisable.set(false);
          this.persist(account);
          this.setStatus('off', 'Background timer alerts are off.');
          if (!this.publicKey()) void this.loadConfig(account);
          return;
        }
        if (!account.state.enabled) return;
        const subscription = this.nativeSubscription;
        const canDeliver = !this.unavailable() && !!subscription;
        if (canDeliver && subscription && !account.registered) {
          await this.invoke(account, {
            action: 'register',
            deviceId: account.state.deviceId,
            subscription: subscription.toJSON(),
          });
          if (!this.current(account)) return;
          this.reloadDevice(account);
          if (!account.state.enabled) return;
          account.registered = true;
          this.refreshKnown(account);
          this.persist(account);
          this.isEnabled.set(true);
        }
        while (this.current(account) && account.state.enabled && account.state.pending.length) {
          const timers: AlertTimer[] = [];
          for (const timer of account.state.pending
            .filter((timer) => canDeliver || timer.deadline === null)
            .slice(0, 100)) {
            const body = {
              action: 'sync',
              deviceId: account.state.deviceId,
              timers: [...timers, timer],
            };
            if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_PAYLOAD) break;
            timers.push(timer);
          }
          if (!timers.length && !canDeliver) {
            this.setStatus(
              'unavailable',
              this.unavailable() || 'Enable alerts again to reconnect this device.',
            );
            return;
          }
          if (!timers.length) throw new Error('payload');
          const result = await this.invoke(account, {
            action: 'sync',
            deviceId: account.state.deviceId,
            timers,
          });
          if (!this.current(account)) return;
          this.reloadDevice(account);
          const unavailable = Array.isArray(result['unavailable']) ? result['unavailable'] : [];
          const rejected = new Set(
            unavailable.map((item: unknown) =>
              item && typeof item === 'object' && 'key' in item ? item.key : undefined,
            ),
          );
          const sent = new Map(
            timers
              .filter((timer) => !rejected.has(timer.key))
              .map((timer) => [timer.key, timer.revision]),
          );
          account.state.pending = account.state.pending.filter(
            (timer) => sent.get(timer.key) !== timer.revision,
          );
          const rejectedVersions = new Map(
            timers
              .filter((timer) => rejected.has(timer.key))
              .map((timer) => [timer.key, timer.revision]),
          );
          const revised = new Map<string, AlertTimer>();
          account.state.pending = account.state.pending.map((timer) => {
            if (rejectedVersions.get(timer.key) !== timer.revision) return timer;
            // The backend cancels the rejected version. A later retry must supersede it.
            const next = { ...timer, revision: this.revision(account) };
            revised.set(timer.key, next);
            return next;
          });
          account.state.known = account.state.known.map((timer) => revised.get(timer.key) ?? timer);
          this.persist(account);
          if (rejected.size) {
            this.setStatus(
              'pending',
              'Some timer alerts are waiting for recipe sync. Sync your cookbook, then retry alerts.',
            );
            return;
          }
          if (this.debounce) return;
        }
        if (this.current(account) && account.state.enabled) {
          if (canDeliver && !this.unavailable())
            this.setStatus(
              'enabled',
              'Timer alerts are on for this account and device. Delivery depends on your device and connection.',
            );
          else
            this.setStatus(
              'unavailable',
              this.unavailable() || 'Enable alerts again to reconnect this device.',
            );
        }
      });
    } catch {
      if (this.current(account))
        this.setStatus(
          'pending',
          'Timer alert changes have not reached the server. Keep Recipebook open, check your connection and retry.',
        );
    } finally {
      account.flushing = false;
    }
  }

  private serial<T>(account: AccountDevice, operation: () => Promise<T>): Promise<T | undefined> {
    const result = this.network
      .catch(() => undefined)
      .then(() => (this.current(account) ? operation() : undefined));
    this.network = result;
    return result;
  }

  private async invoke(
    account: AccountDevice,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.current(account)) throw new Error('account changed');
    const { data, error } = await account.client.functions.invoke('timer-alerts', {
      body,
      timeout: 10_000,
    });
    if (error || !data || typeof data !== 'object') throw new Error('timer alerts unavailable');
    return data as Record<string, unknown>;
  }

  private current(account: AccountDevice): boolean {
    return (
      this.alive &&
      this.account === account &&
      account.userId === this.auth.user()?.id &&
      account.version === this.auth.accountVersion() &&
      account.client === this.auth.client &&
      account.key === 'recipebook:timer-push:' + this.auth.cacheScope + ':' + account.userId
    );
  }
  private revision(account: AccountDevice): number {
    account.state.revision = Math.max(account.state.revision + 1, Date.now());
    return account.state.revision;
  }
  private refreshKnown(account: AccountDevice): void {
    const pending = new Map(account.state.pending.map((timer) => [timer.key, timer]));
    account.state.known = account.state.known.map((timer) => {
      const refreshed = { ...timer, revision: this.revision(account) };
      pending.set(refreshed.key, refreshed);
      return refreshed;
    });
    account.state.pending = [...pending.values()];
  }
  private persist(account: AccountDevice): boolean {
    if (!this.current(account)) return false;
    try {
      const stored = JSON.stringify(account.state);
      localStorage.setItem(account.key, stored);
      account.stored = stored;
      this.storageProblem.set(false);
      return true;
    } catch {
      this.storageProblem.set(true);
      this.setStatus('error', '');
      return false;
    }
  }
  /** Read the latest value, not event.newValue: queued storage events can already be stale. */
  private reloadDevice(account: AccountDevice): boolean {
    if (!this.current(account)) return false;
    try {
      const stored = localStorage.getItem(account.key);
      if (stored === account.stored) return false;
      const previous = account.state;
      account.state = readDevice(account.key, stored);
      account.stored = stored;
      if (previous.deviceId !== account.state.deviceId || !previous.enabled)
        account.registered = false;
      this.pendingDisable.set(account.state.disablePending);
      this.isEnabled.set(account.state.enabled && !!this.nativeSubscription && !this.unavailable());
      if (!account.state.enabled) {
        clearTimeout(this.debounce);
        this.debounce = undefined;
        this.setStatus(
          account.state.disablePending ? 'pending' : 'off',
          account.state.disablePending
            ? 'Turning off background alerts…'
            : 'Background timer alerts are off.',
        );
      }
      return true;
    } catch {
      this.storageProblem.set(true);
      this.setStatus('error', '');
      return false;
    }
  }
  private setStatus(status: AlertStatus, message: string): void {
    this.currentStatus.set(this.storageProblem() ? 'error' : status);
    this.currentMessage.set(
      this.storageProblem()
        ? 'Device storage is full or unavailable. Keep Recipebook open and retry alert changes before closing.'
        : message,
    );
  }
}

function permissionHelp(): string {
  return 'Notifications are blocked. Allow notifications in your browser or device settings, then enable alerts again.';
}
function validTimer(timer: AlertTimer): boolean {
  return (
    typeof timer.key === 'string' &&
    timer.key.length > 0 &&
    timer.key.length <= 1000 &&
    typeof timer.recipeId === 'string' &&
    timer.recipeId.length > 0 &&
    timer.recipeId.length <= 200 &&
    Number.isSafeInteger(timer.index) &&
    timer.index >= 0 &&
    timer.index < 10_000 &&
    Number.isSafeInteger(timer.definitionSeconds) &&
    timer.definitionSeconds > 0 &&
    timer.definitionSeconds <= 604_800 &&
    (timer.deadline === null || (Number.isSafeInteger(timer.deadline) && timer.deadline > 0)) &&
    Number.isSafeInteger(timer.revision) &&
    timer.revision > 0
  );
}
function readDevice(key: string, stored?: string | null): DeviceState {
  const initial: DeviceState = {
    deviceId: deviceId(),
    enabled: false,
    disablePending: false,
    revision: 0,
    known: [],
    pending: [],
  };
  try {
    const saved: unknown = JSON.parse(
      (stored === undefined ? localStorage.getItem(key) : stored) ?? 'null',
    );
    if (!saved || typeof saved !== 'object') return initial;
    const record = saved as Record<string, unknown>;
    if (typeof record['deviceId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(record['deviceId']))
      return initial;
    const timers = (value: unknown): AlertTimer[] =>
      Array.isArray(value)
        ? value
            .slice(0, MAX_SAVED_TIMERS)
            .filter(
              (item): item is AlertTimer =>
                !!item && typeof item === 'object' && validTimer(item as AlertTimer),
            )
            .map(({ key, recipeId, index, definitionSeconds, deadline, revision }) => ({
              key,
              recipeId,
              index,
              definitionSeconds,
              deadline,
              revision,
            }))
        : [];
    const known = timers(record['known']);
    const pending = timers(record['pending']);
    return {
      deviceId: record['deviceId'],
      enabled: record['enabled'] === true,
      disablePending: record['disablePending'] === true,
      revision: Math.max(
        Number.isSafeInteger(record['revision']) ? (record['revision'] as number) : 0,
        ...known.map((timer) => timer.revision),
        ...pending.map((timer) => timer.revision),
      ),
      known,
      pending,
    };
  } catch {
    return initial;
  }
}

function deviceId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
