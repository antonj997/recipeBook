import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { db } from '../database';
import { AccountDatabase } from './account-database';
import { CloudCookbookService } from './cloud-cookbook.service';
import { SupabaseService } from './supabase.service';
import { RecipeService } from './recipe.service';
import { StepTimerService } from './step-timer.service';
import { GuestRecipesService } from './guest-recipes.service';
import { GuestRecipesDialogComponent } from '../../shared/components/guest-recipes-dialog';
import { FeedbackService } from './feedback.service';
import type { ShoppingItem } from '../models/shopping-item';

const time = '2026-10-25T12:00:00.000Z';
const item = (id = 'onions', text = '2 onions') => ({
  id,
  text,
  checked: false,
  createdAt: time,
  updatedAt: time,
});
const recipe = {
  id: 'soup',
  title: 'Soup',
  servings: 4,
  ingredients: ['2 onions'],
  instructions: ['Cook.'],
};
const shoppingTable = (database: typeof db | AccountDatabase) => database.shoppingItems;
const shoppingSource = (ingredientIndex = 0) => ({
  recipeId: 'soup',
  recipeTitle: 'Soup',
  servings: 4,
  ingredientIndex,
  originalText: ingredientIndex === 0 ? '2 onions' : '1 carrot',
});
type ShoppingOptions = { rejectDuplicateSources?: boolean; restoreMissingOnly?: boolean };
const applyWithOptions = (
  cloud: CloudCookbookService,
  puts: ShoppingItem[],
  database: typeof db | AccountDatabase,
  options: ShoppingOptions,
) => cloud.applyShoppingChanges(puts, [], database, options);

describe('private shopping persistence', () => {
  const user = signal<{ id: string } | null>(null);
  const accountVersion = signal(0);
  let auth: {
    user: typeof user;
    accountVersion: typeof accountVersion;
    initialize: () => Promise<void>;
    client: unknown;
  };
  let cloud: CloudCookbookService;
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const selects: { table: string; columns: string }[] = [];
  let remoteRows: Record<string, Record<string, unknown>[]>;
  let onUpload: (() => Promise<void>) | undefined;
  let shoppingMissing = false;
  function account(id = 'alice') {
    user.set({ id });
    accountVersion.update((version) => version + 1);
    return cloud.database as AccountDatabase;
  }
  function enableNetwork() {
    auth.client = {
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>) => {
          writes.push({ table, row });
          await onUpload?.();
          return {
            error:
              table === 'shopping_items' && shoppingMissing
                ? { code: 'PGRST205', message: 'Table unavailable' }
                : null,
          };
        },
        select: (columns: string) => {
          selects.push({ table, columns });
          return {
            eq: () => ({
              order: () => ({
                range: async () => ({
                  data: remoteRows[table] ?? [],
                  error:
                    table === 'shopping_items' && shoppingMissing
                      ? { code: 'PGRST205', message: 'Table unavailable' }
                      : null,
                }),
              }),
            }),
          };
        },
      }),
    };
  }
  beforeEach(async () => {
    user.set(null);
    accountVersion.set(0);
    writes.length = 0;
    selects.length = 0;
    remoteRows = {};
    onUpload = undefined;
    shoppingMissing = false;
    auth = { user, accountVersion, initialize: async () => undefined, client: null };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: auth },
        { provide: StepTimerService, useValue: { removeRecipe: vi.fn() } },
      ],
    });
    cloud = TestBed.inject(CloudCookbookService);
    await db.recipes.clear();
    await db.collections.clear();
    await shoppingTable(db).clear();
  });
  afterEach(async () => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    // Every test starts with empty account caches, as a new device would.
    for (const { name } of await indexedDB.databases())
      if (name?.startsWith('RecipebookAccount-')) await Dexie.delete(name);
  });

  it('commits a shopping batch and tombstones in the same account transaction', async () => {
    const cache = account();
    const transaction = vi.spyOn(cache as Dexie, 'transaction');
    await cache.recipes.put(recipe);
    await cloud.applyShoppingChanges([item('keep'), item('remove')], [], cache);
    await cloud.applyShoppingChanges([item('new')], ['remove'], cache);
    expect((await shoppingTable(cache).toArray()).map((row) => row.id).sort()).toEqual([
      'keep',
      'new',
    ]);
    expect(await cache.outbox.get('shoppingItems:remove')).toMatchObject({
      value: null,
      table: 'shoppingItems',
    });
    expect(await cache.outbox.get('shoppingItems:new')).toMatchObject({ value: item('new') });
    expect(await cache.recipes.get('soup')).toEqual(recipe);
    const tables = transaction.mock.calls.at(-1)!.flat();
    expect(tables).toContain(shoppingTable(cache));
    expect(tables).toContain(cache.outbox);
  });
  it('rolls back local changes if the durable outbox fails', async () => {
    const cache = account();
    vi.spyOn(cache.outbox, 'put').mockRejectedValue(new Error('Disk full'));
    await expect(cloud.applyShoppingChanges([item()], [], cache)).rejects.toThrow('Disk full');
    expect(await shoppingTable(cache).toArray()).toEqual([]);
  });
  it('rejects the overlapping one of two concurrent recipe batches without partial writes', async () => {
    const cache = account();
    const first = { ...item('first'), sources: [shoppingSource()] };
    const overlapping = { ...item('overlap'), sources: [shoppingSource()] };
    const unrelated = { ...item('unrelated'), sources: [shoppingSource(1)] };
    const results = await Promise.allSettled([
      applyWithOptions(cloud, [first], cache, { rejectDuplicateSources: true }),
      applyWithOptions(cloud, [unrelated, overlapping], cache, { rejectDuplicateSources: true }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: new Error('These ingredients are already on your list.'),
    });
    expect(await shoppingTable(cache).toArray()).toEqual([first]);
    expect((await cache.outbox.toArray()).map((change) => change.id)).toEqual(['first']);
  });
  it('allows explicit duplicate batches and distinct servings without source guessing', async () => {
    const cache = account();
    const first = { ...item('first'), sources: [shoppingSource()] };
    const again = { ...item('again'), sources: [shoppingSource()] };
    const scaled = { ...item('scaled'), sources: [{ ...shoppingSource(), servings: 6 }] };
    await applyWithOptions(cloud, [first], cache, { rejectDuplicateSources: true });
    await applyWithOptions(cloud, [scaled], cache, { rejectDuplicateSources: true });
    await applyWithOptions(cloud, [again], cache, {});
    expect(await shoppingTable(cache).count()).toBe(3);
    expect(await cache.outbox.count()).toBe(3);
  });
  it('restores only still-missing IDs and preserves a record created after undo checked absence', async () => {
    const cache = account();
    // The UI captured absence, but another writer recreates this ID before Undo commits.
    expect(await shoppingTable(cache).get('existing')).toBeUndefined();
    const current = { ...item('existing', 'New current onions'), checked: true };
    const writing = cloud.applyShoppingChanges([current], [], cache);
    const restoring = applyWithOptions(
      cloud,
      [item('existing', 'Old snapshot onions'), item('missing')],
      cache,
      { restoreMissingOnly: true },
    );
    await Promise.all([writing, restoring]);
    expect(await shoppingTable(cache).get('existing')).toEqual(current);
    expect(await cache.outbox.get('shoppingItems:existing')).toMatchObject({ value: current });
    expect(await shoppingTable(cache).get('missing')).toEqual(item('missing'));
    expect(await cache.outbox.get('shoppingItems:missing')).toMatchObject({
      value: item('missing'),
    });
    const pending = await cache.outbox.get('shoppingItems:existing');
    await applyWithOptions(cloud, [item('existing', 'Old snapshot onions')], cache, {
      restoreMissingOnly: true,
    });
    expect(await cache.outbox.get('shoppingItems:existing')).toEqual(pending);
  });
  it('does not queue skipped restore records that were already synced', async () => {
    const cache = account();
    const current = item('existing', 'Synced current onions');
    await shoppingTable(cache).put(current);
    await applyWithOptions(cloud, [item('existing', 'Old snapshot onions')], cache, {
      restoreMissingOnly: true,
    });
    expect(await shoppingTable(cache).get('existing')).toEqual(current);
    expect(await cache.outbox.count()).toBe(0);
  });
  it('rejects writes to a captured account after switching owners', async () => {
    const alice = account();
    account('bob');
    await expect(cloud.applyShoppingChanges([item()], [], alice)).rejects.toThrow(
      'Account changed',
    );
    expect(await shoppingTable(alice).toArray()).toEqual([]);
    expect(await shoppingTable(cloud.database).toArray()).toEqual([]);
  });
  it('aborts the whole batch if the account changes while committing', async () => {
    const alice = account();
    const table = shoppingTable(alice);
    // Writes resolve their table by name inside the transaction.
    const boundary = alice.table('shoppingItems') as unknown as {
      put(value: ShoppingItem): Promise<string>;
    };
    const put = boundary.put.bind(boundary);
    vi.spyOn(boundary, 'put').mockImplementation(async (value) => {
      await put(value);
      user.set({ id: 'bob' });
      accountVersion.update((version) => version + 1);
      return value.id;
    });
    await expect(
      cloud.applyShoppingChanges([item('first'), item('second')], [], alice),
    ).rejects.toThrow('Account changed');
    expect(await table.toArray()).toEqual([]);
    expect(await alice.outbox.count()).toBe(0);
    expect(await shoppingTable(cloud.database).toArray()).toEqual([]);
  });
  it('keeps signed-out device data separate from retained account items and queue', async () => {
    const cache = account();
    await cloud.applyShoppingChanges([item()], [], cache);
    user.set(null);
    accountVersion.update((version) => version + 1);
    expect(cloud.database).toBe(db);
    expect(await shoppingTable(cloud.database).toArray()).toEqual([]);
    account();
    expect(await shoppingTable(cloud.database).toArray()).toEqual([item()]);
    expect(await cache.outbox.count()).toBe(1);
  });
  it('validates all shopping puts before making any durable changes', async () => {
    const cache = account();
    await expect(
      cloud.applyShoppingChanges([item('good'), { ...item('bad'), text: '' }], [], cache),
    ).rejects.toThrow();
    expect(await shoppingTable(cache).toArray()).toEqual([]);
    expect(await cache.outbox.count()).toBe(0);
  });
  it('maps shopping sync to shopping_items and never sends or selects photos', async () => {
    const cache = account();
    await cloud.applyShoppingChanges([item()], [], cache);
    enableNetwork();
    await cloud.sync();
    expect(writes).toContainEqual({
      table: 'shopping_items',
      row: { user_id: 'alice', id: 'onions', payload: item(), deleted: false },
    });
    expect(selects).toContainEqual({ table: 'shopping_items', columns: 'id,payload,deleted' });
    expect(await cache.outbox.count()).toBe(0);
  });
  it('retains a newer shopping edit while an earlier revision uploads', async () => {
    const cache = account();
    await cloud.applyShoppingChanges([item()], [], cache);
    enableNetwork();
    onUpload = async () => {
      onUpload = undefined;
      await cloud.applyShoppingChanges([item('onions', '4 onions')], [], cache);
      auth.client = null; // Keep the scheduled drain offline so its pending revision can be inspected.
    };
    await cloud.sync();
    expect(await cache.outbox.get('shoppingItems:onions')).toMatchObject({
      value: { text: '4 onions' },
    });
    expect(await shoppingTable(cache).get('onions')).toMatchObject({ text: '4 onions' });
  });
  it('hydrates valid shopping rows and applies remote tombstones', async () => {
    const cache = account();
    await shoppingTable(cache).put(item('deleted') as never);
    remoteRows = {
      shopping_items: [
        { id: 'deleted', payload: null, deleted: true },
        { id: 'onions', payload: item(), deleted: false },
      ],
    };
    enableNetwork();
    await cloud.sync();
    expect(await shoppingTable(cache).toArray()).toEqual([item()]);
  });
  it('keeps recipe sync working and shopping queued until its new remote table exists', async () => {
    const cache = account();
    await cloud.applyShoppingChanges([item()], [], cache);
    remoteRows = { recipes: [{ id: 'soup', payload: recipe, photos: {}, deleted: false }] };
    shoppingMissing = true;
    enableNetwork();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await cloud.sync();
    expect(await cache.recipes.get('soup')).toEqual(recipe);
    expect(await cache.outbox.get('shoppingItems:onions')).toMatchObject({ value: item() });
    expect(cloud.syncing()).toBe(false);
    shoppingMissing = false;
    await cloud.sync();
    expect(await cache.outbox.count()).toBe(0);
  });
  it('drains concurrent recipe writes even while shopping sync awaits its new table', async () => {
    const cache = account();
    await cloud.applyShoppingChanges([item()], [], cache);
    shoppingMissing = true;
    enableNetwork();
    onUpload = async () => {
      onUpload = undefined;
      await cloud.put('recipes', recipe, cache);
    };
    await cloud.sync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes.some((write) => write.table === 'recipes' && write.row['id'] === 'soup')).toBe(
      true,
    );
    expect(await cache.outbox.get('recipes:soup')).toBeUndefined();
    expect(await cache.outbox.get('shoppingItems:onions')).toMatchObject({ value: item() });
  });
  it('does not hydrate malformed shopping payloads', async () => {
    const cache = account();
    remoteRows = {
      shopping_items: [{ id: 'onions', payload: { ...item(), checked: 'false' }, deleted: false }],
    };
    enableNetwork();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await cloud.sync();
    expect(await shoppingTable(cache).toArray()).toEqual([]);
    expect(cloud.error()).toContain('Could not sync');
  });
  it('does not hydrate or acknowledge an old account after an upload crosses an auth change', async () => {
    const alice = account();
    await cloud.applyShoppingChanges([item()], [], alice);
    remoteRows = {
      shopping_items: [{ id: 'old-account', payload: item('old-account'), deleted: false }],
    };
    enableNetwork();
    onUpload = async () => {
      onUpload = undefined;
      user.set(null);
      accountVersion.update((version) => version + 1);
    };
    await cloud.sync();
    expect(await alice.outbox.count()).toBe(1);
    expect(await shoppingTable(alice).get('old-account')).toBeUndefined();
    expect(cloud.database).toBe(db);
    expect(await shoppingTable(db).toArray()).toEqual([]);
  });
  it('counts and transfers shopping-only guest data durably', async () => {
    // A shopping-only device must prompt on sign-in, and leave no guest copy after success.
    if (shoppingTable(db)) await shoppingTable(db).put(item() as never);
    const cache = account();
    expect(await cloud.deviceRecordCounts()).toMatchObject({ shoppingItems: 1 });
    await cloud.resolveDeviceRecipes('add');
    expect(await shoppingTable(cache).toArray()).toEqual([item()]);
    expect(await cache.outbox.get('shoppingItems:onions')).toMatchObject({ value: item() });
    expect(await shoppingTable(db).toArray()).toEqual([]);
  });
  it('keeps guest shopping data if account persistence fails', async () => {
    if (shoppingTable(db)) await shoppingTable(db).put(item() as never);
    const cache = account();
    vi.spyOn(cache.outbox, 'put').mockRejectedValue(new Error('Disk full'));
    await expect(cloud.resolveDeviceRecipes('add')).rejects.toThrow('Disk full');
    expect(await shoppingTable(db).toArray()).toEqual([item()]);
    expect(await shoppingTable(cache).toArray()).toEqual([]);
  });
  it('preserves both collision records and remaps shopping recipe sources on transfer', async () => {
    const source = {
      ...item(),
      sources: [
        {
          recipeId: 'soup',
          recipeTitle: 'Device soup',
          servings: 4,
          ingredientIndex: 0,
          originalText: '2 onions',
        },
      ],
    };
    await db.recipes.put({ ...recipe, title: 'Device soup' });
    if (shoppingTable(db)) await shoppingTable(db).put(source as never);
    const cache = account();
    await cache.recipes.put({ ...recipe, title: 'Account soup' });
    await shoppingTable(cache)?.put(item('onions', 'Account onions') as never);
    await cloud.resolveDeviceRecipes('add');
    const transferredRecipe = (await cache.recipes.toArray()).find(
      (row) => row.title === 'Device soup',
    )!;
    const transferredItem = (await shoppingTable(cache).toArray()).find(
      (row) => row.text === '2 onions',
    );
    expect(transferredRecipe.id).not.toBe('soup');
    expect(transferredItem).toMatchObject({
      sources: [{ recipeId: transferredRecipe.id, recipeTitle: 'Device soup' }],
    });
    expect(await shoppingTable(cache).get('onions')).toMatchObject({ text: 'Account onions' });
    // Simulate a crash after account commit but before device cleanup, then retry.
    await db.recipes.put({ ...recipe, title: 'Device soup' });
    await shoppingTable(db).put(source as never);
    await cloud.resolveDeviceRecipes('add');
    expect(await cache.recipes.count()).toBe(2);
    expect(await shoppingTable(cache).count()).toBe(2);
  });
  it('discards guest shopping records without touching the signed-in list', async () => {
    if (shoppingTable(db)) await shoppingTable(db).put(item('guest') as never);
    const cache = account();
    await cloud.applyShoppingChanges([item('account')], [], cache);
    await cloud.resolveDeviceRecipes('delete');
    expect(await shoppingTable(db).toArray()).toEqual([]);
    expect(await shoppingTable(cache).toArray()).toEqual([item('account')]);
  });

  describe('backup compatibility', () => {
    let recipes: RecipeService;
    const backup = (version = 2, shoppingItems: unknown[] = [item()]) => ({
      app: 'recipiebook',
      version,
      exportedAt: time,
      recipes: [],
      collections: [],
      ...(version === 2 ? { shoppingItems } : {}),
    });
    beforeEach(() => {
      recipes = TestBed.inject(RecipeService);
    });
    it('round-trips shopping-only v2 backups without duplicate imports', async () => {
      account();
      const first = await recipes.importBackup(backup());
      expect(first).toMatchObject({ added: 0, skipped: 0, shoppingAdded: 1 });
      expect(await recipes.importBackup(backup())).toMatchObject({ shoppingAdded: 0 });
      const exported = await recipes.exportBackup();
      expect(exported).toMatchObject({ version: 2, shoppingItems: [item()] });
      expect(await shoppingTable(cloud.database).count()).toBe(1);
    });
    it('imports v1 recipes while leaving the existing shopping list untouched', async () => {
      const cache = account();
      await cloud.applyShoppingChanges([item()], [], cache);
      await recipes.importBackup({ ...backup(1), recipes: [recipe] });
      expect(await cache.recipes.get('soup')).toEqual(recipe);
      expect(await shoppingTable(cache).toArray()).toEqual([item()]);
    });
    it('preserves source snapshots, checked state and batches across export and additive restore', async () => {
      const cache = account();
      const sourced = {
        ...item(),
        checked: true,
        batchId: 'batch',
        sources: [
          {
            recipeId: 'deleted-recipe',
            recipeTitle: 'Original soup title',
            servings: 6,
            ingredientIndex: 2,
            originalText: '2 onions',
          },
        ],
      };
      await cloud.applyShoppingChanges([sourced], [], cache);
      const exported = await recipes.exportBackup();
      expect(exported.shoppingItems).toEqual([sourced]);
      const changed = { ...sourced, text: 'My edited onions' };
      await cloud.applyShoppingChanges([changed], [], cache);
      expect(await recipes.importBackup(exported)).toMatchObject({ shoppingAdded: 0 });
      expect(await shoppingTable(cache).toArray()).toEqual([changed]);
    });
    it('rejects an export if the account changes during its snapshot read', async () => {
      const cache = account();
      const orderBy = cache.shoppingItems.orderBy.bind(cache.shoppingItems);
      vi.spyOn(cache.shoppingItems, 'orderBy').mockImplementation((index) => {
        const collection = orderBy(index);
        const read = collection.toArray.bind(collection);
        collection.toArray = (() => {
          user.set(null);
          accountVersion.update((version) => version + 1);
          return read();
        }) as typeof collection.toArray;
        return collection;
      });
      await expect(recipes.exportBackup()).rejects.toThrow('Account changed');
    });
    it('validates all shopping records before importing any recipes', async () => {
      const cache = account();
      await expect(
        recipes.importBackup({
          ...backup(2, [item(), { ...item('bad'), checked: 'no' }]),
          recipes: [recipe],
        }),
      ).rejects.toThrow();
      expect(await cache.recipes.count()).toBe(0);
      expect(await cache.outbox.count()).toBe(0);
    });
    it('rejects duplicate shopping IDs and missing v2 lists', () => {
      expect(() => recipes.validateBackup(backup(2, [item(), item()]))).toThrow();
      expect(() => recipes.validateBackup({ ...backup(1), version: 2 })).toThrow();
    });
  });
});

describe('shopping-only guest prompt', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('requires a decision and enables transfer when no guest recipes exist', async () => {
    const auth = { user: signal({ id: 'alice' }), accountVersion: signal(1), busy: signal(false) };
    TestBed.configureTestingModule({
      imports: [GuestRecipesDialogComponent],
      providers: [
        {
          provide: CloudCookbookService,
          useValue: {
            auth,
            deviceRecordCounts: async () => ({ recipes: 0, collections: 0, shoppingItems: 2 }),
          },
        },
        { provide: FeedbackService, useValue: { show: vi.fn() } },
      ],
    });
    const guest = TestBed.inject(GuestRecipesService);
    await guest.refresh();
    expect(guest.required()).toBe(true);
    // Avoid native dialog methods absent in jsdom; test the real component's decision state.
    const component = TestBed.runInInjectionContext(() => new GuestRecipesDialogComponent());
    expect(component.hasRecords()).toBe(true);
  });
});
