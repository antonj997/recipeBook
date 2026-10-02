import { Service, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Recipe } from '../models/recipe.model';
import {
  instructionText,
  isHttpsUrl,
  isRecipeImage,
  readRecipeMetadata,
} from '../models/recipe-metadata';
import { RecipeService } from './recipe.service';
import { downloadRecipePhoto } from './recipe-photo';

export type RecipeDraft = Recipe & { imageUrl?: string };
const legacyKey = 'recipebook:review-draft';

// Drafts live in this tab, never in Dexie, until the user approves the preview.
@Service()
export class RecipeDraftService {
  private auth = inject(SupabaseService);
  readonly recipe = signal<RecipeDraft | undefined>(undefined);
  readonly photoNotice = signal('');
  private get storageKey(): string {
    return legacyKey + ':' + this.auth.cacheScope + ':' + (this.auth.user()?.id ?? 'device');
  }
  constructor() {
    let previousKey = this.storageKey;
    effect(() => {
      this.auth.accountVersion();
      const key = this.storageKey;
      if (key === previousKey) return;
      this.recipe.set(undefined);
      this.photoNotice.set('');
      try {
        sessionStorage.removeItem(previousKey);
        sessionStorage.removeItem(key);
      } catch {
        /* In-memory isolation still applies when storage is unavailable. */
      }
      previousKey = key;
    });
  }

  getOrCreate(): RecipeDraft {
    if (!this.recipe()) {
      try {
        const stored =
          sessionStorage.getItem(this.storageKey) ??
          (!this.auth.user()
            ? (sessionStorage.getItem(legacyKey) ??
              sessionStorage.getItem('recipiebook:import-draft'))
            : null);
        if (stored) this.recipe.set(this.parse(JSON.parse(stored)));
      } catch {
        /* An unavailable or invalid temporary copy starts a fresh draft. */
      }
    }
    if (!this.recipe())
      this.set({
        id: crypto.randomUUID(),
        title: '',
        servings: 4,
        ingredients: [],
        instructions: [],
      });
    return this.recipe()!;
  }

  set(recipe: RecipeDraft): void {
    this.recipe.set(recipe);
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(recipe));
    } catch {
      /* Large photos can exceed session storage; the in-memory draft remains usable. */
      try {
        sessionStorage.removeItem(this.storageKey);
        sessionStorage.removeItem(legacyKey);
      } catch {
        /* Storage may also be disabled by the browser. */
      }
    }
  }

  clear(): void {
    this.recipe.set(undefined);
    this.photoNotice.set('');
    try {
      sessionStorage.removeItem(this.storageKey);
      sessionStorage.removeItem(legacyKey);
      sessionStorage.removeItem('recipiebook:import-draft');
    } catch {
      /* Discarding still works when session storage is unavailable. */
    }
  }

  async fromImport(
    value: unknown,
    recipes: RecipeService,
    signal?: AbortSignal,
  ): Promise<RecipeDraft> {
    signal?.throwIfAborted();
    const version = this.auth.accountVersion();
    const draft = this.parse(value);
    const category = (value as Record<string, unknown>)['category'];
    if (this.auth.accountVersion() !== version)
      throw new Error('Account changed. Import the recipe again.');
    draft.collectionIds = recipes.matchCollections(
      typeof category === 'string' ? category : undefined,
      await recipes.getCollections(),
    );
    if (this.auth.accountVersion() !== version)
      throw new Error('Account changed. Import the recipe again.');
    const assertAccount = () => {
      signal?.throwIfAborted();
      if (this.auth.accountVersion() !== version)
        throw new Error('Account changed. Import the recipe again.');
    };
    const proxy = this.auth.configured()
      ? (url: string) => {
          assertAccount();
          return this.auth.invokeImporter({ url, action: 'photo' }, signal);
        }
      : undefined;
    this.photoNotice.set('');
    let failed = 0;
    if (draft.imageUrl && !draft.imageDataUrl) {
      try {
        draft.imageDataUrl = await downloadRecipePhoto(draft.imageUrl, 1200, proxy, signal);
      } catch {
        failed++;
      }
    }
    assertAccount();
    const steps = draft.stepDetails ?? [];
    for (let i = 0; i < steps.length; i += 2) {
      assertAccount();
      await Promise.all(
        steps.slice(i, i + 2).map(async (step) => {
          if (!step.imageUrl || step.imageDataUrl) return;
          try {
            step.imageDataUrl = await downloadRecipePhoto(step.imageUrl, 800, proxy, signal);
          } catch {
            failed++;
          }
        }),
      );
    }
    if (this.auth.accountVersion() !== version)
      throw new Error('Account changed. Import the recipe again.');
    assertAccount();
    if (failed)
      this.photoNotice.set('Some photos could not be saved offline. You can add them in Edit.');
    return draft;
  }

  private parse(value: unknown): RecipeDraft {
    if (!value || typeof value !== 'object') throw new Error('Invalid recipe draft.');
    const raw = value as Record<string, unknown>;
    if (
      typeof raw['title'] !== 'string' ||
      !Array.isArray(raw['ingredients']) ||
      !raw['ingredients'].every((v) => typeof v === 'string') ||
      !Array.isArray(raw['instructions']) ||
      !raw['instructions'].every((v) => typeof v === 'string')
    )
      throw new Error('Incomplete recipe data.');
    const metadata = readRecipeMetadata(value);
    return {
      ...metadata,
      id: typeof raw['id'] === 'string' ? raw['id'] : crypto.randomUUID(),
      title: raw['title'],
      servings:
        typeof raw['servings'] === 'number' &&
        Number.isSafeInteger(raw['servings']) &&
        raw['servings'] > 0
          ? raw['servings']
          : 4,
      ingredients: raw['ingredients'],
      instructions: raw['instructions'].map((step, i) =>
        instructionText(step, metadata.stepDetails?.[i]),
      ),
      imageDataUrl: isRecipeImage(raw['imageDataUrl']) ? raw['imageDataUrl'] : undefined,
      imageUrl: isHttpsUrl(raw['imageUrl']) ? raw['imageUrl'] : undefined,
      sourceUrl: isHttpsUrl(raw['sourceUrl']) ? raw['sourceUrl'] : undefined,
      collectionIds: Array.isArray(raw['collectionIds'])
        ? raw['collectionIds'].filter((v): v is string => typeof v === 'string')
        : undefined,
    };
  }
}
