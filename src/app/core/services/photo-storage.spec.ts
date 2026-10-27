import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database';
import { bytesToDataUrl, imageId } from '../models/recipe-image';
import { testJpeg } from '../models/recipe-image.testing';
import type { Recipe } from '../models/recipe.model';
import { AccountDatabase } from './account-database';
import { CloudCookbookService } from './cloud-cookbook.service';
import { RecipeService } from './recipe.service';
import { StepTimerService } from './step-timer.service';
import { StorageDurabilityService } from './storage-durability.service';
import { SupabaseService } from './supabase.service';

const cover = testJpeg(640, 480, 7);
const step = testJpeg(320, 240, 8);
const recipe: Recipe = {
  id: 'soup',
  title: 'Soup',
  servings: 4,
  ingredients: ['2 onions'],
  instructions: ['Cook.', 'Serve.'],
  imageDataUrl: bytesToDataUrl(cover),
  stepDetails: [{ imageDataUrl: bytesToDataUrl(step) }, {}],
};

describe('recipe photos in storage, sync and backups', () => {
  const user = signal<{ id: string } | null>(null);
  const accountVersion = signal(0);
  let auth: {
    user: typeof user;
    accountVersion: typeof accountVersion;
    initialize: () => Promise<void>;
    client: unknown;
  };
  let cloud: CloudCookbookService;
  let uploads: { path: string; bytes: number[] }[];
  let downloads: string[];
  let upserts: Record<string, unknown>[];
  let remote: Record<string, unknown>[];
  let files: Map<string, Uint8Array>;

  function account(id = 'alice') {
    user.set({ id });
    accountVersion.update((version) => version + 1);
    return cloud.database as AccountDatabase;
  }
  function enableNetwork() {
    auth.client = {
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({ data: table === 'recipes' ? remote : [], error: null }),
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          upload: async (path: string, blob: Blob) => {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            uploads.push({ path, bytes: [...bytes] });
            files.set(path, bytes);
            return { error: null };
          },
          download: async (path: string) => {
            downloads.push(path);
            const bytes = files.get(path);
            return bytes
              ? { data: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), error: null }
              : { data: null, error: { message: 'Not found' } };
          },
        }),
      },
    };
  }

  beforeEach(async () => {
    user.set(null);
    accountVersion.set(0);
    uploads = [];
    downloads = [];
    upserts = [];
    remote = [];
    files = new Map();
    auth = { user, accountVersion, initialize: async () => undefined, client: null };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: auth },
        { provide: StepTimerService, useValue: { removeRecipe: vi.fn() } },
        { provide: StorageDurabilityService, useValue: { ensurePersisted: async () => true } },
      ],
    });
    cloud = TestBed.inject(CloudCookbookService);
    await Promise.all([
      db.recipes.clear(),
      db.collections.clear(),
      db.images.clear(),
      db.thumbs.clear(),
    ]);
  });
  afterEach(async () => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    for (const { name } of await indexedDB.databases())
      if (name?.startsWith('RecipebookAccount-')) await Dexie.delete(name);
  });

  it('saves data-URL photos once in the image store and keeps only their ids', async () => {
    await cloud.put('recipes', recipe, db);
    const saved = (await db.recipes.get('soup'))!;
    expect(saved.photoId).toBe(await imageId(cover));
    expect(saved.stepDetails).toEqual([{ photoId: await imageId(step) }, {}]);
    expect(JSON.stringify(saved)).not.toContain('data:image');
    expect([...new Uint8Array((await db.images.get(saved.photoId!))!.bytes)]).toEqual([...cover]);
    expect(await db.images.count()).toBe(2);
  });

  it('uploads stored photos under their content hash without sending ids or bytes in the row', async () => {
    const cache = account();
    enableNetwork();
    await cloud.put('recipes', recipe, cache);
    await cloud.sync();
    const coverPath = `alice/${await imageId(cover)}.jpg`;
    const stepPath = `alice/${await imageId(step)}.jpg`;
    expect(uploads.map((upload) => upload.path).sort()).toEqual([coverPath, stepPath].sort());
    expect(uploads.find((upload) => upload.path === coverPath)!.bytes).toEqual([...cover]);
    const row = upserts.find((upsert) => upsert['id'] === 'soup')!;
    expect(row['photos']).toEqual({ cover: coverPath, steps: { '0': stepPath } });
    expect(JSON.stringify(row['payload'])).not.toMatch(/photoId|imageDataUrl/);
  });

  it('uploads a change queued with a data URL before the image store existed', async () => {
    const cache = account();
    await cache.transaction('rw', cache.recipes, cache.outbox, async () => {
      await cache.recipes.put(recipe);
      await cache.outbox.put({
        key: 'recipes:soup',
        table: 'recipes',
        id: 'soup',
        value: recipe,
        revision: 'old',
      });
    });
    enableNetwork();
    await cloud.sync();
    expect(uploads.map((upload) => upload.path)).toContain(`alice/${await imageId(cover)}.jpg`);
    expect(await cache.outbox.count()).toBe(0);
  });

  it('uploads no photo again when only the title changes', async () => {
    const cache = account();
    enableNetwork();
    await cloud.put('recipes', recipe, cache);
    await cloud.sync();
    uploads.length = 0;
    await cloud.put(
      'recipes',
      { ...(await cache.recipes.get('soup'))!, title: 'Onion soup' },
      cache,
    );
    await cloud.sync();
    expect(uploads).toEqual([]);
    expect(upserts.at(-1)!['photos']).toEqual({
      cover: `alice/${await imageId(cover)}.jpg`,
      steps: { '0': `alice/${await imageId(step)}.jpg` },
    });
  });

  it('downloads a new cloud photo into the image store and references it by id', async () => {
    const cache = account();
    enableNetwork();
    const path = `alice/${await imageId(cover)}.jpg`;
    files.set(path, cover);
    const { imageDataUrl, stepDetails, ...payload } = recipe;
    remote = [
      {
        id: 'soup',
        payload: { ...payload, stepDetails: [{}, {}] },
        photos: { cover: path },
        deleted: false,
      },
    ];
    await cloud.sync();
    const saved = (await cache.recipes.get('soup'))!;
    expect(saved.photoId).toBe(await imageId(cover));
    expect(saved.imageDataUrl).toBeUndefined();
    expect([...new Uint8Array((await cache.images.get(saved.photoId!))!.bytes)]).toEqual([
      ...cover,
    ]);
    expect(imageDataUrl && stepDetails).toBeTruthy();
  });

  it('never downloads a photo this device already stores', async () => {
    const cache = account();
    enableNetwork();
    await cloud.put('recipes', { ...recipe, id: 'other' }, cache);
    await cloud.sync();
    const path = `alice/${await imageId(cover)}.jpg`;
    const { imageDataUrl, stepDetails, ...payload } = recipe;
    remote = [
      {
        id: 'soup',
        payload: { ...payload, stepDetails: [{}, {}] },
        photos: { cover: path },
        deleted: false,
      },
    ];
    files.clear();
    await cloud.sync();
    expect(downloads).toEqual([]);
    expect((await cache.recipes.get('soup'))!.photoId).toBe(await imageId(cover));
    expect(imageDataUrl && stepDetails).toBeTruthy();
  });

  it('round-trips photos through a backup byte for byte', async () => {
    const recipes = TestBed.inject(RecipeService);
    await cloud.put('recipes', recipe, db);
    const backup = await recipes.exportBackup();
    expect(backup.recipes[0]).toMatchObject({
      imageDataUrl: recipe.imageDataUrl,
      stepDetails: [{ imageDataUrl: recipe.stepDetails![0]!.imageDataUrl }, {}],
    });
    expect(JSON.stringify(backup)).not.toContain('photoId');
    const cache = account();
    await recipes.importBackup(JSON.parse(JSON.stringify(backup)));
    const restored = (await cache.recipes.get('soup'))!;
    expect(restored.photoId).toBe(await imageId(cover));
    expect([...new Uint8Array((await cache.images.get(restored.photoId!))!.bytes)]).toEqual([
      ...cover,
    ]);
    expect([...new Uint8Array((await cache.images.get(await imageId(step)))!.bytes)]).toEqual([
      ...step,
    ]);
  });

  it('copies referenced photos when guest recipes move into an account', async () => {
    await cloud.put('recipes', recipe, db);
    const cache = account();
    await cloud.resolveDeviceRecipes('add');
    const moved = (await cache.recipes.get('soup'))!;
    expect(moved.photoId).toBe(await imageId(cover));
    expect([...new Uint8Array((await cache.images.get(moved.photoId!))!.bytes)]).toEqual([
      ...cover,
    ]);
    expect(await cache.images.get(await imageId(step))).toBeDefined();
    expect(await db.recipes.count()).toBe(0);
    expect(await db.images.count()).toBe(0);
  });
});
