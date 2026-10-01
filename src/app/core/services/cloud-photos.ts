import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../models/recipe.model';
import { isRecipeImage } from '../models/recipe-metadata';

export interface RecipePhotos {
  cover?: string;
  steps?: Record<string, string>;
}
const bucket = 'recipe-photos';

// Store files in private Storage, keeping the existing recipe and backup image format.
export async function uploadPhotos(client: SupabaseClient, userId: string, recipe: Recipe) {
  const photos: RecipePhotos = {};
  const payload = structuredClone(recipe);
  async function upload(data: string): Promise<string> {
    // Data URLs are local bytes, not network requests. Fetching one is blocked by our CSP.
    if (!isRecipeImage(data)) throw new Error('Invalid recipe photo.');
    const encoded = data.slice(data.indexOf(',') + 1);
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const name = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    const path = `${userId}/${name}.jpg`;
    const { error } = await client.storage.from(bucket).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) throw new Error('Could not upload a recipe photo. ' + error.message);
    return path;
  }
  if (payload.imageDataUrl) {
    photos.cover = await upload(payload.imageDataUrl);
    delete payload.imageDataUrl;
  }
  for (const [i, step] of (payload.stepDetails ?? []).entries()) {
    if (!step.imageDataUrl) continue;
    (photos.steps ??= {})[String(i)] = await upload(step.imageDataUrl);
    delete step.imageDataUrl;
  }
  return { payload, photos };
}

export async function downloadPhotos(
  client: SupabaseClient,
  userId: string,
  recipe: Recipe,
  photos: RecipePhotos,
  cached?: Recipe,
  previous: RecipePhotos = {},
): Promise<Recipe> {
  const result = structuredClone(recipe);
  async function download(path: string): Promise<string> {
    if (!path.startsWith(userId + '/')) throw new Error('Invalid recipe photo path.');
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) throw new Error('Could not download a recipe photo.');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read a recipe photo.'));
      reader.readAsDataURL(data);
    });
  }
  if (photos.cover)
    result.imageDataUrl =
      previous.cover === photos.cover && cached?.imageDataUrl
        ? cached.imageDataUrl
        : await download(photos.cover);
  for (const [index, path] of Object.entries(photos.steps ?? {})) {
    const step = result.stepDetails?.[Number(index)];
    const cachedPhoto = cached?.stepDetails?.[Number(index)]?.imageDataUrl;
    if (step)
      step.imageDataUrl =
        previous.steps?.[index] === path && cachedPhoto ? cachedPhoto : await download(path);
  }
  return result;
}
