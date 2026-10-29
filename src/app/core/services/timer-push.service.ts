import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { take } from 'rxjs';
import type { StepTimerTarget } from '../models/step-timer';
import { SupabaseService } from './supabase.service';
import { msg } from '../i18n/i18n';

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
  private readonly currentMessage = signal(msg('Background timer alerts are off.'));
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
  private readonly tabId = deviceId();
  private presenceTimer?: ReturnType<typeof setInterval>;
  private presenceNetwork: Promise<unknown> = Promise.resolve();
  private lastPresenceVisible = false;
  private lastPresenceAt = 0;

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
          this.setStatus('error', msg('Alerts need to be enabled again on this device.'));
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
            msg('Offline. Timer alert changes are saved here; reconnect to send them.'),
          );
      } else this.retry();
      if (this.account) this.updatePresence(this.account);
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible') {
        if (this.account) this.updatePresence(this.account);
        return;
      }
      this.permission.set(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
      this.selectAccount();
      const account = this.account;
      if (!account) return;
      this.updatePresence(account, true);
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
            this.setStatus('error', msg('Enable alerts again to reconnect this device.'));
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
    const pagehide = () => {
      if (this.account) this.updatePresence(this.account, true, true);
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    destroy.onDestroy(() => {
      this.alive = false;
      clearInterval(this.presenceTimer);
      clearTimeout(this.debounce);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pagehide);
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
    this.updatePresence(account);
    if (pending.size) {
      this.setStatus(
        'pending',
        navigator.onLine
          ? msg('Updating timer alerts. Keep Recipebook open until this finishes.')
          : msg('Offline. Timer alert changes are saved here; reconnect to send them.'),
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
    this.setStatus('loading', msg('Enabling timer alerts…'));
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
        this.updatePresence(account, true);
        this.setStatus(
          account.state.pending.length ? 'pending' : 'enabled',
          account.state.pending.length
            ? msg('Updating timer alerts. Keep Recipebook open until this finishes.')
            : msg('Timer alerts are on for this account and device.'),
        );
      });
      if (this.current(account)) this.schedule(account);
    } catch {
      if (this.current(account))
        this.setStatus(
          'error',
          Notification.permission === 'denied'
            ? permissionHelp()
            : msg('Could not enable alerts. Check your connection and try again.'),
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
    this.updatePresence(account);
    account.state.disablePending = true;
    this.pendingDisable.set(true);
    account.state.known = [];
    account.state.pending = [];
    this.persist(account);
    this.isEnabled.set(false);
    this.working.set(true);
    this.setStatus('pending', msg('Turning off background alerts…'));
    try {
      if (!navigator.onLine) throw new Error('offline');
      await this.serial(account, async () => {
        await this.invoke(account, { action: 'disable', deviceId: account.state.deviceId });
        if (!this.current(account)) return;
        account.state.disablePending = false;
        this.pendingDisable.set(false);
        account.registered = false;
        this.persist(account);
        this.setStatus('off', msg('Background timer alerts are off.'));
      });
    } catch {
      if (this.current(account))
        this.setStatus(
          'pending',
          msg(
            'Connect and retry to finish turning alerts off. Previously scheduled alerts may still arrive.',
          ),
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
    clearInterval(this.presenceTimer);
    this.presenceTimer = undefined;
    this.lastPresenceVisible = false;
    this.lastPresenceAt = 0;
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
        msg('Sign in to enable background timer alerts. Local timers still work.'),
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
        msg(
          'Connect and retry to finish turning alerts off. Previously scheduled alerts may still arrive.',
        ),
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
      this.setStatus(
        'pending',
        msg('Offline. Connect to set up or update background timer alerts.'),
      );
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
      return msg(
        'On iPhone or iPad, use Add to Home Screen, then open Recipebook from its icon to enable background alerts.',
      );
    if (typeof Notification === 'undefined' || !this.push?.isEnabled)
      return msg(
        'Background alerts are not available here. On iPhone, use Add to Home Screen, then open Recipebook from its icon.',
      );
    if (Notification.permission === 'denied') return permissionHelp();
    return '';
  }

  private async loadConfig(account: AccountDevice): Promise<void> {
    if (!this.current(account) || this.unavailable()) return;
    this.setStatus('loading', msg('Checking background timer alerts…'));
    try {
      const config = await this.serial(account, () => this.invoke(account, { action: 'config' }));
      if (!this.current(account)) return;
      if (
        !config ||
        config['ready'] !== true ||
        typeof config['publicKey'] !== 'string' ||
        !config['publicKey']
      ) {
        this.setStatus(
          'unavailable',
          msg('Background timer alerts are not set up on the server yet.'),
        );
        return;
      }
      this.publicKey.set(config['publicKey']);
      if (account.state.enabled && !this.nativeSubscription) {
        this.isEnabled.set(false);
        this.setStatus('error', msg('Enable alerts again to reconnect this device.'));
      } else if (account.state.enabled || account.state.disablePending) {
        this.setStatus('pending', msg('Reconnecting timer alerts…'));
        this.schedule(account, 0);
      } else
        this.setStatus(
          'off',
          msg(
            'Get timer alerts even when Recipebook is closed. Delivery depends on your device and connection.',
          ),
        );
    } catch {
      if (this.current(account))
        this.setStatus(
          'error',
          msg('Could not check background alerts. Connect to the internet and retry.'),
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
          this.setStatus('off', msg('Background timer alerts are off.'));
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
          this.updatePresence(account, true);
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
              this.unavailable() || msg('Enable alerts again to reconnect this device.'),
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
              msg(
                'Some timer alerts are waiting for recipe sync. Sync your cookbook, then retry alerts.',
              ),
            );
            return;
          }
          if (this.debounce) return;
        }
        if (this.current(account) && account.state.enabled) {
          if (canDeliver && !this.unavailable())
            this.setStatus(
              'enabled',
              msg(
                'Timer alerts are on for this account and device. Delivery depends on your device and connection.',
              ),
            );
          else
            this.setStatus(
              'unavailable',
              this.unavailable() || msg('Enable alerts again to reconnect this device.'),
            );
        }
      });
    } catch {
      if (this.current(account))
        this.setStatus(
          'pending',
          msg(
            'Timer alert changes have not reached the server. Keep Recipebook open, check your connection and retry.',
          ),
        );
    } finally {
      account.flushing = false;
    }
  }

  /** Each tab owns a short server lease. Hiding one tab cannot clear a visible sibling. */
  private updatePresence(account: AccountDevice, force = false, leaving = false): void {
    const active =
      this.current(account) &&
      account.state.enabled &&
      account.registered &&
      navigator.onLine &&
      account.state.known.some(
        (timer) => timer.deadline !== null && timer.deadline > Date.now() - 360_000,
      );
    const visible = !leaving && active && document.visibilityState === 'visible';
    if (visible && this.presenceTimer === undefined)
      this.presenceTimer = setInterval(() => this.updatePresence(account), 10_000);
    if (!visible) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = undefined;
    }
    if (!this.current(account) || !account.registered || !navigator.onLine) return;
    if (
      (!visible && !this.lastPresenceVisible) ||
      (visible && this.lastPresenceVisible && !force && Date.now() - this.lastPresenceAt < 8000)
    )
      return;
    this.lastPresenceVisible = visible;
    this.lastPresenceAt = Date.now();
    this.presenceNetwork = this.presenceNetwork
      .catch(() => undefined)
      .then(async () => {
        if (!this.current(account) || !account.registered || !navigator.onLine) return;
        // Recheck at send time so an enqueued heartbeat cannot outlive a hide/reset.
        const currentlyVisible =
          !leaving &&
          account.state.enabled &&
          document.visibilityState === 'visible' &&
          account.state.known.some(
            (timer) => timer.deadline !== null && timer.deadline > Date.now() - 360_000,
          );
        await this.invoke(
          account,
          {
            action: 'presence',
            deviceId: account.state.deviceId,
            tabId: this.tabId,
            visible: currentlyVisible,
          },
          3000,
        );
      })
      .catch(() => {
        this.lastPresenceAt = 0; /* Presence is best effort; alerts must remain deliverable. */
      });
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
    timeout = 10_000,
  ): Promise<Record<string, unknown>> {
    if (!this.current(account)) throw new Error('account changed');
    const { data, error } = await account.client.functions.invoke('timer-alerts', {
      body,
      timeout,
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
    // Reconnecting resends the same run; only a timer change creates a newer revision.
    for (const timer of account.state.known) {
      const queued = pending.get(timer.key);
      if (!queued || queued.revision < timer.revision) pending.set(timer.key, timer);
    }
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
            ? msg('Turning off background alerts…')
            : msg('Background timer alerts are off.'),
        );
      }
      this.updatePresence(account);
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
        ? msg(
            'Device storage is full or unavailable. Keep Recipebook open and retry alert changes before closing.',
          )
        : message,
    );
  }
}

function permissionHelp(): string {
  return msg(
    'Notifications are blocked. Allow notifications in your browser or device settings, then enable alerts again.',
  );
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
