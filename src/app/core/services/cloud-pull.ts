import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../models/recipe.model';
import type { RecipeCollection } from '../models/recipe-collection.model';
import { isHttpsUrl, isRecipeImage, readRecipeMetadata } from '../models/recipe-metadata';
import { putImages, type PreparedImage } from '../models/recipe-image';
import { readShoppingItem } from '../models/shopping-item';
import type { AccountDatabase, CookbookTable, CookbookValue } from './account-database';
import { downloadPhotos, type RecipePhotos } from './cloud-photos';

export interface CloudRow {
  id: string;
  payload: unknown;
  photos?: RecipePhotos | null;
  deleted: boolean;
  updated_at?: string;
}
export interface PullContext {
  cache: AccountDatabase;
  client: SupabaseClient;
  userId: string;
  /** False once the account or its cache changed; nothing more may be written then. */
  current: () => boolean;
}
/** `missing` means the shopping table does not exist on this server yet. */
export interface PullOutcome {
  status: 'done' | 'stale' | 'missing';
  /** Rows written to this device; views only need to reload when this is above zero. */
  written: number;
}

export const pullPageSize = 500;
// now() stamps a row with its transaction's start, so a transaction committing late can land
// behind the cursor. Re-reading this overlap catches it; known versions are skipped cheaply.
const cursorOverlap = 60_000;

const columns: Record<CookbookTable, string> = {
  recipes: 'id,payload,photos,deleted',
  collections: 'id,payload,photos,deleted',
  shoppingItems: 'id,payload,deleted',
};

/**
 * Pull the rows of one table that changed on the server since this device last pulled it.
 * Each page commits with its cursor, so an interrupted pull resumes after the last full page.
 * Servers without the updated_at migration get the previous full pull.
 */
export async function pullTable(context: PullContext, table: CookbookTable): Promise<PullOutcome> {
  const tally = { written: 0 };
  let status = await pullChanged(context, table, tally);
  if (status === 'unsupported') status = await pullAll(context, table, tally);
  return { status, written: tally.written };
}

type Tally = { written: number };

async function pullChanged(
  context: PullContext,
  table: CookbookTable,
  tally: Tally,
): Promise<PullOutcome['status'] | 'unsupported'> {
  const { cache, client, userId, current } = context;
  const saved = (await cache.syncState.get(table))?.cursor;
  const since = saved ? new Date(Date.parse(saved.at) - cursorOverlap).toISOString() : undefined;
  let after: { at: string; id: string } | undefined;
  for (;;) {
    if (!current()) return 'stale';
    let query = client
      .from(remoteTable(table))
      .select(columns[table] + ',updated_at')
      .eq('user_id', userId);
    if (after)
      query = query.or(
        `updated_at.gt.${quote(after.at)},and(updated_at.eq.${quote(after.at)},id.gt.${quote(after.id)})`,
      );
    else if (since) query = query.gte('updated_at', since);
    const { data, error } = await query.order('updated_at').order('id').limit(pullPageSize);
    if (error) {
      if (error.code === '42703') return 'unsupported';
      if (table === 'shoppingItems' && missingShoppingTable(error)) return 'missing';
      throw new Error(error.message);
    }
    const page = (data ?? []) as unknown as CloudRow[];
    if (!(await applyPage(context, table, page, tally))) return 'stale';
    const last = page.at(-1);
    if (page.length < pullPageSize || !last?.updated_at) return 'done';
    after = { at: last.updated_at, id: last.id };
  }
}

async function pullAll(
  context: PullContext,
  table: CookbookTable,
  tally: Tally,
): Promise<PullOutcome['status']> {
  const { client, userId, current } = context;
  for (let offset = 0; ; offset += pullPageSize) {
    if (!current()) return 'stale';
    const { data, error } = await client
      .from(remoteTable(table))
      .select(columns[table])
      .eq('user_id', userId)
      .order('id')
      .range(offset, offset + pullPageSize - 1);
    if (error) {
      if (table === 'shoppingItems' && missingShoppingTable(error)) return 'missing';
      throw new Error(error.message);
    }
    const page = (data ?? []) as unknown as CloudRow[];
    if (!(await applyPage(context, table, page, tally))) return 'stale';
    if (page.length < pullPageSize) return 'done';
  }
}

/** Downloads happen first; then the page, its versions and the cursor commit together. */
async function applyPage(
  { cache, client, userId, current }: PullContext,
  table: CookbookTable,
  page: readonly CloudRow[],
  tally: Tally,
): Promise<boolean> {
  const keys = page.map((row) => `${table}:${row.id}`);
  const [pending, known] = await Promise.all([
    cache.outbox.bulkGet(keys),
    cache.remote.bulkGet(keys),
  ]);
  const changes: {
    row: CloudRow;
    key: string;
    value: CookbookValue | null;
    images: PreparedImage[];
  }[] = [];
  for (const [index, row] of page.entries()) {
    if (!current()) return false;
    // A queued local edit wins; a version applied before needs no second write.
    if (pending[index] || (row.updated_at && known[index]?.updatedAt === row.updated_at)) continue;
    let value: CookbookValue | null = null;
    let images: PreparedImage[] = [];
    if (!row.deleted) {
      if (table === 'recipes') {
        ({ recipe: value, images } = await downloadPhotos(
          client,
          userId,
          readCloudRecipe(row.payload),
          row.photos ?? {},
          cache,
          await cache.recipes.get(row.id),
          (await cache.photos.get(row.id))?.paths,
        ));
      } else if (table === 'shoppingItems') {
        value = readShoppingItem(row.payload);
        if (value.id !== row.id) throw new Error('Invalid cloud shopping item ID.');
      } else value = readCloudCollection(row.payload);
    }
    changes.push({ row, key: keys[index]!, value, images });
  }
  if (!current()) return false;
  const last = page.at(-1);
  let written = 0;
  await cache.transaction(
    'rw',
    [
      cache.table(table),
      cache.outbox,
      cache.photos,
      cache.images,
      cache.thumbs,
      cache.remote,
      cache.syncState,
    ],
    async () => {
      for (const { row, key, value, images } of changes) {
        if (!current()) throw new Error('Account changed. Try again.');
        // Edited while the page downloaded: the local change stays and uploads later.
        if (await cache.outbox.get(key)) continue;
        // A row this device already holds, such as its own upload read back, changes nothing.
        const local: unknown = await cache.table(table).get(row.id);
        if (value ? canonicalRecord(local) !== canonicalRecord(value) : local !== undefined) {
          await putImages(cache, images);
          if (value) await cache.table(table).put(value);
          else await cache.table(table).delete(row.id);
          written++;
        }
        if (table === 'recipes') await cache.photos.put({ id: row.id, paths: row.photos ?? {} });
        if (row.updated_at) await cache.remote.put({ key, updatedAt: row.updated_at });
      }
      if (last?.updated_at)
        await cache.syncState.put({ table, cursor: { at: last.updated_at, id: last.id } });
    },
  );
  tally.written += written;
  return true;
}

/** JSON with sorted keys, so records that differ only in key order compare equal. */
export function canonicalRecord(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  });
}

/** A PostgREST logic-tree value; quoting keeps commas, dots and parentheses in ids literal. */
function quote(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function remoteTable(table: CookbookTable): string {
  return table === 'shoppingItems' ? 'shopping_items' : table;
}

export function missingShoppingTable(error: { code?: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01';
}

export function readCloudRecipe(value: unknown): Recipe {
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud recipe.');
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['title'] !== 'string' ||
    !Array.isArray(raw['ingredients']) ||
    !raw['ingredients'].every((v) => typeof v === 'string') ||
    !Array.isArray(raw['instructions']) ||
    !raw['instructions'].every((v) => typeof v === 'string')
  )
    throw new Error('Invalid cloud recipe.');
  const recipe: Recipe = {
    ...readRecipeMetadata(value, true),
    id: raw['id'],
    title: raw['title'],
    ingredients: raw['ingredients'],
    instructions: raw['instructions'],
  };
  if (typeof raw['servings'] === 'number') recipe.servings = raw['servings'];
  if (raw['imageDataUrl'] != null) {
    if (!isRecipeImage(raw['imageDataUrl'])) throw new Error('Invalid recipe photo.');
    recipe.imageDataUrl = raw['imageDataUrl'];
  }
  if (raw['sourceUrl'] != null) {
    if (!isHttpsUrl(raw['sourceUrl'])) throw new Error('Invalid recipe link.');
    recipe.sourceUrl = raw['sourceUrl'];
  }
  for (const field of ['notes', 'createdAt', 'updatedAt'] as const)
    if (typeof raw[field] === 'string') recipe[field] = raw[field];
  for (const field of ['collectionIds'] as const)
    if (Array.isArray(raw[field]) && raw[field].every((v) => typeof v === 'string'))
      recipe[field] = raw[field];
  return recipe;
}

export function readCloudCollection(value: unknown): RecipeCollection {
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud collection.');
  const raw = value as Record<string, unknown>;
  if (
    typeof raw['id'] !== 'string' ||
    typeof raw['name'] !== 'string' ||
    typeof raw['sortOrder'] !== 'number'
  )
    throw new Error('Invalid cloud collection.');
  return { id: raw['id'], name: raw['name'], sortOrder: raw['sortOrder'] };
}
