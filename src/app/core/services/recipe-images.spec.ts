import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../database';
import { bytesToDataUrl } from '../models/recipe-image';
import { CloudCookbookService } from './cloud-cookbook.service';
import { RecipeImagesService } from './recipe-images.service';

const full = (id: string, bytes = [1, 2, 3]) => ({
  id,
  bytes: new Uint8Array(bytes).buffer,
  width: 1200,
  height: 900,
  createdAt: '2026-10-27T00:00:00.000Z',
});
const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

describe('RecipeImagesService', () => {
  let created: Blob[];
  let revoked: string[];
  beforeEach(async () => {
    created = [];
    revoked = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return 'blob:test/' + created.length;
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });
    await db.images.clear();
    await db.thumbs.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CloudCookbookService,
          useValue: {
            get database() {
              return db;
            },
          },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('has no URL for a stored photo until it is prepared', async () => {
    await db.images.put(full(a));
    const images = TestBed.inject(RecipeImagesService);
    expect(images.peek({ photoId: a }, 'full')).toBeUndefined();
    await images.prepare([{ photoId: a }], 'full');
    expect(images.peek({ photoId: a }, 'full')).toBe('blob:test/1');
    expect(created[0].type).toBe('image/jpeg');
  });

  it('prefers the smaller copy for thumbnails and falls back to the original', async () => {
    await db.images.bulkPut([full(a), full(b)]);
    await db.thumbs.put({ id: a, bytes: new Uint8Array([9]).buffer, width: 800, height: 600 });
    const images = TestBed.inject(RecipeImagesService);
    await images.prepare([{ photoId: a }, { photoId: b }], 'thumb');
    expect(created.map((blob) => blob.size)).toEqual([1, 3]);
    expect(images.peek({ photoId: a }, 'thumb')).toBe('blob:test/1');
    expect(images.peek({ photoId: b }, 'thumb')).toBe('blob:test/2');
  });

  it('shows records that still carry a data URL directly', () => {
    const images = TestBed.inject(RecipeImagesService);
    const imageDataUrl = bytesToDataUrl(new Uint8Array([1, 2, 3]));
    expect(images.peek({ imageDataUrl }, 'thumb')).toBe(imageDataUrl);
  });

  it('creates one URL per photo however often it is prepared', async () => {
    await db.images.put(full(a));
    const images = TestBed.inject(RecipeImagesService);
    await Promise.all([
      images.prepare([{ photoId: a }], 'full'),
      images.prepare([{ photoId: a }, { photoId: a }], 'full'),
    ]);
    await images.prepare([{ photoId: a }], 'full');
    expect(created).toHaveLength(1);
  });

  it('notifies views when new URLs are ready', async () => {
    await db.images.put(full(a));
    const images = TestBed.inject(RecipeImagesService);
    const before = images.version();
    await images.prepare([{ photoId: a }], 'full');
    expect(images.version()).toBeGreaterThan(before);
  });

  it('ignores missing photos', async () => {
    const images = TestBed.inject(RecipeImagesService);
    await images.prepare([{ photoId: a }, undefined, {}], 'full');
    expect(images.peek({ photoId: a }, 'full')).toBeUndefined();
  });

  it('revokes every URL and drops late results when the account changes', async () => {
    await db.images.bulkPut([full(a), full(b)]);
    const images = TestBed.inject(RecipeImagesService);
    await images.prepare([{ photoId: a }], 'full');
    const late = images.prepare([{ photoId: b }], 'full');
    images.clear();
    await late;
    expect(revoked).toEqual(['blob:test/1']);
    expect(images.peek({ photoId: a }, 'full')).toBeUndefined();
    expect(images.peek({ photoId: b }, 'full')).toBeUndefined();
  });

  it('gives the editor a data URL for a stored photo', async () => {
    await db.images.put(full(a, [255, 216, 255]));
    const images = TestBed.inject(RecipeImagesService);
    expect(await images.dataUrl({ photoId: a })).toBe(
      bytesToDataUrl(new Uint8Array([255, 216, 255])),
    );
    expect(await images.dataUrl({ photoId: b })).toBeUndefined();
  });

  it('hands the editor a recipe whose stored photos are data URLs again', async () => {
    await db.images.bulkPut([full(a, [255, 216, 1]), full(b, [255, 216, 2])]);
    const images = TestBed.inject(RecipeImagesService);
    const recipe = {
      id: 'soup',
      title: 'Soup',
      ingredients: [],
      instructions: ['Boil.', 'Serve.'],
      photoId: a,
      stepDetails: [{ photoId: b }, { section: 'Serving' }],
    };
    const editable = await images.withPhotoData(recipe);
    expect(editable.imageDataUrl).toBe(bytesToDataUrl(new Uint8Array([255, 216, 1])));
    expect(editable.photoId).toBeUndefined();
    expect(editable.stepDetails).toEqual([
      { imageDataUrl: bytesToDataUrl(new Uint8Array([255, 216, 2])) },
      { section: 'Serving' },
    ]);
    expect(recipe.photoId).toBe(a);
  });
});
