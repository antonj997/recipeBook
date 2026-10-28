import { DestroyRef, effect, inject, Injector, Service } from '@angular/core';
import type Dexie from 'dexie';
import {
  createThumb,
  extractPhotos,
  photoRefs,
  putImages,
  thumbMaxSize,
  type prepareImage,
} from '../models/recipe-image';
import type { CookbookDatabase } from './account-database';
import { CloudCookbookService } from './cloud-cookbook.service';

type MakeThumb = NonNullable<NonNullable<Parameters<typeof prepareImage>[1]>['makeThumb']>;
export interface ImageMigrationOptions {
  batchSize?: number;
  makeThumb?: MakeThumb;
}
const doneKey = 'recipebook:image-store-v1:';
const startDelay = 4000;

/**
 * Moves photos that older versions saved inline as data URLs into the image store, a few
 * recipes at a time after startup. Only this device's representation changes: cloud rows and
 * storage paths stay the same, so nothing is queued for sync.
 */
@Service()
export class ImageMigrationService {
  private readonly cloud = inject(CloudCookbookService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** Starts once the app has settled, and again for each account; switching cancels a run. */
  start(): void {
    let controller: AbortController | undefined;
    effect(
      () => {
        this.cloud.auth.accountVersion();
        controller?.abort();
        const current = (controller = new AbortController());
        const timer = setTimeout(
          () => void this.run(this.cloud.database, current.signal).catch(() => undefined),
          startDelay,
        );
        current.signal.addEventListener('abort', () => clearTimeout(timer));
      },
      { injector: this.injector },
    );
    this.destroyRef.onDestroy(() => controller?.abort());
  }

  /** Returns how many recipes moved their photos; a finished database is not scanned again. */
  async run(
    database: CookbookDatabase,
    signal: AbortSignal,
    options: ImageMigrationOptions = {},
  ): Promise<number> {
    const key = doneKey + database.name;
    if (read(key)) return 0;
    const ids = await database.recipes
      .filter((recipe) => photoRefs(recipe).some((ref) => !!ref.imageDataUrl))
      .primaryKeys();
    const size = options.batchSize ?? 3;
    let moved = 0;
    let skipped = false;
    for (let start = 0; start < ids.length && !signal.aborted; start += size) {
      const originals = (await database.recipes.bulkGet(ids.slice(start, start + size))).filter(
        (recipe) => !!recipe,
      );
      // Hashing and scaling happen outside the transaction; Web Crypto must not suspend it.
      const { recipes, images } = await extractPhotos(originals, { makeThumb: options.makeThumb });
      if (signal.aborted) break;
      const transactions: Dexie = database;
      moved += await transactions.transaction(
        'rw',
        database.recipes,
        database.images,
        database.thumbs,
        async () => {
          let count = 0;
          for (const [index, original] of originals.entries()) {
            const now = await database.recipes.get(original.id);
            // A recipe edited meanwhile was saved through the store already; keep that version.
            if (!now || JSON.stringify(now) !== JSON.stringify(original)) {
              skipped = true;
              continue;
            }
            if (signal.aborted) throw new Error('Account changed.');
            const used = new Set(photoRefs(recipes[index]!).flatMap((ref) => ref.photoId ?? []));
            await putImages(
              database,
              images.filter((image) => used.has(image.image.id)),
            );
            await database.recipes.put(recipes[index]!);
            count++;
          }
          return count;
        },
      );
    }
    if (!signal.aborted) await this.backfillThumbs(database, signal, options.makeThumb);
    if (signal.aborted) return moved;
    if (moved) this.cloud.revision.update((value) => value + 1);
    if (!skipped) write(key);
    return moved;
  }

  /** Large photos stored while the browser could not scale them get their smaller copy. */
  private async backfillThumbs(
    database: CookbookDatabase,
    signal: AbortSignal,
    makeThumb: MakeThumb = createThumb,
  ): Promise<void> {
    const [imageIds, thumbIds] = await Promise.all([
      database.images.toCollection().primaryKeys(),
      database.thumbs.toCollection().primaryKeys(),
    ]);
    const present = new Set(thumbIds);
    for (const id of imageIds) {
      if (signal.aborted) return;
      if (present.has(id)) continue;
      const image = await database.images.get(id);
      if (!image || Math.max(image.width, image.height) <= thumbMaxSize) continue;
      const thumb = await makeThumb(new Uint8Array(image.bytes));
      if (thumb && !signal.aborted) await database.thumbs.put({ id, ...thumb });
    }
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* The next start scans again; the migration is idempotent. */
  }
}
