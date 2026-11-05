import { effect, inject, Service, signal } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../models/recipe.model';
import { isRecipeImage } from '../models/recipe-metadata';
import { msg } from '../i18n/i18n';
import { runtimeConfig } from '../runtime-config';
import { readCloudRecipe } from './cloud-pull';
import { RecipeService } from './recipe.service';
import { SupabaseService } from './supabase.service';

export type RecipeVisibility = 'private' | 'public';
export type ShareOutcome = 'shared' | 'not_found' | 'self' | 'limited';
export interface SharedState {
  visibility: RecipeVisibility;
  recipients: number;
}
export interface Person {
  id: string;
  username: string;
}
export interface Recipient {
  id: string;
  /** @username when the account has one now, else what the owner typed. */
  name: string;
}
export interface DiscoverCursor {
  at: string;
  owner: string;
  id: string;
}
export interface SharedRecipe {
  owner: string;
  id: string;
  /** Validated content under `sharedRecipeKey`, so cooking progress never mixes with your own. */
  recipe: Recipe;
  author: string | null;
  /** Storage path of the cover; lists load it on demand with `photo()`. */
  cover?: string;
  visibility?: RecipeVisibility;
  /** Known only to the owner and admins. */
  hidden?: boolean;
  missingPhotos: number;
  sharedAt?: string;
}
interface SharedRow {
  owner_id: string;
  recipe_id: string;
  payload: unknown;
  photos: { cover?: unknown; steps?: Record<string, unknown> } | null;
  username: string | null;
  visibility?: RecipeVisibility;
  hidden?: boolean | null;
  updated_at?: string;
  shared_at?: string;
}

export const usernamePattern = /^[a-z0-9._]{3,24}$/;
export const discoverPageSize = 24;
const bucket = 'recipe-photos';
const offline = msg('You are offline. Try again when you have a connection.');

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}
export function sharedRecipeKey(owner: string, id: string): string {
  return 'shared:' + owner + ':' + id;
}
export function parseSharedKey(key: string): { owner: string; id: string } | null {
  const match = /^shared:([0-9a-f-]{36}):(.+)$/.exec(key);
  return match ? { owner: match[1], id: match[2] } : null;
}

/** The only code that talks to the sharing functions; see SUPABASE.md, Recipe sharing. */
@Service()
export class SharingService {
  private readonly supabase = inject(SupabaseService);
  private readonly recipes = inject(RecipeService);
  private readonly name = signal<string | null | undefined>(undefined);
  /** The signed-in account's username: undefined until loaded, null when it has none. */
  readonly username = this.name.asReadonly();
  private readonly sharedMap = signal<ReadonlyMap<string, SharedState>>(new Map());
  /** Your recipes that are public or shared with someone, refreshed after every change. */
  readonly shared = this.sharedMap.asReadonly();

  constructor() {
    effect(() => {
      this.supabase.accountVersion();
      this.name.set(undefined);
      this.sharedMap.set(new Map());
    });
  }

  isShared(recipeId: string): boolean {
    return this.sharedMap().has(recipeId);
  }

  async refreshShared(): Promise<void> {
    if (!this.supabase.user()) return this.sharedMap.set(new Map());
    const { data } = await this.call((client) => client.rpc('my_shared_recipes'));
    const rows =
      (data as { recipe_id: string; visibility: RecipeVisibility; recipients: number }[]) ?? [];
    this.sharedMap.set(
      new Map(
        rows.map((row) => [
          row.recipe_id,
          { visibility: row.visibility, recipients: Number(row.recipients) },
        ]),
      ),
    );
  }

  async searchPeople(query: string): Promise<Person[]> {
    const cleaned = normalizeUsername(query);
    if (!cleaned) return [];
    this.signedIn();
    const { data } = await this.call((client) =>
      client.rpc('search_usernames', { query: cleaned }),
    );
    return ((data as { user_id: string; username: string }[] | null) ?? []).map((row) => ({
      id: row.user_id,
      username: row.username,
    }));
  }

  async shareWith(recipeId: string, recipientId: string): Promise<ShareOutcome> {
    this.signedIn();
    const { data } = await this.call((client) =>
      client.rpc('share_recipe_with', { recipe_id: recipeId, recipient: recipientId }),
    );
    void this.refreshShared().catch(() => undefined);
    return data as ShareOutcome;
  }

  /** Makes the recipe private and removes everyone; the answer can put it all back. */
  async stopSharing(
    recipeId: string,
  ): Promise<{ visibility: RecipeVisibility; recipients: string[] }> {
    const user = this.signedIn();
    const [visibility, people] = await Promise.all([
      this.visibility(recipeId),
      this.recipients(recipeId),
    ]);
    await this.setVisibility(recipeId, 'private');
    await this.call(async (client) =>
      client.from('recipe_shares').delete().eq('owner_id', user.id).eq('recipe_id', recipeId),
    );
    void this.refreshShared().catch(() => undefined);
    return { visibility: visibility ?? 'private', recipients: people.map((person) => person.id) };
  }

  async restoreSharing(
    recipeId: string,
    before: { visibility: RecipeVisibility; recipients: string[] },
  ): Promise<void> {
    if (before.visibility === 'public') await this.setVisibility(recipeId, 'public');
    for (const id of before.recipients) await this.shareWith(recipeId, id);
    void this.refreshShared().catch(() => undefined);
  }

  async loadProfile(): Promise<void> {
    const user = this.supabase.user();
    if (!user) return this.name.set(null);
    const { data } = await this.call(async (client) =>
      client.from('profiles').select('username').eq('user_id', user.id).maybeSingle(),
    );
    this.name.set((data as { username?: string } | null)?.username ?? null);
  }

  async isUsernameAvailable(name: string): Promise<boolean> {
    const { data } = await this.call((client) => client.rpc('username_available', { name }));
    return data === true;
  }

  async setUsername(name: string | null): Promise<'saved' | 'taken'> {
    const user = this.signedIn();
    const { error } = await this.call(
      async (client) =>
        name
          ? client
              .from('profiles')
              .upsert({ user_id: user.id, username: name }, { onConflict: 'user_id' })
          : client.from('profiles').delete().eq('user_id', user.id),
      ['23505'],
    );
    if (error?.code === '23505') return 'taken';
    this.name.set(name);
    return 'saved';
  }

  /** Null while the recipe has not reached the cloud yet, so it cannot be shared. */
  async visibility(recipeId: string): Promise<RecipeVisibility | null> {
    const user = this.signedIn();
    const { data } = await this.call(async (client) =>
      client
        .from('recipes')
        .select('visibility')
        .eq('user_id', user.id)
        .eq('id', recipeId)
        .eq('deleted', false)
        .maybeSingle(),
    );
    return (data as { visibility?: RecipeVisibility } | null)?.visibility ?? null;
  }

  async setVisibility(recipeId: string, visibility: RecipeVisibility): Promise<void> {
    const user = this.signedIn();
    const { data } = await this.call(async (client) =>
      client
        .from('recipes')
        .update({ visibility })
        .eq('user_id', user.id)
        .eq('id', recipeId)
        .select('id'),
    );
    if (!(data as unknown[] | null)?.length)
      throw new Error(msg('This recipe hasn’t synced yet. Try again in a moment.'));
    void this.refreshShared().catch(() => undefined);
  }

  async share(recipeId: string, recipient: string): Promise<ShareOutcome> {
    this.signedIn();
    const { data } = await this.call((client) =>
      client.rpc('share_recipe', { recipe_id: recipeId, recipient }),
    );
    void this.refreshShared().catch(() => undefined);
    return data as ShareOutcome;
  }

  async unshare(recipeId: string, recipientId: string): Promise<void> {
    const user = this.signedIn();
    await this.call(async (client) =>
      client
        .from('recipe_shares')
        .delete()
        .eq('owner_id', user.id)
        .eq('recipe_id', recipeId)
        .eq('recipient_id', recipientId),
    );
    void this.refreshShared().catch(() => undefined);
  }

  async recipients(recipeId: string): Promise<Recipient[]> {
    this.signedIn();
    const { data } = await this.call((client) =>
      client.rpc('recipe_recipients', { recipe_id: recipeId }),
    );
    type Row = { recipient_id: string; label: string; username: string | null };
    return ((data as Row[] | null) ?? []).map((row) => ({
      id: row.recipient_id,
      name: row.username ? '@' + row.username : row.label,
    }));
  }

  async sharedWithMe(): Promise<SharedRecipe[]> {
    if (!this.supabase.user()) return [];
    const { data } = await this.call((client) => client.rpc('shared_with_me'));
    return this.readRows(data);
  }

  async discover(
    query: string,
    after?: DiscoverCursor,
  ): Promise<{ items: SharedRecipe[]; next?: DiscoverCursor }> {
    const { data } = await this.call((client) =>
      client.rpc('discover_recipes', {
        query: query.trim(),
        after_at: after?.at ?? null,
        after_owner: after?.owner ?? null,
        after_id: after?.id ?? null,
      }),
    );
    const rows = (data as SharedRow[] | null) ?? [];
    const last = rows.at(-1);
    return {
      items: this.readRows(rows),
      next:
        rows.length === discoverPageSize && last?.updated_at
          ? { at: last.updated_at, owner: last.owner_id, id: last.recipe_id }
          : undefined,
    };
  }

  async open(owner: string, id: string): Promise<SharedRecipe | null> {
    const { data } = await this.call((client) =>
      client.rpc('shared_recipe', { owner, recipe_id: id }),
    );
    const row = (data as SharedRow[] | null)?.[0];
    const shared = row && this.readRows([row])[0];
    if (!row || !shared) return null;
    const client = this.supabase.client!;
    const paths = row.photos ?? {};
    let missing = 0;
    const load = async (path: unknown): Promise<string | undefined> => {
      const photo = typeof path === 'string' ? await this.download(client, owner, path) : undefined;
      if (!photo) missing++;
      return photo;
    };
    if (paths.cover != null) shared.recipe.imageDataUrl = await load(paths.cover);
    for (const [index, path] of Object.entries(paths.steps ?? {})) {
      const step = shared.recipe.stepDetails?.[Number(index)];
      if (step) step.imageDataUrl = await load(path);
    }
    return {
      ...shared,
      visibility: row.visibility,
      hidden: row.hidden ?? undefined,
      missingPhotos: missing,
    };
  }

  /** A list card's cover, read on demand. */
  async photo(owner: string, path: string): Promise<string | undefined> {
    await this.supabase.initialize();
    const client = this.supabase.client;
    return client ? this.download(client, owner, path) : undefined;
  }

  async isAdmin(): Promise<boolean> {
    if (!this.supabase.user()) return false;
    const { data } = await this.call((client) => client.rpc('is_admin'));
    return data === true;
  }

  async setHidden(owner: string, id: string, hidden: boolean): Promise<void> {
    this.signedIn();
    await this.call((client) => client.rpc('set_recipe_hidden', { owner, recipe_id: id, hidden }));
  }

  /** Your own copy: same cooking content and photos, a new id, none of the owner's categories. */
  saveCopy(shared: SharedRecipe): Promise<Recipe> {
    const {
      id: _id,
      collectionIds: _collections,
      photoId: _photo,
      ...content
    } = structuredClone(shared.recipe);
    for (const step of content.stepDetails ?? []) delete step.photoId;
    return this.recipes.addRecipe(content);
  }

  /** The page's address, in the router's own form (GitHub Pages routes after a #). */
  link(owner: string, id: string): string {
    const path = 'shared/' + owner + '/' + encodeURIComponent(id);
    return new URL(runtimeConfig.pages ? '#/' + path : path, document.baseURI).href;
  }

  private readRows(data: unknown): SharedRecipe[] {
    const items: SharedRecipe[] = [];
    for (const row of (data as SharedRow[] | null) ?? []) {
      try {
        const recipe = readCloudRecipe(row.payload);
        recipe.id = sharedRecipeKey(row.owner_id, row.recipe_id);
        delete recipe.collectionIds;
        delete recipe.photoId;
        delete recipe.imageDataUrl;
        for (const step of recipe.stepDetails ?? []) {
          delete step.photoId;
          delete step.imageDataUrl;
        }
        const cover = row.photos?.cover;
        items.push({
          owner: row.owner_id,
          id: row.recipe_id,
          recipe,
          author: row.username,
          cover: typeof cover === 'string' ? cover : undefined,
          missingPhotos: 0,
          sharedAt: row.shared_at,
        });
      } catch {
        /* Someone else's malformed recipe is left out rather than breaking the list. */
      }
    }
    return items;
  }

  private async download(client: SupabaseClient, owner: string, path: string) {
    if (!path.startsWith(owner + '/')) return undefined;
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) return undefined;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([data], { type: 'image/jpeg' }));
    }).catch(() => '');
    return isRecipeImage(url) ? url : undefined;
  }

  private signedIn() {
    const user = this.supabase.user();
    if (!user) throw new Error(msg('Sign in to share recipes.'));
    return user;
  }

  /** One request: offline and account changes become plain messages, other errors throw. */
  private async call<
    T extends { data?: unknown; error?: { code?: string; message: string } | null },
  >(request: (client: SupabaseClient) => PromiseLike<T>, allowed: string[] = []): Promise<T> {
    if (navigator.onLine === false) throw new Error(offline);
    await this.supabase.initialize();
    const client = this.supabase.client;
    if (!client) throw new Error(msg('Sharing is unavailable right now.'));
    const version = this.supabase.accountVersion();
    let result: T;
    try {
      result = await request(client);
    } catch {
      throw new Error(offline);
    }
    if (version !== this.supabase.accountVersion())
      throw new Error(msg('Account changed. Try again.'));
    const error = result.error;
    if (error && !allowed.includes(error.code ?? '')) {
      if (/fetch|network/i.test(error.message)) throw new Error(offline);
      throw new Error(msg('Something went wrong. Try again.'));
    }
    return result;
  }
}
