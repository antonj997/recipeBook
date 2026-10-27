import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerAlertPreferencesComponent } from './timer-alert-preferences';
import { TimerPushService } from '../../core/services/timer-push.service';
import { SupabaseService } from '../../core/services/supabase.service';

describe('timer alert settings', () => {
  const user = signal<{ id: string } | null>(null);
  const enabled = signal(false);
  const status = signal('off');
  const busy = signal(false);
  const enable = vi.fn();
  const disable = vi.fn();

  beforeEach(() => {
    enable.mockClear();
    disable.mockClear();
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

  function fixture() {
    const view = TestBed.createComponent(TimerAlertPreferencesComponent);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    return { view, root };
  }

  it('enables alerts from Settings', () => {
    const f = fixture();
    f.root.querySelector<HTMLButtonElement>('button')!.click();
    expect(enable).toHaveBeenCalledOnce();
  });

  it('offers to turn alerts off while they are on', () => {
    enabled.set(true);
    const f = fixture();
    expect(f.root.textContent).toContain('Turn off alerts');
    f.root.querySelector<HTMLButtonElement>('button')!.click();
    expect(disable).toHaveBeenCalledOnce();
  });

  it('offers a retry after an error', () => {
    status.set('error');
    const f = fixture();
    f.root.querySelector<HTMLButtonElement>('.retry-alerts')!.click();
    expect(f.root.querySelector('.alert-error')).not.toBeNull();
  });
});
