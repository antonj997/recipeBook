import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountDatabase } from './account-database';
import { CloudCookbookService } from './cloud-cookbook.service';
import { fakeSelect, type FakeTable } from './cloud-testing';
import { StorageDurabilityService } from './storage-durability.service';
import { SupabaseService } from './supabase.service';

const recipe = (id: string) => ({ id, title: id, ingredients: [], instructions: [] });

describe('calmer cloud sync', () => {
  const user = signal<{ id: string } | null>(null);
  const accountVersion = signal(0);
  let upserts: { table: string; rows: Record<string, unknown>[] }[];
  let tables: Record<string, FakeTable>;
  let cloud: CloudCookbookService;

  function account() {
    user.set({ id: 'alice' });
    accountVersion.update((version) => version + 1);
    return cloud.database as AccountDatabase;
  }
  async function queue(cache: AccountDatabase, count: number) {
    await cache.transaction('rw', cache.recipes, cache.outbox, async () => {
      for (let index = 0; index < count; index++) {
        const value = recipe('r' + String(index).padStart(3, '0'));
        await cache.recipes.put(value);
        await cache.outbox.put({
          key: 'recipes:' + value.id,
          table: 'recipes',
          id: value.id,
          value,
          revision: 'v1',
        });
      }
    });
  }

  beforeEach(() => {
    user.set(null);
    accountVersion.set(0);
    upserts = [];
    tables = { recipes: { rows: [] }, collections: { rows: [] }, shopping_items: { rows: [] } };
    const client = {
      from: (table: string) => ({
        select: fakeSelect(table, () => tables[table]!),
        upsert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          upserts.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null };
        },
      }),
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { user, accountVersion, initialize: async () => undefined, client },
        },
        { provide: StorageDurabilityService, useValue: { ensurePersisted: async () => true } },
      ],
    });
    cloud = TestBed.inject(CloudCookbookService);
  });
  afterEach(async () => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const { name } of await indexedDB.databases())
      if (name?.startsWith('RecipebookAccount-')) await Dexie.delete(name);
  });

  it('uploads queued changes in batches of at most one hundred rows per table', async () => {
    const cache = account();
    await cloud.sync();
    upserts.length = 0;
    await queue(cache, 250);
    await cloud.sync();
    expect(upserts.map((upsert) => [upsert.table, upsert.rows.length])).toEqual([
      ['recipes', 100],
      ['recipes', 100],
      ['recipes', 50],
    ]);
    expect(upserts[0]!.rows[0]).toMatchObject({ user_id: 'alice', id: 'r000', deleted: false });
    expect(await cache.outbox.count()).toBe(0);
  });

  it('keeps a change that was edited again while its batch uploaded', async () => {
    const cache = account();
    await cloud.sync();
    await queue(cache, 3);
    const original = cloud.auth.client!.from;
    vi.spyOn(cloud.auth.client!, 'from').mockImplementation((table: string) => {
      const query = original(table);
      return {
        ...query,
        upsert: async (rows: never) => {
          await cache.outbox.update('recipes:r001', { revision: 'v2' });
          return query.upsert(rows);
        },
      } as never;
    });
    await cloud.sync().catch(() => undefined);
    expect((await cache.outbox.toArray()).map((change) => change.key)).toEqual(['recipes:r001']);
  });

  it('waits briefly after writes so a burst of edits syncs once', async () => {
    account();
    await cloud.sync();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const sync = vi.spyOn(cloud, 'sync').mockResolvedValue();
    cloud.requestSync('write');
    vi.advanceTimersByTime(1000);
    cloud.requestSync('write');
    vi.advanceTimersByTime(1000);
    expect(sync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(sync).toHaveBeenCalledOnce();
  });

  it('syncs on return only when the last sync is more than thirty seconds old', async () => {
    account();
    await cloud.sync();
    const sync = vi.spyOn(cloud, 'sync').mockResolvedValue();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    cloud.requestSync('visible');
    expect(sync).not.toHaveBeenCalled();
    vi.mocked(Date.now).mockReturnValue(now + 31_000);
    cloud.requestSync('visible');
    expect(sync).toHaveBeenCalledOnce();
  });

  it('syncs at once when the device comes online', async () => {
    account();
    await cloud.sync();
    const sync = vi.spyOn(cloud, 'sync').mockResolvedValue();
    cloud.requestSync('online');
    expect(sync).toHaveBeenCalledOnce();
  });

  it('refreshes views only when a sync wrote rows', async () => {
    account();
    await cloud.sync();
    const before = cloud.revision();
    await cloud.sync();
    expect(cloud.revision()).toBe(before);
    tables['recipes']!.rows = [
      {
        id: 'new',
        payload: recipe('new'),
        photos: {},
        deleted: false,
        updated_at: '2026-10-27T10:00:00Z',
      },
    ];
    await cloud.sync();
    expect(cloud.revision()).toBe(before + 1);
  });

  it('does not refresh views when a sync reads back its own upload', async () => {
    const cache = account();
    await cloud.sync();
    // The server keeps what it receives and stamps it, as the real table does.
    const original = cloud.auth.client!.from;
    vi.spyOn(cloud.auth.client!, 'from').mockImplementation((table: string) => {
      const query = original(table);
      return {
        ...query,
        upsert: async (rows: Record<string, unknown>[]) => {
          for (const row of rows)
            tables[table]!.rows.push({
              id: row['id'] as string,
              payload: row['payload'],
              photos: row['photos'] ?? {},
              deleted: row['deleted'] as boolean,
              updated_at: '2026-10-28T08:00:00Z',
            });
          return query.upsert(rows as never);
        },
      } as never;
    });
    await queue(cache, 2);
    const put = vi.spyOn(cache.table('recipes'), 'put');
    const before = cloud.revision();
    await cloud.sync();
    expect(tables['recipes']!.rows).toHaveLength(2);
    expect(put).not.toHaveBeenCalled();
    expect(cloud.revision()).toBe(before);
    // The version is still remembered, so the next pull skips the row without comparing it.
    expect(await cache.remote.get('recipes:r000')).toEqual({
      key: 'recipes:r000',
      updatedAt: '2026-10-28T08:00:00Z',
    });
  });

  it('syncs on return right after an account switch, before the switch has settled', async () => {
    account();
    await cloud.sync();
    // Auth callbacks can change the user before Angular runs the effect that selects its cache.
    user.set({ id: 'bob' });
    accountVersion.update((version) => version + 1);
    const sync = vi.spyOn(cloud, 'sync').mockResolvedValue();
    cloud.requestSync('visible');
    expect(sync).toHaveBeenCalled();
  });
});
