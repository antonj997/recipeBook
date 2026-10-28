import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database';
import { bytesToDataUrl, imageId } from '../models/recipe-image';
import { testJpeg } from '../models/recipe-image.testing';
import type { Recipe } from '../models/recipe.model';
import { CloudCookbookService } from './cloud-cookbook.service';
import { ImageMigrationService } from './image-migration.service';

const photo = (salt: number) => bytesToDataUrl(testJpeg(640, 480, salt));
const legacy = (id: string, salt: number): Recipe => ({
  id,
  title: id,
  ingredients: [],
  instructions: ['Cook.'],
  imageDataUrl: photo(salt),
  stepDetails: [{ imageDataUrl: photo(salt + 100) }],
});
const noThumb = async () => undefined;

describe('ImageMigrationService', () => {
  const revision = signal(0);
  let migration: ImageMigrationService;

  beforeEach(async () => {
    revision.set(0);
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: CloudCookbookService, useValue: { revision, database: db } }],
    });
    migration = TestBed.inject(ImageMigrationService);
    await Promise.all([db.recipes.clear(), db.images.clear(), db.thumbs.clear()]);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('moves every data-URL photo into the store and refreshes views once', async () => {
    await db.recipes.bulkPut([legacy('a', 1), legacy('b', 2), legacy('c', 3), legacy('d', 4)]);
    const moved = await migration.run(db, new AbortController().signal, { makeThumb: noThumb });
    expect(moved).toBe(4);
    const saved = await db.recipes.orderBy('id').toArray();
    expect(JSON.stringify(saved)).not.toContain('data:image');
    expect(saved[0]).toMatchObject({
      photoId: await imageId(testJpeg(640, 480, 1)),
      stepDetails: [{ photoId: await imageId(testJpeg(640, 480, 101)) }],
    });
    expect(await db.images.count()).toBe(8);
    expect(revision()).toBe(1);
  });

  it('is idempotent', async () => {
    await db.recipes.bulkPut([legacy('a', 1)]);
    await migration.run(db, new AbortController().signal, { makeThumb: noThumb });
    const first = await db.recipes.toArray();
    expect(await migration.run(db, new AbortController().signal, { makeThumb: noThumb })).toBe(0);
    expect(await db.recipes.toArray()).toEqual(first);
    expect(revision()).toBe(1);
  });

  it('leaves each recipe either fully migrated or untouched when interrupted', async () => {
    await db.recipes.bulkPut([legacy('a', 1), legacy('b', 2), legacy('c', 3), legacy('d', 4)]);
    const controller = new AbortController();
    let made = 0;
    await migration.run(db, controller.signal, {
      batchSize: 3,
      makeThumb: async () => {
        // The first batch has six photos; abort while preparing the second.
        if (++made === 7) controller.abort();
        return undefined;
      },
    });
    const saved = await db.recipes.orderBy('id').toArray();
    for (const recipe of saved.slice(0, 3)) expect(JSON.stringify(recipe)).not.toContain('data:');
    expect(saved[3]).toEqual(legacy('d', 4));
  });

  it('writes nothing once the account changes during preparation', async () => {
    await db.recipes.bulkPut([legacy('a', 1)]);
    const controller = new AbortController();
    await migration.run(db, controller.signal, {
      makeThumb: async () => {
        controller.abort();
        return undefined;
      },
    });
    expect(await db.recipes.get('a')).toEqual(legacy('a', 1));
    expect(await db.images.count()).toBe(0);
    expect(revision()).toBe(0);
  });

  it('keeps a photo the user changed while the migration prepared the old one', async () => {
    await db.recipes.bulkPut([legacy('a', 1)]);
    const edited = { ...legacy('a', 1), imageDataUrl: photo(50) };
    await migration.run(db, new AbortController().signal, {
      makeThumb: async () => {
        await db.recipes.put(edited);
        return undefined;
      },
    });
    expect((await db.recipes.get('a'))!.imageDataUrl).toBe(edited.imageDataUrl);
  });

  it('adds missing smaller copies for large stored photos', async () => {
    const large = testJpeg(1200, 900, 9);
    const small = testJpeg(640, 480, 10);
    const now = new Date().toISOString();
    for (const bytes of [large, small])
      await db.images.put({
        id: await imageId(bytes),
        bytes: bytes.slice().buffer,
        width: 0,
        height: 0,
        createdAt: now,
      });
    await db.images.update(await imageId(large), { width: 1200, height: 900 });
    await db.images.update(await imageId(small), { width: 640, height: 480 });
    const thumb = testJpeg(800, 600, 11);
    await migration.run(db, new AbortController().signal, {
      makeThumb: async () => ({ bytes: thumb.slice().buffer, width: 800, height: 600 }),
    });
    expect(await db.thumbs.toCollection().primaryKeys()).toEqual([await imageId(large)]);
  });
});

describe('ImageMigrationService on an account cache', () => {
  afterEach(async () => {
    TestBed.resetTestingModule();
    await Dexie.delete('RecipebookAccount-ImageMigrationTest');
  });
  it('runs on any cookbook database it is given', async () => {
    localStorage.clear();
    const { AccountDatabase } = await import('./account-database');
    const account = new AccountDatabase('ImageMigrationTest');
    TestBed.configureTestingModule({
      providers: [{ provide: CloudCookbookService, useValue: { revision: signal(0) } }],
    });
    await account.recipes.put(legacy('a', 1));
    await TestBed.inject(ImageMigrationService).run(account, new AbortController().signal, {
      makeThumb: noThumb,
    });
    expect((await account.recipes.get('a'))!.photoId).toBe(await imageId(testJpeg(640, 480, 1)));
    expect(await account.outbox.count()).toBe(0);
    account.close();
  });
});
