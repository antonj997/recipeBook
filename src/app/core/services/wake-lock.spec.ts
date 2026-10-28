import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WakeLockService } from './wake-lock.service';

class FakeSentinel extends EventTarget {
  released = false;
  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

describe('WakeLockService', () => {
  let sentinels: FakeSentinel[];
  let request: ReturnType<typeof vi.fn>;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    sentinels = [];
    visibility = 'visible';
    request = vi.fn(async () => {
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', {
      get: () => visibility,
      configurable: true,
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it('holds one lock while any owner wants the screen on', async () => {
    const wake = TestBed.inject(WakeLockService);
    expect(await wake.acquire('toggle')).toBe(true);
    expect(await wake.acquire('focus')).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(wake.held()).toBe(true);
    await wake.release('toggle');
    expect(sentinels[0]!.released).toBe(false);
    await wake.release('focus');
    expect(sentinels[0]!.released).toBe(true);
    expect(wake.held()).toBe(false);
  });

  it('takes the lock again when the page becomes visible', async () => {
    const wake = TestBed.inject(WakeLockService);
    await wake.acquire('focus');
    visibility = 'hidden';
    await sentinels[0]!.release();
    expect(wake.held()).toBe(false);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(wake.held()).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not take the lock back for owners that already let go', async () => {
    const wake = TestBed.inject(WakeLockService);
    await wake.acquire('focus');
    await wake.release('focus');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports a refused lock and forgets that owner', async () => {
    request.mockRejectedValueOnce(new Error('Battery saver'));
    const wake = TestBed.inject(WakeLockService);
    expect(await wake.acquire('toggle')).toBe(false);
    expect(wake.wants('toggle')).toBe(false);
    expect(wake.held()).toBe(false);
  });

  it('releases a lock that arrives after its owner left', async () => {
    let resolve!: (sentinel: FakeSentinel) => void;
    request.mockImplementationOnce(
      () =>
        new Promise<FakeSentinel>((done) => {
          resolve = (sentinel) => {
            sentinels.push(sentinel);
            done(sentinel);
          };
        }),
    );
    const wake = TestBed.inject(WakeLockService);
    const pending = wake.acquire('focus');
    await wake.release('focus');
    resolve(new FakeSentinel());
    await pending;
    expect(sentinels[0]!.released).toBe(true);
    expect(wake.held()).toBe(false);
  });

  it('lets go of everything when the app is torn down', async () => {
    const wake = TestBed.inject(WakeLockService);
    await wake.acquire('focus');
    TestBed.resetTestingModule();
    expect(sentinels[0]!.released).toBe(true);
  });
});
