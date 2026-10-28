import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackService } from './feedback.service';
import { SupabaseService } from './supabase.service';
import { TimerAlertOfferService } from './timer-alert-offer.service';
import { TimerPushService } from './timer-push.service';

describe('TimerAlertOfferService', () => {
  const user = signal<{ id: string } | null>({ id: 'alice' });
  const enabled = signal(false);
  const canEnable = signal(true);
  const enable = vi.fn(async () => enabled.set(true));
  let feedback: FeedbackService;

  beforeEach(() => {
    localStorage.clear();
    user.set({ id: 'alice' });
    enabled.set(false);
    canEnable.set(true);
    enable.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { cacheScope: 'offer-tests', user } },
        { provide: TimerPushService, useValue: { enabled, canEnable, enable } },
      ],
    });
    feedback = TestBed.inject(FeedbackService);
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('offers background alerts once, after the first timer starts', async () => {
    const offers = TestBed.inject(TimerAlertOfferService);
    offers.offer();
    expect(feedback.message()).toContain('alert');
    expect(feedback.action()?.label).toBe('Enable');
    await feedback.runAction();
    expect(enable).toHaveBeenCalledOnce();
    expect(feedback.message()).toBe('Timer alerts are on.');
    feedback.dismiss();
    enabled.set(false);
    offers.offer();
    expect(feedback.message()).toBe('');
  });

  it('remembers the offer for each account separately', () => {
    const offers = TestBed.inject(TimerAlertOfferService);
    offers.offer();
    feedback.dismiss();
    user.set({ id: 'bob' });
    offers.offer();
    expect(feedback.action()?.label).toBe('Enable');
  });

  it('never offers alerts to guests, where they cannot work', () => {
    user.set(null);
    canEnable.set(false);
    TestBed.inject(TimerAlertOfferService).offer();
    expect(feedback.message()).toBe('');
  });

  it('stays quiet when alerts are already on or the device cannot enable them', () => {
    const offers = TestBed.inject(TimerAlertOfferService);
    enabled.set(true);
    offers.offer();
    enabled.set(false);
    canEnable.set(false);
    offers.offer();
    expect(feedback.message()).toBe('');
    canEnable.set(true);
    offers.offer();
    expect(feedback.action()?.label).toBe('Enable');
  });

  it('respects a reminder dismissed in an earlier version', () => {
    localStorage.setItem(
      'recipebook:timer-alert-reminder-dismissed:' + JSON.stringify(['offer-tests', 'alice']),
      'true',
    );
    TestBed.inject(TimerAlertOfferService).offer();
    expect(feedback.message()).toBe('');
  });
});
