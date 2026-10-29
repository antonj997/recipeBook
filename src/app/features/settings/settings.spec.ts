import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsComponent } from './settings';
import { CloudCookbookService } from '../../core/services/cloud-cookbook.service';
import { AppUpdateService } from '../../core/services/app-update.service';
import { TimerPushService } from '../../core/services/timer-push.service';
import { StorageDurabilityService } from '../../core/services/storage-durability.service';
import { RecipeService } from '../../core/services/recipe.service';

describe('settings page', () => {
  const user = signal<{ email: string } | null>(null);
  const sync = vi.fn();
  beforeEach(() => {
    user.set(null);
    const auth = {
      configured: signal(true),
      user,
      passwordRecovery: signal(false),
      callbackNotice: signal(''),
      busy: signal(false),
      accountVersion: signal(0),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RecipeService, useValue: {} },
        {
          provide: CloudCookbookService,
          useValue: {
            auth,
            online: signal(true),
            syncing: signal(false),
            error: signal(''),
            pending: signal(0),
            lastSynced: signal(1),
            sync,
          },
        },
        {
          provide: AppUpdateService,
          useValue: {
            available: signal(false),
            installed: signal(false),
            installable: signal(false),
            offlineReady: signal(true),
          },
        },
        {
          provide: TimerPushService,
          useValue: {
            enabled: signal(false),
            busy: signal(false),
            status: signal('off'),
            message: signal('Sign in to enable background timer alerts.'),
            canEnable: signal(false),
          },
        },
        {
          provide: StorageDurabilityService,
          useValue: {
            status: signal('persisted'),
            browserTab: signal(false),
            lastBackupAt: signal(null),
          },
        },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());

  function render() {
    const view = TestBed.createComponent(SettingsComponent);
    view.detectChanges();
    return { view, root: view.nativeElement as HTMLElement };
  }
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  it('groups everything into labelled cards of rows, without a section menu', () => {
    const { root } = render();
    expect(root.querySelector('.settings-nav')).toBeNull();
    expect([...root.querySelectorAll('.group-label')].map(text)).toEqual([
      'Account',
      'Backups',
      'App',
    ]);
    const backups = root.querySelector('#import-cookbook .settings-card')!;
    const rows = [...backups.querySelectorAll('.settings-row')];
    expect(rows.map((row) => text(row.querySelector('.row-title')))).toEqual([
      'Download a backup',
      'Restore from a backup',
    ]);
    expect(rows.map((row) => text(row.querySelector('button')))).toEqual([
      'Download',
      'Choose file',
    ]);
    const app = root.querySelector('#app-settings .settings-card')!;
    expect(app.querySelector('app-timer-alert-preferences')).not.toBeNull();
    expect(app.querySelector('app-slow-motion-switch')).not.toBeNull();
  });

  it('opens with an account card that fits a narrow screen', () => {
    user.set({ email: 'anton.jonsson99@gmail.com' });
    const { root } = render();
    const card = root.querySelector('#account .account-card')!;
    expect(text(card.querySelector('.account-avatar'))).toBe('A');
    const email = card.querySelector<HTMLElement>('.account-email')!;
    expect(text(email)).toBe('anton.jonsson99@gmail.com');
    expect(email.title).toBe('anton.jonsson99@gmail.com');
    expect(text(card.querySelector('[role=status]'))).toBe('Synced');
    // The head row holds only who and what; actions are full-width rows below it.
    expect(card.querySelector('.account-head button')).toBeNull();
    const actions = [...card.querySelectorAll<HTMLButtonElement>('.row-button')];
    expect(actions.map(text)).toEqual(['Sync now', 'Reset password', 'Sign out']);
    actions[0].click();
    expect(sync).toHaveBeenCalled();
  });
});
