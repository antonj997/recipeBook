import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeService } from './recipe.service';
import { SupabaseService } from './supabase.service';
import {
  normalizeUsername,
  parseSharedKey,
  sharedRecipeKey,
  SharingService,
  usernamePattern,
  type SharedRecipe,
} from './sharing.service';

const owner = '11111111-1111-4111-8111-111111111111';
const me = '22222222-2222-4222-8222-222222222222';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]);

type Result = { data?: unknown; error?: { code?: string; message: string } | null };
/** A PostgREST-like builder: every call chains, awaiting it records the chain and answers. */
function chain(answer: (steps: unknown[][]) => Result, log: unknown[][][]) {
  const steps: unknown[][] = [];
  const query: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (resolve: (value: Result) => void) => {
              log.push(steps);
              resolve(answer(steps));
            }
          : (...args: unknown[]) => (steps.push([key, ...args]), query),
    },
  );
  return query;
}

function setup(
  options: {
    rpc?: (name: string, args: Record<string, unknown>) => Result;
    table?: (table: string, steps: unknown[][]) => Result;
    download?: (path: string) => Result;
  } = {},
) {
  const accountVersion = signal(0);
  const tables: unknown[][][] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    return options.rpc?.(name, args) ?? { data: null, error: null };
  });
  const client = {
    rpc,
    from: (table: string) =>
      chain((steps) => options.table?.(table, steps) ?? { data: null, error: null }, tables),
    storage: {
      from: () => ({
        download: async (path: string) =>
          options.download?.(path) ?? {
            data: new Blob([jpeg], { type: 'image/jpeg' }),
            error: null,
          },
      }),
    },
  };
  const addRecipe = vi.fn(async (data: object) => ({ ...data, id: 'copy' }));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          client,
          configured: signal(true),
          user: signal({ id: me, email: 'me@example.com' }),
          accountVersion,
          initialize: async () => undefined,
        },
      },
      { provide: RecipeService, useValue: { addRecipe } },
    ],
  });
  return { sharing: TestBed.inject(SharingService), rpc, tables, addRecipe, accountVersion };
}

const row = {
  owner_id: owner,
  recipe_id: 'soup',
  payload: {
    id: 'soup',
    title: 'Soup',
    servings: 4,
    color: 'mint',
    ingredients: ['1 onion'],
    instructions: ['Chop', 'Boil'],
    stepDetails: [{}, {}],
    collectionIds: ['dinner'],
  },
  photos: { cover: `${owner}/cover.jpg`, steps: { '1': `${owner}/step.jpg` } },
  username: 'anna',
  visibility: 'public',
  hidden: null,
};

describe('sharing', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('normalizes usernames and keys shared recipes apart from your own', () => {
    expect(normalizeUsername('  @Anna.B ')).toBe('anna.b');
    expect(usernamePattern.test('ab')).toBe(false);
    expect(usernamePattern.test('a'.repeat(25))).toBe(false);
    expect(usernamePattern.test('an-na')).toBe(false);
    expect(usernamePattern.test('anna_b.1')).toBe(true);
    expect(sharedRecipeKey(owner, 'soup')).toBe(`shared:${owner}:soup`);
    expect(parseSharedKey(`shared:${owner}:a:b`)).toEqual({ owner, id: 'a:b' });
    expect(parseSharedKey('soup')).toBeNull();
  });

  it('opens a shared recipe with its photos and author, under a key of its own', async () => {
    const { sharing } = setup({ rpc: () => ({ data: [row], error: null }) });
    const shared = (await sharing.open(owner, 'soup'))!;
    expect(shared.recipe.id).toBe(sharedRecipeKey(owner, 'soup'));
    expect(shared.recipe.title).toBe('Soup');
    expect(shared.recipe.collectionIds).toBeUndefined();
    expect(shared.recipe.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(shared.recipe.stepDetails?.[1].imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(shared).toMatchObject({
      owner,
      id: 'soup',
      author: 'anna',
      visibility: 'public',
      missingPhotos: 0,
    });
  });

  it('keeps the recipe and counts a photo that will not download', async () => {
    const { sharing } = setup({
      rpc: () => ({ data: [row], error: null }),
      download: (path) =>
        path.endsWith('step.jpg')
          ? { data: null, error: { message: 'gone' } }
          : { data: new Blob([jpeg], { type: 'image/jpeg' }), error: null },
    });
    const shared = (await sharing.open(owner, 'soup'))!;
    expect(shared.missingPhotos).toBe(1);
    expect(shared.recipe.stepDetails?.[1].imageDataUrl).toBeUndefined();
  });

  it('ignores photo paths outside the owner’s folder', async () => {
    const { sharing } = setup({
      rpc: () => ({ data: [{ ...row, photos: { cover: `${me}/cover.jpg` } }], error: null }),
    });
    const shared = (await sharing.open(owner, 'soup'))!;
    expect(shared.recipe.imageDataUrl).toBeUndefined();
    expect(shared.missingPhotos).toBe(1);
  });

  it('answers null for a recipe that is no longer shared', async () => {
    const { sharing } = setup({ rpc: () => ({ data: [], error: null }) });
    expect(await sharing.open(owner, 'soup')).toBeNull();
  });

  it('saves a copy with a new id, the same cooking content and no categories', async () => {
    const { sharing, addRecipe } = setup({ rpc: () => ({ data: [row], error: null }) });
    const shared = (await sharing.open(owner, 'soup')) as SharedRecipe;
    const copy = await sharing.saveCopy(shared);
    expect(copy.id).toBe('copy');
    const saved = addRecipe.mock.calls[0][0] as Record<string, unknown>;
    expect(saved).not.toHaveProperty('id');
    expect(saved).not.toHaveProperty('collectionIds');
    expect(saved).toMatchObject({
      title: 'Soup',
      servings: 4,
      color: 'mint',
      ingredients: ['1 onion'],
      instructions: ['Chop', 'Boil'],
    });
    expect(saved['imageDataUrl']).toBe(shared.recipe.imageDataUrl);
  });

  it('reports a taken username instead of throwing', async () => {
    const { sharing } = setup({
      table: () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    });
    expect(await sharing.setUsername('anna')).toBe('taken');
  });

  it('shares with what the owner typed and returns the server’s answer', async () => {
    const { sharing, rpc } = setup({ rpc: () => ({ data: 'not_found', error: null }) });
    expect(await sharing.share('soup', ' @Anna ')).toBe('not_found');
    expect(rpc).toHaveBeenCalledWith('share_recipe', { recipe_id: 'soup', recipient: ' @Anna ' });
  });

  it('drops an answer that arrives after the account changed', async () => {
    const setupResult = setup({
      rpc: () => {
        setupResult.accountVersion.update((v) => v + 1);
        return { data: 'shared', error: null };
      },
    });
    await expect(setupResult.sharing.share('soup', 'friend@example.com')).rejects.toThrow(
      'Account changed. Try again.',
    );
  });

  it('builds links from the app’s base address', () => {
    const { sharing } = setup();
    expect(sharing.link(owner, 'soup')).toBe(
      new URL(`shared/${owner}/soup`, document.baseURI).href,
    );
  });
});
