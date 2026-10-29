import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../models/recipe.model';
import {
  dataUrlBytes,
  imageId,
  isImageId,
  prepareImage,
  type ImageTables,
  type PhotoRef,
  type PreparedImage,
} from '../models/recipe-image';
import { msg, t } from '../i18n/i18n';

export interface RecipePhotos {
  cover?: string;
  steps?: Record<string, string>;
}
const bucket = 'recipe-photos';

/**
 * Store files in private Storage, named by the SHA-256 of their bytes. Paths this recipe already
 * synced are reused without uploading, so editing a title never sends a photo again.
 */
export async function uploadPhotos(
  client: SupabaseClient,
  userId: string,
  recipe: Recipe,
  images: ImageTables,
  known: RecipePhotos = {},
) {
  const photos: RecipePhotos = {};
  const payload = structuredClone(recipe);
  const synced = new Set([known.cover, ...Object.values(known.steps ?? {})]);
  async function upload(ref: PhotoRef): Promise<string | undefined> {
    // Data URLs are local bytes, not network requests. Fetching one is blocked by our CSP.
    const bytes = ref.imageDataUrl ? dataUrlBytes(ref.imageDataUrl) : undefined;
    const name = bytes ? await imageId(bytes) : ref.photoId;
    if (!isImageId(name)) return undefined;
    const path = `${userId}/${name}.jpg`;
    if (synced.has(path)) return path;
    const stored = bytes ?? (await images.images.get(name))?.bytes;
    // A stored photo that is gone from this device cannot be uploaded; the recipe still syncs.
    if (!stored) return undefined;
    const blob = new Blob([stored as BlobPart], { type: 'image/jpeg' });
    const { error } = await client.storage.from(bucket).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error)
      throw new Error(t('Could not upload a recipe photo. {reason}', { reason: error.message }));
    synced.add(path);
    return path;
  }
  const cover = await upload(payload);
  if (cover) photos.cover = cover;
  delete payload.photoId;
  delete payload.imageDataUrl;
  for (const [i, step] of (payload.stepDetails ?? []).entries()) {
    const path = await upload(step);
    if (path) (photos.steps ??= {})[String(i)] = path;
    delete step.photoId;
    delete step.imageDataUrl;
  }
  return { payload, photos };
}

/**
 * Point a cloud recipe at photos in the image store. A photo already on this device is never
 * downloaded again; new bytes are returned as prepared images for the caller's transaction.
 */
export async function downloadPhotos(
  client: SupabaseClient,
  userId: string,
  recipe: Recipe,
  photos: RecipePhotos,
  images: ImageTables,
  cached?: Recipe,
  previous: RecipePhotos = {},
): Promise<{ recipe: Recipe; images: PreparedImage[] }> {
  const result = structuredClone(recipe);
  const downloaded = new Map<string, PreparedImage>();
  async function resolve(target: PhotoRef, path: string, prior?: string, cachedRef?: PhotoRef) {
    delete target.photoId;
    delete target.imageDataUrl;
    if (!path.startsWith(userId + '/')) throw new Error(msg('Invalid recipe photo path.'));
    const name = path.slice(userId.length + 1).replace(/\.jpg$/, '');
    if (isImageId(name) && (downloaded.has(name) || (await images.images.get(name)))) {
      target.photoId = name;
      return;
    }
    // Records saved before the image store keep their unchanged photo until migration.
    if (prior === path && cachedRef?.imageDataUrl) {
      target.imageDataUrl = cachedRef.imageDataUrl;
      return;
    }
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) throw new Error(msg('Could not download a recipe photo.'));
    // The id is the hash of the bytes that arrived, whatever the file is called.
    const prepared = await prepareImage(new Uint8Array(await data.arrayBuffer()));
    downloaded.set(prepared.image.id, prepared);
    target.photoId = prepared.image.id;
  }
  if (photos.cover) await resolve(result, photos.cover, previous.cover, cached);
  for (const [index, path] of Object.entries(photos.steps ?? {})) {
    const step = result.stepDetails?.[Number(index)];
    if (step)
      await resolve(step, path, previous.steps?.[index], cached?.stepDetails?.[Number(index)]);
  }
  return { recipe: result, images: [...downloaded.values()] };
}
