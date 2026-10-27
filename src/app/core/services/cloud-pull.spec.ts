import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDatabase } from './account-database';
import { CloudCookbookService } from './cloud-cookbook.service';
import { pullTable } from './cloud-pull';
import { fakeSelect, type FakeCloudRow, type FakeSelect, type FakeTable } from './cloud-testing';
import { StorageDurabilityService } from './storage-durability.service';
import { SupabaseService } from './supabase.service';

const recipe = (id: string, title = id) => ({
  id,
  title,
  ingredients: ['Salt'],
  instructions: ['Cook.'],
});
const row = (id: string, at: string, title = id): FakeCloudRow => ({
  id,
  payload: recipe(id, title),
  photos: {},
  deleted: false,
  updated_at: at,
});
const at = (minute: number, second = 0) =>
  new Date(Date.UTC(2026, 9, 27, 10, minute, second)).toISOString();

describe('pulling only changed cloud rows', () => {
  const user = signal<{ id: string } | null>(null);
  const accountVersion = signal(0);
  let tables: Record<string, FakeTable>;
  let selects: FakeSelect[];
  let cloud: CloudCookbookService;
  let client: unknown;

  function account() {
    user.set({ id: 'alice' });
    accountVersion.update((version) => version + 1);
    return cloud.database as AccountDatabase;
  }

  beforeEach(() => {
    user.set(null);
    accountVersion.set(0);
    selects = [];
    tables = {
      recipes: { rows: [] },
      collections: { rows: [] },
      shopping_items: { rows: [] },
    };
    client = {
      from: (table: string) => ({
        select: fakeSelect(table, () => tables[table]!, selects),
        upsert: async () => ({ error: null }),
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
    vi.restoreAllMocks();
    for (const { name } of await indexedDB.databases())
      if (name?.startsWith('RecipebookAccount-')) await Dexie.delete(name);
  });

  it('pulls everything on the first sync, page by page, and remembers where it stopped', async () => {
    const cache = account();
    tables['recipes']!.rows = Array.from({ length: 1201 }, (_, index) =>
      row('r' + String(index).padStart(4, '0'), at(Math.floor(index / 100))),
    );
    await cloud.sync();
    expect(await cache.recipes.count()).toBe(1201);
    expect(selects.filter((select) => select.table === 'recipes')).toHaveLength(3);
    expect(await cache.syncState.get('recipes')).toEqual({
      table: 'recipes',
      cursor: { at: at(12), id: 'r1200' },
    });
  });

  it('later asks only for rows changed since a minute before its cursor', async () => {
    const cache = account();
    tables['recipes']!.rows = [row('a', at(1)), row('b', at(5))];
    await cloud.sync();
    selects.length = 0;
    const put = vi.spyOn(cache.table('recipes'), 'put');
    tables['recipes']!.rows.push(row('c', at(9)));
    await cloud.sync();
    expect(selects.find((select) => select.table === 'recipes')?.filters).toEqual([
      'updated_at>=' + at(4),
    ]);
    // b is read again inside the overlap but is already known, so only c is written.
    expect(put.mock.calls.map(([value]) => value.id)).toEqual(['c']);
    expect(await cache.syncState.get('recipes')).toMatchObject({ cursor: { at: at(9), id: 'c' } });
  });

  it('pages through rows that share one timestamp by id', async () => {
    const cache = account();
    tables['recipes']!.rows = Array.from({ length: 501 }, (_, index) =>
      row('same' + String(index).padStart(3, '0'), at(3)),
    );
    await cloud.sync();
    expect(await cache.recipes.count()).toBe(501);
    expect(selects.filter((select) => select.table === 'recipes')[1]?.filters[0]).toBe(
      `updated_at.gt.${JSON.stringify(at(3))},and(updated_at.eq.${JSON.stringify(at(3))},id.gt."same499")`,
    );
  });

  it('applies updates and tombstones from other devices but keeps a pending local edit', async () => {
    const cache = account();
    tables['recipes']!.rows = [row('kept', at(1)), row('gone', at(1)), row('mine', at(1))];
    await cloud.sync();
    await cache.transaction('rw', cache.recipes, cache.outbox, async () => {
      await cache.recipes.put(recipe('mine', 'Local title'));
      await cache.outbox.put({
        key: 'recipes:mine',
        table: 'recipes',
        id: 'mine',
        value: recipe('mine', 'Local title'),
        revision: 'local',
      });
    });
    tables['recipes']!.rows = [
      row('kept', at(7), 'Renamed elsewhere'),
      { id: 'gone', payload: null, photos: {}, deleted: true, updated_at: at(7) },
      row('mine', at(7), 'Remote title'),
    ];
    // Pull while the local edit is still queued, as when it was made during this sync.
    const context = { cache, client: client as never, userId: 'alice', current: () => true };
    expect(await pullTable(context, 'recipes')).toBe('done');
    expect((await cache.recipes.get('kept'))?.title).toBe('Renamed elsewhere');
    expect(await cache.recipes.get('gone')).toBeUndefined();
    expect((await cache.recipes.get('mine'))?.title).toBe('Local title');
  });

  it('keeps rows and the cursor of committed pages when a later page fails', async () => {
    const cache = account();
    tables['recipes']!.rows = Array.from({ length: 600 }, (_, index) =>
      row('r' + String(index).padStart(3, '0'), at(1)),
    );
    let reads = 0;
    const original = tables['recipes']!;
    tables['recipes'] = new Proxy(original, {
      get: (target, key) =>
        key === 'error' && ++reads > 1
          ? { code: '57014', message: 'Timeout' }
          : target[key as keyof FakeTable],
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await cloud.sync();
    expect(await cache.recipes.count()).toBe(500);
    expect(await cache.syncState.get('recipes')).toMatchObject({ cursor: { id: 'r499' } });
  });

  it('falls back to a full pull while the server has no updated_at column', async () => {
    const cache = account();
    tables['recipes'] = {
      rows: [row('a', at(1)), row('b', at(2))].map(({ updated_at, ...rest }) => rest),
      withoutUpdatedAt: true,
    };
    await cloud.sync();
    expect(await cache.recipes.count()).toBe(2);
    expect(await cache.syncState.get('recipes')).toBeUndefined();
    expect(selects.filter((select) => select.table === 'recipes').map((s) => s.columns)).toEqual([
      'id,payload,photos,deleted,updated_at',
      'id,payload,photos,deleted',
    ]);
  });
});
