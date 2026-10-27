import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bytesToDataUrl,
  dataUrlBytes,
  extractPhotos,
  hasPhoto,
  imageId,
  inlinePhotos,
  prepareImage,
  putImages,
  type ImageTables,
} from './recipe-image';
import { testJpeg } from './recipe-image.testing';
import type { Recipe } from './recipe.model';

const jpeg = testJpeg;

describe('recipe images', () => {
  let database: (Dexie & ImageTables) | undefined;
  afterEach(async () => {
    database?.close();
    await Dexie.delete('ImageTest');
  });

  it('names a photo by the SHA-256 of its bytes, as cloud storage paths do', async () => {
    expect(await imageId(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('turns JPEG data URLs into bytes and back without changing them', () => {
    const bytes = jpeg();
    const url = bytesToDataUrl(bytes);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect([...dataUrlBytes(url)]).toEqual([...bytes]);
  });

  it('rejects anything that is not a JPEG data URL', () => {
    expect(() => dataUrlBytes('data:text/html;base64,PGI+')).toThrow('Invalid recipe photo.');
  });

  it('knows whether a recipe or step has a photo in either form', () => {
    expect(hasPhoto({})).toBe(false);
    expect(hasPhoto({ photoId: 'a'.repeat(64) })).toBe(true);
    expect(hasPhoto({ imageDataUrl: bytesToDataUrl(jpeg()) })).toBe(true);
  });

  it('prepares the original with its dimensions and an optional smaller copy', async () => {
    const bytes = jpeg(1200, 900);
    const prepared = await prepareImage(bytes, {
      createdAt: '2026-10-27T10:00:00.000Z',
      makeThumb: async () => ({ bytes: jpeg(800, 600).buffer, width: 800, height: 600 }),
    });
    expect(prepared.image).toMatchObject({
      id: await imageId(bytes),
      width: 1200,
      height: 900,
      createdAt: '2026-10-27T10:00:00.000Z',
    });
    expect([...new Uint8Array(prepared.image.bytes)]).toEqual([...bytes]);
    expect(prepared.thumb).toMatchObject({ id: prepared.image.id, width: 800, height: 600 });
  });

  it('keeps a photo without a smaller copy when the browser cannot make one', async () => {
    const prepared = await prepareImage(jpeg(), { makeThumb: async () => undefined });
    expect(prepared.thumb).toBeUndefined();
  });

  it('stores each photo once and never replaces an existing copy', async () => {
    database = new Dexie('ImageTest') as Dexie & ImageTables;
    database.version(1).stores({ images: 'id', thumbs: 'id' });
    const first = await prepareImage(jpeg(), {
      createdAt: '2026-10-01T00:00:00.000Z',
      makeThumb: async () => ({ bytes: jpeg(320, 240).buffer, width: 320, height: 240 }),
    });
    const again = await prepareImage(jpeg(), {
      createdAt: '2026-10-27T00:00:00.000Z',
      makeThumb: async () => undefined,
    });
    await database.transaction('rw', database.images, database.thumbs, () =>
      putImages(database!, [first]),
    );
    await database.transaction('rw', database.images, database.thumbs, () =>
      putImages(database!, [again]),
    );
    expect(await database.images.count()).toBe(1);
    expect((await database.images.get(first.image.id))?.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect((await database.thumbs.get(first.image.id))?.width).toBe(320);
  });

  it('moves data-URL photos into the store once and keeps their ids on the copies', async () => {
    const cover = bytesToDataUrl(jpeg(640, 480, 1));
    const step = bytesToDataUrl(jpeg(640, 480, 2));
    const recipe = {
      id: 'soup',
      title: 'Soup',
      ingredients: [],
      instructions: ['Cook.', 'Serve.'],
      imageDataUrl: cover,
      stepDetails: [{ imageDataUrl: step }, { imageDataUrl: cover }],
    };
    const { recipes, images } = await extractPhotos([recipe, { ...recipe, id: 'copy' }], {
      makeThumb: async () => undefined,
    });
    const coverId = await imageId(dataUrlBytes(cover));
    expect(recipes[0]).toMatchObject({
      photoId: coverId,
      stepDetails: [{ photoId: await imageId(dataUrlBytes(step)) }, { photoId: coverId }],
    });
    expect(JSON.stringify(recipes)).not.toContain('data:image');
    expect(images.map((image) => image.image.id).sort()).toEqual(
      [coverId, await imageId(dataUrlBytes(step))].sort(),
    );
    expect(recipe.imageDataUrl).toBe(cover);
  });

  it('leaves recipes without data-URL photos untouched', async () => {
    const recipe = {
      id: 'a',
      title: 'A',
      ingredients: [],
      instructions: [],
      photoId: 'f'.repeat(64),
    };
    const { recipes, images } = await extractPhotos([recipe]);
    expect(recipes[0]).toBe(recipe);
    expect(images).toEqual([]);
  });

  it('turns stored photos back into the same data URLs and drops ids it cannot find', async () => {
    database = new Dexie('ImageTest') as Dexie & ImageTables;
    database.version(1).stores({ images: 'id', thumbs: 'id' });
    const cover = bytesToDataUrl(jpeg(640, 480, 3));
    const { recipes, images } = await extractPhotos<Recipe>(
      [
        {
          id: 'soup',
          title: 'Soup',
          ingredients: [],
          instructions: ['Cook.'],
          imageDataUrl: cover,
          stepDetails: [{ photoId: 'e'.repeat(64) }],
        },
      ],
      { makeThumb: async () => undefined },
    );
    await database.transaction('rw', database.images, database.thumbs, () =>
      putImages(database!, images),
    );
    const inlined = await inlinePhotos(database, recipes[0]!);
    expect(inlined.imageDataUrl).toBe(cover);
    expect(inlined.photoId).toBeUndefined();
    expect(inlined.stepDetails).toEqual([{}]);
    expect(recipes[0]!.photoId).toBeDefined();
  });
});
