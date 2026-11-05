import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sharedRecipeKey,
  SharingService,
  type SharedRecipe,
} from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { DiscoverComponent } from './discover';

const owner = '11111111-1111-4111-8111-111111111111';
const item = (id: string, author: string | null = 'anna'): SharedRecipe => ({
  owner,
  id,
  author,
  missingPhotos: 0,
  recipe: {
    id: sharedRecipeKey(owner, id),
    title: 'Recipe ' + id,
    ingredients: [],
    instructions: [],
  },
});

describe('discover', () => {
  const user = signal<{ id: string } | null>(null);
  let discover: ReturnType<typeof vi.fn>;
  let sharedWithMe: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    user.set(null);
    discover = vi.fn(async () => ({ items: [item('a'), item('b', null)] }));
    sharedWithMe = vi.fn(async () => [item('s')]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: { user, accountVersion: signal(0) } },
        {
          provide: SharingService,
          useValue: { discover, sharedWithMe, photo: vi.fn(async () => undefined) },
        },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  async function render() {
    const view = TestBed.createComponent(DiscoverComponent);
    view.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    view.detectChanges();
    const root = view.nativeElement as HTMLElement;
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      );
    const settle = async (ms = 0) => {
      await vi.advanceTimersByTimeAsync(ms);
      view.detectChanges();
    };
    return { view, root, text, button, settle };
  }

  it('lists public recipes that link to their shared page with their author', async () => {
    const { root } = await render();
    const rows = [...root.querySelectorAll<HTMLAnchorElement>('#public-recipes a.discover-row')];
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      `/shared/${owner}/a`,
      `/shared/${owner}/b`,
    ]);
    expect(rows[0].textContent).toContain('by @anna');
    expect(rows[1].textContent).toContain('by a Recipebook cook');
    expect(discover).toHaveBeenCalledWith('', undefined);
  });

  it('shows Shared with me only for a signed-in cook with recipes there', async () => {
    let view = await render();
    expect(view.root.querySelector('#shared-with-me')).toBeNull();
    expect(sharedWithMe).not.toHaveBeenCalled();
    view.view.destroy();
    user.set({ id: 'me' });
    view = await render();
    expect(view.root.querySelector('#shared-with-me a.discover-row')?.getAttribute('href')).toBe(
      `/shared/${owner}/s`,
    );
    view.view.destroy();
    sharedWithMe.mockResolvedValue([]);
    view = await render();
    expect(view.root.querySelector('#shared-with-me')).toBeNull();
  });

  it('searches 300 ms after the last keystroke', async () => {
    const { root, settle } = await render();
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'sou';
    input.dispatchEvent(new Event('input'));
    input.value = 'soup';
    input.dispatchEvent(new Event('input'));
    await settle(299);
    expect(discover).toHaveBeenCalledTimes(1);
    await settle(1);
    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenLastCalledWith('soup', undefined);
  });

  it('pages on with Show more', async () => {
    const next = { at: '2026-11-05T10:00:00Z', owner, id: 'b' };
    discover.mockResolvedValueOnce({ items: [item('a'), item('b')], next });
    discover.mockResolvedValueOnce({ items: [item('c')] });
    const { root, button, settle } = await render();
    button('Show more')!.click();
    await settle();
    expect(discover).toHaveBeenLastCalledWith('', next);
    expect(root.querySelectorAll('#public-recipes a.discover-row').length).toBe(3);
    expect(button('Show more')).toBeUndefined();
  });

  it('explains empty results', async () => {
    discover.mockResolvedValue({ items: [] });
    const { root, text, settle } = await render();
    expect(text()).toContain('No public recipes yet.');
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'tofu';
    input.dispatchEvent(new Event('input'));
    await settle(300);
    expect(text()).toContain('No recipes match “tofu”.');
  });

  it('offers to try again after a failure', async () => {
    discover.mockRejectedValueOnce(
      new Error('You are offline. Try again when you have a connection.'),
    );
    const { text, button, settle } = await render();
    expect(text()).toContain('You are offline. Try again when you have a connection.');
    button('Try again')!.click();
    await settle();
    expect(text()).toContain('Recipe a');
  });
});
