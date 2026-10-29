import type { EntityTable } from 'dexie';
import { readRecipePhotoDimensions } from '../services/recipe-photo-header';
import { isRecipeImage } from './recipe-metadata';
import type { Recipe } from './recipe.model';
import { msg } from '../i18n/i18n';

/** A recipe or step photo, stored once per device and named by the SHA-256 of its JPEG bytes. */
export interface StoredImage {
  id: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
  createdAt: string;
}
/** A smaller copy for cards, list rows and pickers; absent when the original is already small. */
export interface StoredThumb {
  id: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}
export interface PreparedImage {
  image: StoredImage;
  thumb?: StoredThumb;
}
export interface ImageTables {
  images: EntityTable<StoredImage, 'id'>;
  thumbs: EntityTable<StoredThumb, 'id'>;
}
/** Saved photos carry `photoId`; drafts, backups and not yet migrated records carry a data URL. */
export interface PhotoRef {
  photoId?: string;
  imageDataUrl?: string;
}
type ThumbData = Omit<StoredThumb, 'id'>;

export const thumbMaxSize = 800;

export function hasPhoto(ref: PhotoRef | undefined): boolean {
  return !!(ref?.photoId || ref?.imageDataUrl);
}

export function isImageId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export async function imageId(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function dataUrlBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  if (!isRecipeImage(dataUrl)) throw new Error(msg('Invalid recipe photo.'));
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToDataUrl(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  // Chunked so large photos never exceed the argument limit of fromCharCode.
  for (let offset = 0; offset < view.length; offset += 0x8000)
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  return 'data:image/jpeg;base64,' + btoa(binary);
}

/** Hashing and scaling are asynchronous, so they run before the transaction that stores them. */
export async function prepareImage(
  bytes: Uint8Array,
  options: {
    createdAt?: string;
    makeThumb?: (bytes: Uint8Array) => Promise<ThumbData | undefined>;
  } = {},
): Promise<PreparedImage> {
  const { width, height } = readRecipePhotoDimensions(bytes, 'image/jpeg');
  const id = await imageId(bytes);
  const copy = bytes.slice().buffer;
  const thumb = await (options.makeThumb ?? createThumb)(bytes);
  return {
    image: {
      id,
      bytes: copy,
      width,
      height,
      createdAt: options.createdAt ?? new Date().toISOString(),
    },
    ...(thumb ? { thumb: { id, ...thumb } } : {}),
  };
}

/** Writes inside the caller's transaction; an existing copy of the same bytes is kept. */
export async function putImages(
  database: ImageTables,
  prepared: readonly PreparedImage[],
): Promise<void> {
  for (const { image, thumb } of prepared) {
    if (!(await database.images.where(':id').equals(image.id).count()))
      await database.images.put(image);
    if (thumb && !(await database.thumbs.where(':id').equals(thumb.id).count()))
      await database.thumbs.put(thumb);
  }
}

/** The cover and each step of a recipe, in order. */
export function photoRefs(recipe: PhotoRef & { stepDetails?: PhotoRef[] }): PhotoRef[] {
  return [recipe, ...(recipe.stepDetails ?? [])];
}

/** Copies whose data-URL photos point at prepared images instead; photo-free recipes are reused. */
export async function extractPhotos<T extends Recipe>(
  recipes: readonly T[],
  options: Parameters<typeof prepareImage>[1] = {},
): Promise<{ recipes: T[]; images: PreparedImage[] }> {
  const images = new Map<string, PreparedImage>();
  const ids = new Map<string, string>();
  const result: T[] = [];
  for (const recipe of recipes) {
    if (!photoRefs(recipe).some((ref) => ref.imageDataUrl)) {
      result.push(recipe);
      continue;
    }
    const copy = structuredClone(recipe);
    for (const ref of photoRefs(copy)) {
      if (!ref.imageDataUrl) continue;
      let id = ids.get(ref.imageDataUrl);
      if (!id) {
        const prepared = await prepareImage(dataUrlBytes(ref.imageDataUrl), options);
        id = prepared.image.id;
        ids.set(ref.imageDataUrl, id);
        if (!images.has(id)) images.set(id, prepared);
      }
      ref.photoId = id;
      delete ref.imageDataUrl;
    }
    result.push(copy);
  }
  return { recipes: result, images: [...images.values()] };
}

/** A copy that carries its photos as data URLs, for backups; ids without bytes are dropped. */
export async function inlinePhotos<T extends Recipe>(database: ImageTables, recipe: T): Promise<T> {
  const copy = structuredClone(recipe);
  for (const ref of photoRefs(copy)) {
    if (!ref.photoId) continue;
    const row = await database.images.get(ref.photoId);
    if (row && !ref.imageDataUrl) ref.imageDataUrl = bytesToDataUrl(row.bytes);
    delete ref.photoId;
  }
  return copy;
}

/** Browser-only; returns nothing when the photo is already small or cannot be decoded. */
export async function createThumb(
  bytes: Uint8Array,
  maxSize = thumbMaxSize,
): Promise<ThumbData | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
    try {
      const scale = maxSize / Math.max(bitmap.width, bitmap.height);
      if (scale >= 1) return undefined;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.72),
      );
      return blob ? { bytes: await blob.arrayBuffer(), width, height } : undefined;
    } finally {
      bitmap.close();
    }
  } catch {
    return undefined;
  }
}
