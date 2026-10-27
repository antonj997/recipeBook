import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WakeLockService } from '../../core/services/wake-lock.service';
import { ScreenAwakeComponent } from './screen-awake';

describe('Keep screen on', () => {
  const owners = signal<ReadonlySet<string>>(new Set());
  const held = signal(false);
  const lostWhileVisible = signal(false);
  let grant: boolean;
  const wake = {
    supported: true,
    held,
    lostWhileVisible,
    wants: (owner: string) => owners().has(owner),
    acquire: vi.fn(async (owner: string) => {
      if (!grant) return false;
      owners.set(new Set([...owners(), owner]));
      held.set(true);
      return true;
    }),
    release: vi.fn(async (owner: string) => {
      owners.set(new Set([...owners()].filter((name) => name !== owner)));
      held.set(owners().size > 0);
    }),
  };

  beforeEach(() => {
    owners.set(new Set());
    held.set(false);
    lostWhileVisible.set(false);
    grant = true;
    wake.acquire.mockClear();
    wake.release.mockClear();
    TestBed.configureTestingModule({
      imports: [ScreenAwakeComponent],
      providers: [{ provide: WakeLockService, useValue: wake }],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function render() {
    const view = TestBed.createComponent(ScreenAwakeComponent);
    view.detectChanges();
    const button = (view.nativeElement as HTMLElement).querySelector('button')!;
    return { view, button, root: view.nativeElement as HTMLElement };
  }

  it('switches the shared screen lock on and off', async () => {
    const f = render();
    f.button.click();
    await f.view.whenStable();
    f.view.detectChanges();
    expect(wake.acquire).toHaveBeenCalledWith('toggle');
    expect(f.button.getAttribute('aria-checked')).toBe('true');
    f.button.click();
    await f.view.whenStable();
    f.view.detectChanges();
    expect(wake.release).toHaveBeenCalledWith('toggle');
    expect(f.button.getAttribute('aria-checked')).toBe('false');
  });

  it('explains a refused lock', async () => {
    grant = false;
    const f = render();
    f.button.click();
    await f.view.whenStable();
    f.view.detectChanges();
    expect(f.root.querySelector('[role="status"]')?.textContent).toContain(
      'Could not keep the screen on',
    );
  });

  it('says when the browser let go while the toggle was on', async () => {
    const f = render();
    f.button.click();
    await f.view.whenStable();
    held.set(false);
    lostWhileVisible.set(true);
    f.view.detectChanges();
    expect(f.root.querySelector('[role="status"]')?.textContent).toContain('released');
  });

  it('lets go when the recipe view closes', async () => {
    const f = render();
    f.button.click();
    await f.view.whenStable();
    f.view.destroy();
    expect(wake.release).toHaveBeenCalledWith('toggle');
  });
});
