import { DestroyRef, inject, Service, signal } from '@angular/core';

/**
 * One screen wake lock shared by everything that wants the screen on: the Keep screen on toggle
 * and focus mode. The browser drops the lock when the page is hidden; it is taken again when
 * the page returns while someone still wants it.
 */
@Service()
export class WakeLockService {
  private readonly owners = signal<ReadonlySet<string>>(new Set());
  /** The browser currently keeps the screen on. */
  readonly held = signal(false);
  /** The browser let go while the page was visible, for example to save battery. */
  readonly lostWhileVisible = signal(false);
  private lock?: WakeLockSentinel;
  private pending?: Promise<boolean>;
  private alive = true;

  get supported(): boolean {
    return window.isSecureContext && 'wakeLock' in navigator;
  }

  constructor() {
    const visible = () => {
      if (document.visibilityState === 'visible' && this.owners().size) void this.request();
    };
    document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.owners.set(new Set());
      document.removeEventListener('visibilitychange', visible);
      void this.drop();
    });
  }

  wants(owner: string): boolean {
    return this.owners().has(owner);
  }

  /** Resolves false when the browser refuses; that owner is then forgotten. */
  async acquire(owner: string): Promise<boolean> {
    if (!this.supported || !this.alive) return false;
    this.owners.update((owners) => new Set(owners).add(owner));
    const held = await this.request();
    if (!held && this.wants(owner) && !this.held()) this.forget(owner);
    return held && this.wants(owner);
  }

  async release(owner: string): Promise<void> {
    this.forget(owner);
    if (!this.owners().size) await this.drop();
  }

  private forget(owner: string): void {
    this.owners.update((owners) => {
      const next = new Set(owners);
      next.delete(owner);
      return next;
    });
  }

  private async drop(): Promise<void> {
    const lock = this.lock;
    this.lock = undefined;
    this.held.set(false);
    this.lostWhileVisible.set(false);
    await lock?.release().catch(() => undefined);
  }

  private request(): Promise<boolean> {
    if (this.lock && !this.lock.released) return Promise.resolve(true);
    this.pending ??= (async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        // Everyone may have let go while the browser was deciding.
        if (!this.alive || !this.owners().size) {
          await lock.release().catch(() => undefined);
          return false;
        }
        this.lock = lock;
        this.held.set(true);
        this.lostWhileVisible.set(false);
        lock.addEventListener('release', () => {
          if (this.lock !== lock) return;
          this.lock = undefined;
          this.held.set(false);
          this.lostWhileVisible.set(document.visibilityState === 'visible');
        });
        return true;
      } catch {
        return false;
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
}
