import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudCookbookService } from './cloud-cookbook.service';
import { StorageDurabilityService } from './storage-durability.service';
import { SupabaseService } from './supabase.service';

describe('CloudCookbookService lifetime', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('stops listening for focus and connectivity once its injector is destroyed', () => {
    const initialize = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { user: signal(null), accountVersion: signal(0), initialize, client: null },
        },
        { provide: StorageDurabilityService, useValue: { ensurePersisted: async () => true } },
      ],
    });
    TestBed.inject(CloudCookbookService);
    TestBed.resetTestingModule();

    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(initialize).not.toHaveBeenCalled();
  });
});
