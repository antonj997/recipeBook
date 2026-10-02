import { effect, inject, Service, signal } from '@angular/core';
import type Dexie from 'dexie';
import { db } from '../database';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { AccountDatabase, type CookbookTable, type PendingChange } from './account-database';
import { SupabaseService } from './supabase.service';
import { downloadPhotos, uploadPhotos, type RecipePhotos } from './cloud-photos';
import { readRecipeMetadata, isRecipeImage, isHttpsUrl } from '../models/recipe-metadata';

type CookbookDatabase = typeof db | AccountDatabase;
interface CloudRow {
  id: string;
  payload: unknown;
  photos: RecipePhotos | null;
  deleted: boolean;
}

@Service()
export class CloudCookbookService {
  readonly auth = inject(SupabaseService);
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
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.initialize().then(() => this.sync());
    });
    window.addEventListener('offline', () => this.online.set(false));
    document.addEventListener('visibilitychange', () => {
      // Refresh recipes from other devices, and retry queued changes after returning to the app.
      if (document.visibilityState === 'visible' && navigator.onLine)
        void this.initialize().then(() => this.sync());
    });
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

  async put(
    table: CookbookTable,
    value: Recipe | RecipeCollection,
    database = this.database,
  ): Promise<void> {
    await this.write(database, [{ table, id: value.id, value }]);
  }
  async putRecipes(recipes: Recipe[], database = this.database): Promise<void> {
    await this.write(
      database,
      recipes.map((value) => ({ table: 'recipes', id: value.id, value })),
    );
  }
  async remove(table: CookbookTable, id: string): Promise<void> {
    await this.write(this.database, [{ table, id, value: null }]);
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
    changes: Pick<PendingChange, 'table' | 'id' | 'value'>[],
  ): Promise<void> {
    const tables = [database.recipes, database.collections];
    const transactions: Dexie = database;
    await transactions.transaction(
      'rw',
      database instanceof AccountDatabase ? [...tables, database.outbox] : tables,
      async () => {
        for (const change of changes) {
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
      },
    );
    this.revision.update((value) => value + 1);
    if (database instanceof AccountDatabase && database === this.cache) {
      const pending = await database.outbox.count();
      if (database === this.cache) {
        this.pending.set(pending);
        void this.sync();
      }
    }
  }

  async importRecords(
    recipes: Recipe[],
    collections: RecipeCollection[] = [],
    database = this.database,
  ) {
    const existing = await database.recipes.bulkGet(recipes.map((recipe) => recipe.id));
    const savedCollections = new Set((await database.collections.toArray()).map((c) => c.id));
    const added = recipes.filter((_, index) => !existing[index]);
    await this.write(database, [
      ...collections
        .filter((c) => !savedCollections.has(c.id))
        .map((value) => ({
          table: 'collections' as const,
          id: value.id,
          value,
        })),
      ...added.map((value) => ({
        table: 'recipes' as const,
        id: value.id,
        value,
      })),
    ]);
    return { added: added.length, skipped: recipes.length - added.length };
  }

  async deviceRecords() {
    return db.transaction('r', db.recipes, db.collections, async () => ({
      recipes: await db.recipes.toArray(),
      collections: await db.collections.toArray(),
    }));
  }

  async deviceRecordCounts() {
    return db.transaction('r', db.recipes, db.collections, async () => ({
      recipes: await db.recipes.count(),
      collections: await db.collections.count(),
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
      assertCurrent();
      await database.transaction(
        'rw',
        database.recipes,
        database.collections,
        database.outbox,
        async () => {
          const remapped = new Map<string, string>();
          const save = async (table: CookbookTable, value: Recipe | RecipeCollection) => {
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
              ...recipe,
              collectionIds: recipe.collectionIds?.map((id) => remapped.get(id) ?? id),
            };
            const existing = await database.recipes.get(recipe.id);
            if (existing && sameDeviceContent(existing, value)) continue;
            const id = existing ? recipeIds.get(recipe.id)! : recipe.id;
            const copy = { ...value, id };
            const priorCopy = await database.recipes.get(id);
            if (priorCopy && !sameDeviceContent(priorCopy, copy))
              throw new Error(
                'A previously transferred recipe has changed. Device recipes are kept.',
              );
            if (!priorCopy) await save('recipes', copy);
          }
          assertCurrent();
        },
      );
    }
    assertCurrent();
    // Account cache and outbox are durable before removing anything from the guest database.
    // Concurrent guest edits and new records stay available for another explicit choice.
    await db.transaction('rw', db.recipes, db.collections, async () => {
      for (const recipe of source.recipes) {
        assertCurrent();
        if (sameDeviceRecord(await db.recipes.get(recipe.id), recipe)) {
          await db.recipes.delete(recipe.id);
        }
      }
      const remaining = await db.recipes.toArray();
      for (const category of source.collections) {
        assertCurrent();
        if (remaining.some((recipe) => recipe.collectionIds?.includes(category.id))) continue;
        if (sameDeviceRecord(await db.collections.get(category.id), category))
          await db.collections.delete(category.id);
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
    const current = () => this.cache === cache && this.auth.accountVersion() === version;
    this.syncing.set(true);
    this.error.set('');
    let completed = false;
    try {
      const pending = await cache.outbox.count();
      if (!current()) return;
      this.pending.set(pending);
      if (!navigator.onLine) return;
      for (const change of await cache.outbox.toArray()) {
        if (!current()) return;
        let payload: Recipe | RecipeCollection | null = change.value;
        let photos: RecipePhotos = {};
        if (change.table === 'recipes' && payload) {
          const uploaded = await uploadPhotos(client, userId, readCloudRecipe(payload));
          payload = uploaded.payload;
          photos = uploaded.photos;
        }
        if (!current()) return;
        const { error } = await client.from(change.table).upsert(
          {
            user_id: userId,
            id: change.id,
            payload,
            photos,
            deleted: change.value === null,
          },
          { onConflict: 'user_id,id' },
        );
        if (error) throw new Error(error.message);
        await cache.transaction('rw', cache.outbox, cache.photos, async () => {
          // An edit made during upload must stay queued, rather than being acknowledged away.
          if ((await cache.outbox.get(change.key))?.revision !== change.revision) return;
          await cache.outbox.delete(change.key);
          if (change.table === 'recipes') await cache.photos.put({ id: change.id, paths: photos });
        });
      }
      for (const tableName of ['collections', 'recipes'] as const) {
        const rows: CloudRow[] = [];
        for (let offset = 0; ; offset += 500) {
          if (!current()) return;
          const { data, error } = await client
            .from(tableName)
            .select('id,payload,photos,deleted')
            .eq('user_id', userId)
            .order('id')
            .range(offset, offset + 499);
          if (error) throw new Error(error.message);
          const page = (data ?? []) as CloudRow[];
          rows.push(...page);
          if (page.length < 500) break;
        }
        for (const row of rows) {
          if (!current()) return;
          const key = `${tableName}:${row.id}`;
          if (await cache.outbox.get(key)) continue;
          let value: Recipe | RecipeCollection | null = null;
          if (!row.deleted) {
            if (tableName === 'recipes') {
              value = await downloadPhotos(
                client,
                userId,
                readCloudRecipe(row.payload),
                row.photos ?? {},
                await cache.recipes.get(row.id),
                (await cache.photos.get(row.id))?.paths,
              );
            } else value = readCloudCollection(row.payload);
          }
          if (!current()) return;
          await cache.transaction(
            'rw',
            cache.table(tableName),
            cache.outbox,
            cache.photos,
            async () => {
              if (await cache.outbox.get(key)) return;
              if (value) await cache.table(tableName).put(value);
              else await cache.table(tableName).delete(row.id);
              if (tableName === 'recipes')
                await cache.photos.put({ id: row.id, paths: row.photos ?? {} });
            },
          );
        }
      }
      if (current()) {
        this.revision.update((value) => value + 1);
        this.lastSynced.set(new Date().toISOString());
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
        if (completed && pending > 0) queueMicrotask(() => void this.sync());
      }
    }
  }
}

// Stable IDs preserve different recipes with the same ID and make interrupted transfers retryable.
async function deviceCopyId(
  userId: string,
  table: CookbookTable,
  value: Recipe | RecipeCollection,
) {
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

function sameDeviceContent(a: Recipe | RecipeCollection, b: Recipe | RecipeCollection): boolean {
  return deviceContent(a) === deviceContent(b);
}

function deviceContent(value: Recipe | RecipeCollection): string {
  const { createdAt, updatedAt, ...content } = value as Recipe;
  return canonicalRecord(content);
}

function canonicalRecord(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function readCloudRecipe(value: unknown): Recipe {
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud recipe.');
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['title'] !== 'string' ||
    !Array.isArray(raw['ingredients']) ||
    !raw['ingredients'].every((v) => typeof v === 'string') ||
    !Array.isArray(raw['instructions']) ||
    !raw['instructions'].every((v) => typeof v === 'string')
  )
    throw new Error('Invalid cloud recipe.');
  const recipe: Recipe = {
    ...readRecipeMetadata(value, true),
    id: raw['id'],
    title: raw['title'],
    ingredients: raw['ingredients'],
    instructions: raw['instructions'],
  };
  if (typeof raw['servings'] === 'number') recipe.servings = raw['servings'];
  if (raw['imageDataUrl'] != null) {
    if (!isRecipeImage(raw['imageDataUrl'])) throw new Error('Invalid recipe photo.');
    recipe.imageDataUrl = raw['imageDataUrl'];
  }
  if (raw['sourceUrl'] != null) {
    if (!isHttpsUrl(raw['sourceUrl'])) throw new Error('Invalid recipe link.');
    recipe.sourceUrl = raw['sourceUrl'];
  }
  for (const field of ['notes', 'createdAt', 'updatedAt'] as const)
    if (typeof raw[field] === 'string') recipe[field] = raw[field];
  for (const field of ['tagIds', 'collectionIds'] as const)
    if (Array.isArray(raw[field]) && raw[field].every((v) => typeof v === 'string'))
      recipe[field] = raw[field];
  return recipe;
}
function readCloudCollection(value: unknown): RecipeCollection {
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud collection.');
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['name'] !== 'string' ||
    typeof raw['sortOrder'] !== 'number'
  )
    throw new Error('Invalid cloud collection.');
  return { id: raw['id'], name: raw['name'], sortOrder: raw['sortOrder'] };
}
