import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject } from '@angular/core';

interface PreparedPhoto {
  image: HTMLImageElement;
  ready: Promise<boolean>;
}

/** A small decoded-image working set; no persistence, recipe records or network sync. */
@Service()
export class RecipePhotoWarmupService {
  private readonly document = inject(DOCUMENT);
  private readonly photos = new Map<string, PreparedPhoto>();
  // Retain at most three decoded 1200px photos (~17MB). Native in-flight decoding
  // may briefly exceed this; the browser owns its own decoder/GPU memory.
  private readonly capacity = 3;
  private scheduled?: ReturnType<typeof setTimeout>;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  prepare(source: string): Promise<boolean> {
    if (!source) return Promise.resolve(false);
    const cached = this.photos.get(source);
    if (cached) {
      this.photos.delete(source);
      this.photos.set(source, cached);
      return cached.ready;
    }
    const image = this.document.createElement('img');
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = source;
    const entry: PreparedPhoto = { image, ready: Promise.resolve(false) };
    this.photos.set(source, entry);
    while (this.photos.size > this.capacity) this.remove(this.photos.keys().next().value!);
    entry.ready = image
      .decode()
      .then(() => {
        if (this.photos.get(source) !== entry) return false;
        const pixels = image.naturalWidth * image.naturalHeight;
        if (pixels > 0 && pixels <= 1_440_000) return true;
        this.remove(source);
        return false;
      })
      .catch(() => {
        if (this.photos.get(source) === entry) this.remove(source);
        return false;
      });
    return entry.ready;
  }

  warm(source?: string): void {
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    if (source) void this.prepare(source);
  }
  /** Coalesce rapid carousel scrubbing; prepare only the latest resting neighbourhood. */
  schedule(sources: (string | undefined)[]): void {
    clearTimeout(this.scheduled);
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      for (const source of sources) if (source) void this.prepare(source);
    }, 100);
  }
  clear(): void {
    clearTimeout(this.scheduled);
    this.scheduled = undefined;
    for (const source of this.photos.keys()) this.remove(source);
  }
  private remove(source: string): void {
    this.photos.get(source)?.image.removeAttribute('src');
    this.photos.delete(source);
  }
}
