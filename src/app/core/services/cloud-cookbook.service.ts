import { DestroyRef, effect, inject, Service, signal } from '@angular/core';
import type Dexie from 'dexie';
import { db } from '../database';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { readShoppingItem, type ShoppingItem, type ShoppingSource } from '../models/shopping-item';
import {
  AccountDatabase,
  type CookbookDatabase,
  type CookbookTable,
  type CookbookValue,
  type PendingChange,
} from './account-database';
import { SupabaseService } from './supabase.service';
import { StorageDurabilityService } from './storage-durability.service';
import { uploadPhotos, type RecipePhotos } from './cloud-photos';
import { pullTable, readCloudRecipe, remoteTable, missingShoppingTable } from './cloud-pull';
import { extractPhotos, photoRefs, putImages, type PreparedImage } from '../models/recipe-image';

@Service()
export class CloudCookbookService {
  readonly auth = inject(SupabaseService);
  private readonly durability = inject(StorageDurabilityService);
  readonly syncing = signal(false);
  readonly pending = signal(0);
  readonly online = signal(navigator.onLine);
  readonly error = signal('');
  readonly lastSynced = signal<string | null>(null);
  readonly revision = signal(0);
  private accountId: string | null = null;
  private cache: AccountDatabase | null = null;
  private running = new Map<AccountDatabase, Promise<void>>();
  private caches = new Map<string, AccountDatabase>();

  constructor() {
    effect(() => this.selectAccount(this.auth.user()?.id ?? null));
    const listeners = new AbortController();
    inject(DestroyRef).onDestroy(() => listeners.abort());
    const { signal: until } = listeners;
    window.addEventListener(
      'online',
      () => {
        this.online.set(true);
        void this.initialize().then(() => this.sync());
      },
      { signal: until },
    );
    window.addEventListener('offline', () => this.online.set(false), { signal: until });
    document.addEventListener(
      'visibilitychange',
      () => {
        // Refresh recipes from other devices, and retry queued changes after returning to the app.
        if (document.visibilityState === 'visible' && navigator.onLine)
          void this.initialize().then(() => this.sync());
      },
      { signal: until },
    );
  }

  async initialize(): Promise<void> {
    await this.auth.initialize();
    this.selectAccount(this.auth.user()?.id ?? null);
  }

  get database(): CookbookDatabase {
    // Auth callbacks can run before Angular effects; never return the previous owner’s cache.
    this.selectAccount(this.auth.user()?.id ?? null);
    return this.cache ?? db;
  }

  private selectAccount(userId: string | null): void {
    if (this.accountId === userId) return;
    this.accountId = userId;
    if (userId && !this.caches.has(userId)) this.caches.set(userId, new AccountDatabase(userId));
    this.cache = userId ? this.caches.get(userId)! : null;
    this.pending.set(0);
    this.syncing.set(false);
    this.error.set('');
    this.lastSynced.set(null);
    this.revision.update((value) => value + 1);
    const cache = this.cache;
    if (cache) {
      void cache.outbox.count().then((count) => {
        if (this.cache === cache) this.pending.set(count);
      });
      void this.sync();
    }
  }

  async put(table: CookbookTable, value: CookbookValue, database = this.database): Promise<void> {
    if (table === 'recipes') return this.putRecipes([value as Recipe], database);
    await this.write(database, [{ table, id: value.id, value }]);
  }
  async putRecipes(recipes: Recipe[], database = this.database): Promise<void> {
    // Hashing and scaling happen before the transaction; Web Crypto must not suspend it.
    const stored = await extractPhotos(recipes);
    await this.write(
      database,
      stored.recipes.map((value) => ({ table: 'recipes', id: value.id, value })),
      stored.images,
    );
  }
  async remove(table: CookbookTable, id: string, database = this.database): Promise<void> {
    await this.write(database, [{ table, id, value: null }]);
  }

  async applyShoppingChanges(
    puts: readonly ShoppingItem[],
    removeIds: readonly string[],
    database = this.database,
    options: { rejectDuplicateSources?: boolean; restoreMissingOnly?: boolean } = {},
  ): Promise<void> {
    // Validate the entire batch before opening a transaction or queueing any records.
    const values = puts.map(readShoppingItem);
    if (removeIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200))
      throw new Error('Invalid shopping item ID.');
    await this.write(database, async () => {
      // These conditions must share the write transaction's IndexedDB lock. Reads made by
      // the UI before committing can already be stale after another tab's batch or Undo.
      if (options.rejectDuplicateSources) {
        const sourceKey = (source: ShoppingSource) =>
          JSON.stringify([
            source.recipeId,
            source.servings,
            source.ingredientIndex,
            source.originalText,
          ]);
        const currentSources = new Set(
          (await database.shoppingItems.toArray()).flatMap((item) =>
            (item.sources ?? []).map(sourceKey),
          ),
        );
        if (
          values.some((item) =>
            item.sources?.some((source) => currentSources.has(sourceKey(source))),
          )
        )
          throw new Error('These ingredients are already on your list.');
      }
      let accepted = values;
      if (options.restoreMissingOnly) {
        const existing = await database.shoppingItems.bulkGet(values.map((value) => value.id));
        const included = new Set<string>();
        accepted = values.filter((value, index) => {
          if (existing[index] || included.has(value.id)) return false;
          included.add(value.id);
          return true;
        });
      }
      return [
        ...accepted.map((value) => ({ table: 'shoppingItems' as const, id: value.id, value })),
        ...removeIds.map((id) => ({ table: 'shoppingItems' as const, id, value: null })),
      ];
    });
  }

  async removeCollection(id: string, database = this.database): Promise<void> {
    const version = this.auth.accountVersion();
    const current = () => database === this.database && version === this.auth.accountVersion();
    const transactions: Dexie = database;
    await transactions.transaction(
      'rw',
      database instanceof AccountDatabase
        ? [database.recipes, database.collections, database.outbox]
        : [database.recipes, database.collections],
      async () => {
        if (!current()) throw new Error('Account changed. Try again.');
        if (!(await database.collections.get(id)))
          throw new Error('Category not found. Reload to try again.');
        const recipes = (await database.recipes.toArray())
          .filter((recipe) => recipe.collectionIds?.includes(id))
          .map((recipe) => ({
            ...recipe,
            collectionIds: (recipe.collectionIds ?? []).filter((categoryId) => categoryId !== id),
            updatedAt: new Date().toISOString(),
          }));
        const changes: Pick<PendingChange, 'table' | 'id' | 'value'>[] = [
          ...recipes.map((value) => ({
            table: 'recipes' as const,
            id: value.id,
            value,
          })),
          { table: 'collections', id, value: null },
        ];
        // Memberships and the category tombstone commit together, including queued cloud writes.
        for (const change of changes) {
          if (!current()) throw new Error('Account changed. Try again.');
          const table = database.table(change.table);
          if (change.value) await table.put(change.value);
          else await table.delete(change.id);
          if (database instanceof AccountDatabase)
            await database.outbox.put({
              ...change,
              key: `${change.table}:${change.id}`,
              revision: crypto.randomUUID(),
            });
        }
        if (!current()) throw new Error('Account changed. Try again.');
      },
    );
    this.revision.update((value) => value + 1);
    if (database instanceof AccountDatabase && current()) {
      const pending = await database.outbox.count();
      if (current()) {
        this.pending.set(pending);
        void this.sync();
      }
    }
  }

  private async write(
    database: CookbookDatabase,
    changes:
      | Pick<PendingChange, 'table' | 'id' | 'value'>[]
      | (() => Promise<Pick<PendingChange, 'table' | 'id' | 'value'>[]>),
    images: readonly PreparedImage[] = [],
  ): Promise<void> {
    const version = this.auth.accountVersion();
    const current = () => database === this.database && version === this.auth.accountVersion();
    if (!current()) throw new Error('Account changed. Try again.');
    const tables = [
      database.recipes,
      database.collections,
      database.shoppingItems,
      ...(images.length ? [database.images, database.thumbs] : []),
    ];
    const transactions: Dexie = database;
    await transactions.transaction(
      'rw',
      database instanceof AccountDatabase ? [...tables, database.outbox] : tables,
      async () => {
        if (!current()) throw new Error('Account changed. Try again.');
        const records = typeof changes === 'function' ? await changes() : changes;
        // Photos commit with the records that reference them; skipped records leave none behind.
        const used = new Set(
          records.flatMap((change) =>
            change.table === 'recipes' && change.value
              ? photoRefs(change.value as Recipe).flatMap((ref) => ref.photoId ?? [])
              : [],
          ),
        );
        await putImages(
          database,
          images.filter((image) => used.has(image.image.id)),
        );
        for (const change of records) {
          if (!current()) throw new Error('Account changed. Try again.');
          const table = database.table(change.table);
          if (change.value) await table.put(change.value);
          else await table.delete(change.id);
          if (database instanceof AccountDatabase)
            await database.outbox.put({
              ...change,
              key: `${change.table}:${change.id}`,
              revision: crypto.randomUUID(),
            });
        }
        if (!current()) throw new Error('Account changed. Try again.');
      },
    );
    if (current()) this.revision.update((value) => value + 1);
    // The device copy is the only copy until it syncs; ask the browser not to evict it.
    void this.durability.ensurePersisted();
    if (database instanceof AccountDatabase && current()) {
      const pending = await database.outbox.count();
      if (current()) {
        this.pending.set(pending);
        void this.sync();
      }
    }
  }

  async importRecords(
    recipes: Recipe[],
    collections: RecipeCollection[] = [],
    database = this.database,
    shoppingItems: readonly ShoppingItem[] = [],
  ) {
    const shopping = shoppingItems.map(readShoppingItem);
    let result = { added: 0, skipped: recipes.length, shoppingAdded: 0 };
    const stored = await extractPhotos(recipes);
    recipes = stored.recipes;
    await this.write(
      database,
      async () => {
        const existing = await database.recipes.bulkGet(recipes.map((recipe) => recipe.id));
        const savedCollections = new Set((await database.collections.toArray()).map((c) => c.id));
        const existingShopping = new Set(
          (await database.shoppingItems.toArray()).map((item) => item.id),
        );
        const added = recipes.filter((_, index) => !existing[index]);
        const shoppingAdded = shopping.filter((item) => !existingShopping.has(item.id));
        result = {
          added: added.length,
          skipped: recipes.length - added.length,
          shoppingAdded: shoppingAdded.length,
        };
        return [
          ...collections
            .filter((c) => !savedCollections.has(c.id))
            .map((value) => ({
              table: 'collections' as const,
              id: value.id,
              value,
            })),
          ...added.map((value) => ({ table: 'recipes' as const, id: value.id, value })),
          ...shoppingAdded.map((value) => ({
            table: 'shoppingItems' as const,
            id: value.id,
            value,
          })),
        ];
      },
      stored.images,
    );
    return result;
  }

  async deviceRecords() {
    return db.transaction('r', db.recipes, db.collections, db.shoppingItems, async () => ({
      recipes: await db.recipes.toArray(),
      collections: await db.collections.toArray(),
      shoppingItems: await db.shoppingItems.toArray(),
    }));
  }

  async deviceRecordCounts() {
    return db.transaction('r', db.recipes, db.collections, db.shoppingItems, async () => ({
      recipes: await db.recipes.count(),
      collections: await db.collections.count(),
      shoppingItems: await db.shoppingItems.count(),
    }));
  }

  async resolveDeviceRecipes(choice: 'add' | 'delete'): Promise<void> {
    const database = this.database;
    const userId = this.auth.user()?.id;
    const version = this.auth.accountVersion();
    if (!(database instanceof AccountDatabase) || !userId) throw new Error('Sign in first.');
    const assertCurrent = () => {
      if (this.auth.user()?.id !== userId || this.auth.accountVersion() !== version)
        throw new Error('Account changed. Your remaining device recipes are safe. Try again.');
    };
    const source = await this.deviceRecords();
    assertCurrent();
    if (choice === 'add') {
      // Compute retry IDs before the transaction: Web Crypto must not suspend a Dexie transaction.
      const recipeIds = new Map(
        await Promise.all(
          source.recipes.map(
            async (recipe) => [recipe.id, await deviceCopyId(userId, 'recipes', recipe)] as const,
          ),
        ),
      );
      const categoryIds = new Map(
        await Promise.all(
          source.collections.map(
            async (category) =>
              [category.id, await deviceCopyId(userId, 'collections', category)] as const,
          ),
        ),
      );
      const shoppingIds = new Map(
        await Promise.all(
          source.shoppingItems.map(
            async (item) => [item.id, await deviceCopyId(userId, 'shoppingItems', item)] as const,
          ),
        ),
      );
      // Account copies reference the same photo ids, so their bytes move with them.
      const stored = await extractPhotos(source.recipes);
      const movedRecipes = new Map(stored.recipes.map((recipe) => [recipe.id, recipe]));
      const images = [...stored.images, ...(await deviceImages(stored.recipes))];
      assertCurrent();
      await database.transaction(
        'rw',
        [
          database.recipes,
          database.collections,
          database.shoppingItems,
          database.outbox,
          database.images,
          database.thumbs,
        ],
        async () => {
          await putImages(database, images);
          const remapped = new Map<string, string>();
          const remappedRecipes = new Map<string, string>();
          const save = async (table: CookbookTable, value: CookbookValue) => {
            assertCurrent();
            await database.table(table).put(value);
            await database.outbox.put({
              key: `${table}:${value.id}`,
              table,
              id: value.id,
              value,
              revision: crypto.randomUUID(),
            });
          };
          for (const category of source.collections) {
            assertCurrent();
            const existing = await database.collections.get(category.id);
            const id =
              existing && !sameDeviceContent(existing, category)
                ? categoryIds.get(category.id)!
                : category.id;
            remapped.set(category.id, id);
            // A stable collision ID also recognizes copies made before interrupted cleanup.
            const copy = { ...category, id };
            const priorCopy = await database.collections.get(id);
            if (priorCopy && !sameDeviceContent(priorCopy, copy))
              throw new Error(
                'A previously transferred category has changed. Device recipes are kept.',
              );
            if (!priorCopy) await save('collections', copy);
          }
          for (const recipe of source.recipes) {
            assertCurrent();
            const value = {
              ...movedRecipes.get(recipe.id)!,
              collectionIds: recipe.collectionIds?.map((id) => remapped.get(id) ?? id),
            };
            const existing = await database.recipes.get(recipe.id);
            const id =
              existing && !sameDeviceContent(existing, value)
                ? recipeIds.get(recipe.id)!
                : recipe.id;
            remappedRecipes.set(recipe.id, id);
            const copy = { ...value, id };
            const priorCopy = await database.recipes.get(id);
            if (priorCopy && !sameDeviceContent(priorCopy, copy))
              throw new Error(
                'A previously transferred recipe has changed. Device recipes are kept.',
              );
            if (!priorCopy) await save('recipes', copy);
          }
          for (const item of source.shoppingItems) {
            assertCurrent();
            const value = readShoppingItem({
              ...item,
              ...(item.sources
                ? {
                    sources: item.sources.map((source) => ({
                      ...source,
                      recipeId: remappedRecipes.get(source.recipeId) ?? source.recipeId,
                    })),
                  }
                : {}),
            });
            const existing = await database.shoppingItems.get(item.id);
            const id =
              existing && !sameDeviceContent(existing, value) ? shoppingIds.get(item.id)! : item.id;
            const copy = { ...value, id };
            const priorCopy = await database.shoppingItems.get(id);
            if (priorCopy && !sameDeviceContent(priorCopy, copy))
              throw new Error(
                'A previously transferred shopping item has changed. Device data is kept.',
              );
            if (!priorCopy) await save('shoppingItems', copy);
          }
          assertCurrent();
        },
      );
    }
    assertCurrent();
    // Account cache and outbox are durable before removing anything from the guest database.
    // Concurrent guest edits and new records stay available for another explicit choice.
    const deviceTables = [db.recipes, db.collections, db.shoppingItems, db.images, db.thumbs];
    await db.transaction('rw', deviceTables, async () => {
      for (const recipe of source.recipes) {
        assertCurrent();
        if (sameDeviceRecord(await db.recipes.get(recipe.id), recipe)) {
          await db.recipes.delete(recipe.id);
        }
      }
      const remaining = await db.recipes.toArray();
      // Photos no remaining device recipe uses now live only in the account.
      const kept = new Set(
        remaining.flatMap((recipe) => photoRefs(recipe).map((ref) => ref.photoId)),
      );
      const unused = (await db.images.toCollection().primaryKeys()).filter((id) => !kept.has(id));
      await db.images.bulkDelete(unused);
      await db.thumbs.bulkDelete(unused);
      for (const category of source.collections) {
        assertCurrent();
        if (remaining.some((recipe) => recipe.collectionIds?.includes(category.id))) continue;
        if (sameDeviceRecord(await db.collections.get(category.id), category))
          await db.collections.delete(category.id);
      }
      for (const item of source.shoppingItems) {
        assertCurrent();
        if (sameDeviceRecord(await db.shoppingItems.get(item.id), item))
          await db.shoppingItems.delete(item.id);
      }
      assertCurrent();
    });
    this.revision.update((value) => value + 1);
    const pending = await database.outbox.count();
    assertCurrent();
    this.pending.set(pending);
    if (choice === 'add') void this.sync();
  }

  async prepareSignOut(): Promise<number> {
    const cache = this.database;
    const version = this.auth.accountVersion();
    await this.sync();
    if (version !== this.auth.accountVersion()) throw new Error('Account changed. Try again.');
    return cache instanceof AccountDatabase ? cache.outbox.count() : 0;
  }

  sync(): Promise<void> {
    this.selectAccount(this.auth.user()?.id ?? null);
    const cache = this.cache;
    const userId = this.accountId;
    const client = this.auth.client;
    const version = this.auth.accountVersion();
    if (!cache || !userId || !client) return Promise.resolve();
    const existing = this.running.get(cache);
    if (existing) return existing;
    const operation = this.syncAccount(cache, userId, client, version);
    this.running.set(cache, operation);
    return operation;
  }

  private async syncAccount(
    cache: AccountDatabase,
    userId: string,
    client: NonNullable<SupabaseService['client']>,
    version: number,
  ): Promise<void> {
    const current = () =>
      this.cache === cache &&
      this.auth.user()?.id === userId &&
      this.auth.accountVersion() === version;
    this.syncing.set(true);
    this.error.set('');
    let completed = false;
    let shoppingUnavailable = false;
    try {
      const pending = await cache.outbox.count();
      if (!current()) return;
      this.pending.set(pending);
      if (!navigator.onLine) return;
      for (const change of await cache.outbox.toArray()) {
        if (!current()) return;
        if (change.table === 'shoppingItems' && shoppingUnavailable) continue;
        let payload: CookbookValue | null = change.value;
        let photos: RecipePhotos = {};
        if (change.table === 'recipes' && payload) {
          const uploaded = await uploadPhotos(
            client,
            userId,
            payload as Recipe,
            cache,
            (await cache.photos.get(change.id))?.paths,
          );
          payload = readCloudRecipe(uploaded.payload);
          photos = uploaded.photos;
        }
        if (!current()) return;
        const { error } = await client.from(remoteTable(change.table)).upsert(
          {
            user_id: userId,
            id: change.id,
            payload,
            ...(change.table === 'shoppingItems' ? {} : { photos }),
            deleted: change.value === null,
          },
          { onConflict: 'user_id,id' },
        );
        if (error) {
          if (change.table === 'shoppingItems' && missingShoppingTable(error)) {
            shoppingUnavailable = true;
            continue;
          }
          throw new Error(error.message);
        }
        await cache.transaction('rw', cache.outbox, cache.photos, async () => {
          // An edit made during upload must stay queued, rather than being acknowledged away.
          if (!current() || (await cache.outbox.get(change.key))?.revision !== change.revision)
            return;
          await cache.outbox.delete(change.key);
          if (change.table === 'recipes') await cache.photos.put({ id: change.id, paths: photos });
        });
      }
      for (const table of ['collections', 'recipes', 'shoppingItems'] as const) {
        if (table === 'shoppingItems' && shoppingUnavailable) continue;
        const outcome = await pullTable({ cache, client, userId, current }, table);
        if (outcome === 'stale') return;
        if (outcome === 'missing') shoppingUnavailable = true;
      }
      if (current()) {
        this.revision.update((value) => value + 1);
        if (shoppingUnavailable)
          this.error.set(
            'Shopping list sync is not ready yet. Your items are saved on this device.',
          );
        else this.lastSynced.set(new Date().toISOString());
      }
      completed = true;
    } catch (error) {
      console.error('Cloud sync failed:', error instanceof Error ? error.message : 'Unknown error');
      if (current())
        this.error.set(
          'Could not sync. Your changes are saved on this device. Try again when online.',
        );
    } finally {
      this.running.delete(cache);
      if (this.cache === cache) {
        const pending = await cache.outbox.count();
        if (this.cache !== cache) return;
        if (!current()) {
          queueMicrotask(() => void this.sync());
          return;
        }
        this.pending.set(pending);
        this.syncing.set(false);
        if (completed && pending > 0) {
          // During the additive rollout, drain concurrent recipe/category writes but do not
          // spin indefinitely on shopping records whose table is not available yet.
          const retryable =
            !shoppingUnavailable ||
            (await cache.outbox.toArray()).some((change) => change.table !== 'shoppingItems');
          if (current() && retryable) queueMicrotask(() => void this.sync());
        }
      }
    }
  }
}

/** Bytes of photos the device database already stores for these recipes. */
async function deviceImages(recipes: readonly Recipe[]): Promise<PreparedImage[]> {
  const ids = [
    ...new Set(recipes.flatMap((recipe) => photoRefs(recipe).flatMap((ref) => ref.photoId ?? []))),
  ];
  const [images, thumbs] = await Promise.all([db.images.bulkGet(ids), db.thumbs.bulkGet(ids)]);
  return images.flatMap((image, index) =>
    image ? [{ image, ...(thumbs[index] ? { thumb: thumbs[index] } : {}) }] : [],
  );
}

// Stable IDs preserve different recipes with the same ID and make interrupted transfers retryable.
async function deviceCopyId(userId: string, table: CookbookTable, value: CookbookValue) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${userId}:${table}:${deviceContent(value)}`),
    ),
  );
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameDeviceRecord(a: unknown, b: unknown): boolean {
  return a !== undefined && canonicalRecord(a) === canonicalRecord(b);
}

function sameDeviceContent(a: CookbookValue, b: CookbookValue): boolean {
  return deviceContent(a) === deviceContent(b);
}

function deviceContent(value: CookbookValue): string {
  const { createdAt, updatedAt, ...content } = value as Recipe;
  return canonicalRecord(content);
}

function canonicalRecord(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  });
}
