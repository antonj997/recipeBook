import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { LeaveConfirmationService } from './leave-confirmation.service';

describe('LeaveConfirmationService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('asks to discard changes by default', () => {
    const service = TestBed.inject(LeaveConfirmationService);
    void service.confirm('This recipe has not been saved. Discard it?');
    expect(service.labels()).toEqual({
      title: 'Discard changes?',
      confirm: 'Discard',
      cancel: 'Keep',
      destructive: true,
    });
  });

  it('uses the caller’s wording for other confirmations and resolves with the answer', async () => {
    const service = TestBed.inject(LeaveConfirmationService);
    const answer = service.confirm('Import 3 recipes?', {
      title: 'Import backup?',
      confirm: 'Import',
      cancel: 'Cancel',
    });
    expect(service.labels()).toEqual({
      title: 'Import backup?',
      confirm: 'Import',
      cancel: 'Cancel',
      destructive: false,
    });
    service.answer(true);
    expect(await answer).toBe(true);
    expect(service.message()).toBe('');
  });
});
