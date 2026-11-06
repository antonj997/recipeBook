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

  it('finds people by username and shares with one by id', async () => {
    const { sharing, rpc } = setup({
      rpc: (name) =>
        name === 'search_usernames'
          ? { data: [{ user_id: owner, username: 'anna' }], error: null }
          : name === 'share_recipe_with'
            ? { data: 'shared', error: null }
            : { data: [], error: null },
    });
    expect(await sharing.searchPeople(' @An ')).toEqual([{ id: owner, username: 'anna' }]);
    expect(rpc).toHaveBeenCalledWith('search_usernames', { query: 'an' });
    expect(await sharing.searchPeople('  ')).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await sharing.shareWith('soup', owner)).toBe('shared');
    expect(rpc).toHaveBeenCalledWith('share_recipe_with', { recipe_id: 'soup', recipient: owner });
  });

  it('names recipients by their current username, else by what the owner typed', async () => {
    const { sharing } = setup({
      rpc: () => ({
        data: [
          { recipient_id: 'a', label: '@anna', username: 'anna.b' },
          { recipient_id: 'b', label: 'bo@example.com', username: null },
        ],
        error: null,
      }),
    });
    expect(await sharing.recipients('soup')).toEqual([
      { id: 'a', name: '@anna.b' },
      { id: 'b', name: 'bo@example.com' },
    ]);
  });

  it('keeps track of which of your recipes are shared', async () => {
    let rows = [{ recipe_id: 'soup', visibility: 'public', recipients: 0 }];
    const { sharing } = setup({
      rpc: (name) =>
        name === 'my_shared_recipes' ? { data: rows, error: null } : { data: [], error: null },
    });
    await sharing.refreshShared();
    expect(sharing.isShared('soup')).toBe(true);
    expect(sharing.isShared('bread')).toBe(false);
    expect(sharing.shared().get('soup')).toEqual({ visibility: 'public', recipients: 0 });
    rows = [];
    await sharing.refreshShared();
    expect(sharing.isShared('soup')).toBe(false);
  });

  it('stops sharing completely and can put it back', async () => {
    const calls: string[] = [];
    const { sharing, rpc } = setup({
      rpc: (name) =>
        name === 'recipe_people'
          ? { data: [{ recipient_id: 'a', label: '@anna', username: 'anna' }], error: null }
          : { data: name === 'share_recipe_with' ? 'shared' : [], error: null },
      table: (table, steps) => {
        calls.push(table + ':' + steps.map((step) => step[0]).join('.'));
        if (steps.some((step) => step[0] === 'maybeSingle'))
          return { data: { visibility: 'public' }, error: null };
        return { data: [{ id: 'soup' }], error: null };
      },
    });
    const before = await sharing.stopSharing('soup');
    expect(before).toEqual({ visibility: 'public', recipients: ['a'] });
    expect(calls).toContain('recipes:update.eq.eq.select');
    expect(calls).toContain('recipe_shares:delete.eq.eq');
    await sharing.restoreSharing('soup', before);
    expect(rpc).toHaveBeenCalledWith('share_recipe_with', { recipe_id: 'soup', recipient: 'a' });
  });

  it('leaves your own recipes out of the public list, which shows them under You share', async () => {
    const page = (ids: string[], by: string) =>
      ids.map((id, i) => ({
        ...row,
        owner_id: by,
        recipe_id: id,
        updated_at: `2026-11-0${9 - i}T00:00:00Z`,
      }));
    const answers = [
      // A full page of only your own recipes is skipped rather than shown as empty.
      Array.from({ length: 24 }, (_, i) => ({ ...page(['x'], me)[0], recipe_id: 'mine' + i })),
      [...page(['a'], owner), ...page(['b'], me), ...page(['c'], owner)],
    ];
    const { sharing, rpc } = setup({ rpc: () => ({ data: answers.shift() ?? [], error: null }) });
    const result = await sharing.discover('');
    expect(result.items.map((item) => item.id)).toEqual(['a', 'c']);
    expect(result.next).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ after_owner: me, after_id: 'mine23' });
  });
});
