import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerAlertPreferencesComponent } from './timer-alert-preferences';
import { TimerPushService } from '../../core/services/timer-push.service';
import { SupabaseService } from '../../core/services/supabase.service';

describe('contextual timer alert reminder', () => {
  const user = signal<{ id: string } | null>(null);
  const enabled = signal(false);
  const status = signal('off');
  const busy = signal(false);
  const enable = vi.fn();
  const disable = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    user.set(null);
    enabled.set(false);
    status.set('off');
    busy.set(false);
    TestBed.configureTestingModule({
      imports: [TimerAlertPreferencesComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: { cacheScope: 'reminder-tests', user, accountVersion: signal(0) },
        },
        {
          provide: TimerPushService,
          useValue: {
            enabled,
            status,
            busy,
            enable,
            disable,
            retry: vi.fn(),
            canEnable: signal(true),
            message: signal('Background timer alerts are off.'),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function fixture(contextual = true) {
    const view = TestBed.createComponent(TimerAlertPreferencesComponent);
    if (contextual) view.componentRef.setInput('contextual', true);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    return { view, root };
  }

  function dismiss(root: HTMLElement) {
    const close = root.querySelector<HTMLButtonElement>('[aria-label="Keep timer alerts off"]');
    expect(close, 'the recipe reminder can be dismissed without enabling alerts').not.toBeNull();
    close!.click();
  }

  it('hides the recipe reminder immediately when alerts become enabled', () => {
    const f = fixture();
    expect(f.root.hidden).toBe(false);
    enabled.set(true);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });

  it('remembers a dismissal across component recreation without changing alert permission', () => {
    const f = fixture();
    dismiss(f.root);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
    expect(enabled()).toBe(false);
    expect(enable).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    f.view.destroy();
    expect(fixture().root.hidden).toBe(true);
  });

  it('isolates saved dismissal for the device and each account when switching accounts', () => {
    const f = fixture();
    dismiss(f.root);
    user.set({ id: 'account-a' });
    f.view.detectChanges();
    expect(f.root.hidden).toBe(false);
    dismiss(f.root);
    user.set({ id: 'account-b' });
    f.view.detectChanges();
    expect(f.root.hidden).toBe(false);
    user.set({ id: 'account-a' });
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
    user.set(null);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });

  it('keeps a dismissed reminder hidden if alerts are later enabled and disabled', () => {
    const f = fixture();
    dismiss(f.root);
    enabled.set(true);
    f.view.detectChanges();
    enabled.set(false);
    f.view.detectChanges();
    expect(f.root.hidden).toBe(true);
  });

  it('keeps settings available after dismissal and while alerts are enabled', () => {
    const contextual = fixture();
    dismiss(contextual.root);
    contextual.view.destroy();
    enabled.set(true);
    const settings = fixture(false);
    expect(settings.root.hidden).toBe(false);
    expect(settings.root.querySelector('[aria-label="Keep timer alerts off"]')).toBeNull();
    expect(settings.root.textContent).toContain('Turn off alerts');
  });
});
