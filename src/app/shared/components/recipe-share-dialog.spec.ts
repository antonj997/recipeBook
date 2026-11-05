import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../../core/models/recipe.model';
import { RecipeActionsService } from '../../core/services/recipe-actions.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { RecipeService } from '../../core/services/recipe.service';
import { SharingService } from '../../core/services/sharing.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { RecipeShareDialogComponent } from './recipe-share-dialog';

const soup: Recipe = { id: 'soup', title: 'Soup', ingredients: [], instructions: [] };
const me = '22222222-2222-4222-8222-222222222222';
type Fn = ReturnType<typeof vi.fn>;

describe('share sheet', () => {
  const user = signal<{ id: string; email: string } | null>({ id: me, email: 'me@example.com' });
  const accountVersion = signal(0);
  const username = signal<string | null | undefined>('me');
  let shared = false;
  let visibility: 'private' | 'public' | null;
  let people: { id: string; name: string }[];
  let sharing: Record<string, Fn | unknown>;
  let added: ('showModal' | 'close')[] = [];

  beforeEach(() => {
    // Other specs leave their own dialog stubs behind; this one opens and closes for real.
    added = (['showModal', 'close'] as const).filter(
      (method) => !HTMLDialogElement.prototype[method],
    );
    for (const method of added)
      Object.defineProperty(HTMLDialogElement.prototype, method, {
        configurable: true,
        value() {},
      });
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.useFakeTimers();
    user.set({ id: me, email: 'me@example.com' });
    accountVersion.set(0);
    username.set('me');
    shared = false;
    visibility = 'private';
    people = [{ id: 'r1', name: '@erik' }];
    sharing = {
      username,
      isShared: () => shared,
      loadProfile: vi.fn(async () => undefined),
      isUsernameAvailable: vi.fn(async () => true),
      setUsername: vi.fn(async (name: string | null) => (username.set(name), 'saved')),
      visibility: vi.fn(async () => visibility),
      setVisibility: vi.fn(async (_: string, value: 'private' | 'public') => {
        visibility = value;
      }),
      recipients: vi.fn(async () => people),
      searchPeople: vi.fn(async () => [
        { id: 'r1', username: 'erik' },
        { id: 'p2', username: 'anna' },
      ]),
      shareWith: vi.fn(async (_: string, id: string) => {
        people = [...people, { id, name: '@anna' }];
        return 'shared';
      }),
      share: vi.fn(async () => 'shared'),
      unshare: vi.fn(async () => undefined),
      link: (owner: string, id: string) => `https://example.com/shared/${owner}/${id}`,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SharingService, useValue: sharing },
        { provide: SupabaseService, useValue: { user, accountVersion } },
        { provide: RecipeService, useValue: { accountVersion } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const method of added) Reflect.deleteProperty(HTMLDialogElement.prototype, method);
    document.body.style.cssText = '';
  });

  async function render() {
    const view = TestBed.createComponent(RecipeShareDialogComponent);
    view.detectChanges();
    const settle = async (ms = 0) => {
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(ms);
      view.detectChanges();
    };
    TestBed.inject(RecipeActionsService).share(soup);
    await settle();
    const root = view.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
      );
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    const type = async (value: string) => {
      const input = root.querySelector<HTMLInputElement>('#share-search')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle(250);
    };
    return { view, root, button, text, type, settle };
  }

  it('sends a signed-out cook to the account settings instead', async () => {
    user.set(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { root } = await render();
    expect(navigate).toHaveBeenCalledWith(['/settings'], { fragment: 'account' });
    expect(root.querySelector('dialog[open]')).toBeNull();
  });

  it('opens as a modal sheet that holds the page still until it closes', async () => {
    people = [];
    const { root, button, settle } = await render();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(document.body.style.position).toBe('fixed');
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Share recipe');
    button('Done')!.click();
    await settle();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(TestBed.inject(RecipeActionsService).sharing()).toBeNull();
  });

  it('is titled Manage sharing for a recipe that is already shared', async () => {
    shared = true;
    const { root } = await render();
    expect(root.querySelector('h2')?.textContent?.trim()).toBe('Manage sharing');
  });

  it('lists the owner and people with access, who can be removed', async () => {
    const { button, text, settle } = await render();
    expect(text()).toContain('@me');
    expect(text()).toContain('Owner');
    expect(text()).toContain('@erik');
    button('Remove @erik')!.click();
    await settle();
    expect(sharing['unshare']).toHaveBeenCalledWith('soup', 'r1');
    expect(text()).not.toContain('@erik');
  });

  it('finds people by username and adds one from the list', async () => {
    const { root, button, text, type } = await render();
    await type('an');
    expect(sharing['searchPeople']).toHaveBeenCalledWith('an');
    const results = [...root.querySelectorAll('#share-results li')].map((li) => li.textContent);
    expect(results.join()).toContain('@anna');
    // Someone who already has the recipe is not offered again.
    expect(results.join()).not.toContain('@erik');
    button('Add @anna')!.click();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    expect(sharing['shareWith']).toHaveBeenCalledWith('soup', 'p2');
    expect(root.querySelector('.share-outcome')?.textContent?.trim()).toBe('Shared with @anna.');
    expect(root.querySelector('#share-results')).toBeNull();
    expect(text()).toContain('@anna');
  });

  it('waits for a pause in typing before searching', async () => {
    const { root, settle } = await render();
    const input = root.querySelector<HTMLInputElement>('#share-search')!;
    for (const value of ['a', 'an', 'ann']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle(100);
    }
    await settle(250);
    expect(sharing['searchPeople']).toHaveBeenCalledTimes(1);
    expect(sharing['searchPeople']).toHaveBeenCalledWith('ann');
  });

  it('shares with an exact email address', async () => {
    const { button, type, root } = await render();
    await type('bo@example.com');
    expect(sharing['searchPeople']).not.toHaveBeenCalled();
    expect(root.querySelector('#share-results')?.textContent).toContain('bo@example.com');
    button('Share')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sharing['share']).toHaveBeenCalledWith('soup', 'bo@example.com');
  });

  it('asks for a username before going public without one', async () => {
    username.set(null);
    const { root, view, button, settle } = await render();
    view.componentInstance.chooseAccess('public');
    await settle();
    expect(sharing['setVisibility']).not.toHaveBeenCalled();
    const input = root.querySelector<HTMLInputElement>('app-username-field input')!;
    input.value = '@Anna';
    input.dispatchEvent(new Event('input'));
    button('Publish')!.click();
    await settle();
    expect(sharing['setUsername']).toHaveBeenCalledWith('anna');
    expect(sharing['setVisibility']).toHaveBeenCalledWith('soup', 'public');
    expect(root.textContent).toContain(
      'Anyone can find it in Discover and read it, even without an account.',
    );
  });

  it('keeps the recipe private when the username was just taken', async () => {
    username.set(null);
    (sharing['setUsername'] as Fn).mockResolvedValue('taken');
    const { root, view, button, settle } = await render();
    view.componentInstance.chooseAccess('public');
    await settle();
    const input = root.querySelector<HTMLInputElement>('app-username-field input')!;
    input.value = 'anna';
    input.dispatchEvent(new Event('input'));
    button('Publish')!.click();
    await settle();
    expect(sharing['setVisibility']).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Taken');
  });

  it('goes public at once with a username, and back to people only', async () => {
    const { view, settle } = await render();
    view.componentInstance.chooseAccess('public');
    await settle();
    expect(sharing['setVisibility']).toHaveBeenCalledWith('soup', 'public');
    view.componentInstance.chooseAccess('private');
    await settle();
    expect(sharing['setVisibility']).toHaveBeenLastCalledWith('soup', 'private');
  });

  it('copies the link where the share sheet is missing', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { button, settle } = await render();
    button('Copy link')!.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(`https://example.com/shared/${me}/soup`);
    expect(TestBed.inject(FeedbackService).message()).toBe('Link copied');
  });

  it('says so when the recipe has not reached the cloud yet', async () => {
    visibility = null;
    const { text, button } = await render();
    expect(text()).toContain('This recipe hasn’t synced yet. Try again in a moment.');
    expect(button('Copy link')).toBeUndefined();
  });

  it('closes on an account change and sends nothing more', async () => {
    const { root, settle } = await render();
    accountVersion.set(1);
    await settle();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(document.body.style.position).toBe('');
    expect(sharing['shareWith']).not.toHaveBeenCalled();
  });
});
