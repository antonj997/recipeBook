import { inject, Service, signal } from '@angular/core';
import { bytesToDataUrl, type PhotoRef } from '../models/recipe-image';
import type { Recipe } from '../models/recipe.model';
import { CloudCookbookService } from './cloud-cookbook.service';

export type PhotoVariant = 'thumb' | 'full';

/**
 * Object URLs for stored photos. Resolvers prepare them before a page is captured, so templates
 * can read them synchronously; records that still carry a data URL show it directly.
 */
@Service()
export class RecipeImagesService {
  private readonly cloud = inject(CloudCookbookService);
  private readonly urls = new Map<string, string>();
  private readonly loading = new Map<string, Promise<void>>();
  private generation = 0;
  /** Changes whenever URLs appear or are revoked; `peek` reads it so views re-render. */
  readonly version = signal(0);

  peek(ref: PhotoRef | undefined, variant: PhotoVariant): string | undefined {
    this.version();
    if (!ref) return undefined;
    if (ref.photoId) return this.urls.get(variant + ':' + ref.photoId);
    return ref.imageDataUrl || undefined;
  }

  async prepare(refs: readonly (PhotoRef | undefined)[], variant: PhotoVariant): Promise<void> {
    const generation = this.generation;
    const database = this.cloud.database;
    const ids = [...new Set(refs.map((ref) => ref?.photoId).filter((id): id is string => !!id))];
    const waiting = ids.flatMap((id) => this.loading.get(variant + ':' + id) ?? []);
    const missing = ids.filter(
      (id) => !this.urls.has(variant + ':' + id) && !this.loading.has(variant + ':' + id),
    );
    if (missing.length) {
      const load = (async () => {
        let rows = variant === 'thumb' ? await database.thumbs.bulkGet(missing) : [];
        const originals = missing.filter((_, index) => !rows[index]);
        const full = originals.length ? await database.images.bulkGet(originals) : [];
        rows = missing.map((id, index) => rows[index] ?? full[originals.indexOf(id)]);
        if (generation !== this.generation) return;
        rows.forEach((row, index) => {
          if (!row) return;
          const blob = new Blob([row.bytes], { type: 'image/jpeg' });
          this.urls.set(variant + ':' + missing[index], URL.createObjectURL(blob));
        });
        this.version.update((value) => value + 1);
      })();
      const settled = load.finally(() => {
        for (const id of missing)
          if (this.loading.get(variant + ':' + id) === settled)
            this.loading.delete(variant + ':' + id);
      });
      for (const id of missing) this.loading.set(variant + ':' + id, settled);
      waiting.push(settled);
    }
    await Promise.all(waiting);
  }

  async url(ref: PhotoRef | undefined, variant: PhotoVariant): Promise<string | undefined> {
    await this.prepare([ref], variant);
    return this.peek(ref, variant);
  }

  /** The editor keeps working with data URLs; saving turns them back into the same photo id. */
  async dataUrl(ref: PhotoRef | undefined): Promise<string | undefined> {
    if (!ref?.photoId) return ref?.imageDataUrl || undefined;
    const row = await this.cloud.database.images.get(ref.photoId);
    return row ? bytesToDataUrl(row.bytes) : undefined;
  }

  /** A copy whose stored photos are data URLs again, for the editor; a missing photo keeps its id. */
  async withPhotoData(recipe: Recipe): Promise<Recipe> {
    const copy = structuredClone(recipe);
    const inline = async (ref: PhotoRef) => {
      const data = await this.dataUrl(ref);
      if (!ref.photoId || !data) return;
      ref.imageDataUrl = data;
      delete ref.photoId;
    };
    await Promise.all([inline(copy), ...(copy.stepDetails ?? []).map(inline)]);
    return copy;
  }

  clear(): void {
    this.generation++;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.loading.clear();
    this.version.update((value) => value + 1);
  }
}
