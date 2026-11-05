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

describe('share dialog', () => {
  const user = signal<{ id: string; email: string } | null>({ id: me, email: 'me@example.com' });
  const accountVersion = signal(0);
  const username = signal<string | null | undefined>(null);
  let visibility: 'private' | 'public' | null;
  let sharing: Record<string, ReturnType<typeof vi.fn> | unknown>;
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
    user.set({ id: me, email: 'me@example.com' });
    accountVersion.set(0);
    username.set(null);
    visibility = 'private';
    sharing = {
      username,
      loadProfile: vi.fn(async () => undefined),
      isUsernameAvailable: vi.fn(async () => true),
      setUsername: vi.fn(async (name: string | null) => (username.set(name), 'saved')),
      visibility: vi.fn(async () => visibility),
      setVisibility: vi.fn(async (_: string, value: 'private' | 'public') => {
        visibility = value;
      }),
      recipients: vi.fn(async () => [{ id: 'r1', label: 'friend@example.com' }]),
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
    vi.restoreAllMocks();
    for (const method of added) Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  });

  async function render() {
    const view = TestBed.createComponent(RecipeShareDialogComponent);
    view.detectChanges();
    // The fakes answer at once; one macrotask lets every awaited answer land before checking.
    const settle = async () => {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      await view.whenStable();
      view.detectChanges();
    };
    TestBed.inject(RecipeActionsService).share(soup);
    await settle();
    const root = view.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      );
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    return { view, root, button, text, settle };
  }

  it('sends a signed-out cook to the account settings instead', async () => {
    user.set(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { root } = await render();
    expect(navigate).toHaveBeenCalledWith(['/settings'], { fragment: 'account' });
    expect(root.querySelector('dialog[open]')).toBeNull();
    expect(TestBed.inject(RecipeActionsService).sharing()).toBeNull();
  });

  it('explains public sharing, offers a username and publishes', async () => {
    const { root, button, text, settle } = await render();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(text()).toContain(
      'Public recipes can be found and read by anyone, even without an account.',
    );
    const input = root.querySelector<HTMLInputElement>('app-username-field input')!;
    input.value = '@Anna';
    input.dispatchEvent(new Event('input'));
    button('Publish')!.click();
    await settle();
    expect(sharing['setUsername']).toHaveBeenCalledWith('anna');
    expect(sharing['setVisibility']).toHaveBeenCalledWith('soup', 'public');
    expect(text()).toContain(`https://example.com/shared/${me}/soup`);
    expect(button('Share link')).toBeTruthy();
    expect(button('Stop sharing publicly')).toBeTruthy();
  });

  it('keeps the recipe private when the username was just taken', async () => {
    (sharing['setUsername'] as ReturnType<typeof vi.fn>).mockResolvedValue('taken');
    const { root, button, text, settle } = await render();
    const input = root.querySelector<HTMLInputElement>('app-username-field input')!;
    input.value = 'anna';
    input.dispatchEvent(new Event('input'));
    button('Publish')!.click();
    await settle();
    expect(sharing['setVisibility']).not.toHaveBeenCalled();
    expect(text()).toContain('Taken');
  });

  it('publishes without a username when the field is left empty', async () => {
    const { button, settle } = await render();
    button('Publish')!.click();
    await settle();
    expect(sharing['setUsername']).not.toHaveBeenCalled();
    expect(sharing['setVisibility']).toHaveBeenCalledWith('soup', 'public');
  });

  it('copies the link where the share sheet is missing', async () => {
    visibility = 'public';
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { button, settle } = await render();
    button('Share link')!.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(`https://example.com/shared/${me}/soup`);
    expect(TestBed.inject(FeedbackService).message()).toBe('Link copied');
    button('Stop sharing publicly')!.click();
    await settle();
    expect(sharing['setVisibility']).toHaveBeenCalledWith('soup', 'private');
  });

  it('shares with a person and explains every answer', async () => {
    const { view, root, button, text, settle } = await render();
    expect(text()).toContain('friend@example.com');
    const field = root.querySelector<HTMLInputElement>('#share-recipient')!;
    const answers: [string, string][] = [
      ['shared', 'Shared with anna@example.com.'],
      ['not_found', 'No one found with that email or username.'],
      ['self', 'You can’t share with yourself.'],
      ['limited', 'Wait a moment before sharing again.'],
    ];
    for (const [answer, message] of answers) {
      (sharing['share'] as ReturnType<typeof vi.fn>).mockResolvedValueOnce(answer);
      field.value = 'anna@example.com';
      field.dispatchEvent(new Event('input'));
      view.detectChanges();
      button('Share')!.click();
      await settle();
      expect(root.querySelector('.share-outcome')?.textContent?.trim()).toBe(message);
    }
    expect(sharing['share']).toHaveBeenCalledWith('soup', 'anna@example.com');
    root.querySelector<HTMLButtonElement>('[aria-label="Remove friend@example.com"]')!.click();
    await settle();
    expect(sharing['unshare']).toHaveBeenCalledWith('soup', 'r1');
    expect(text()).not.toContain('friend@example.com');
  });

  it('says so when the recipe has not reached the cloud yet', async () => {
    visibility = null;
    const { text, button } = await render();
    expect(text()).toContain('This recipe hasn’t synced yet. Try again in a moment.');
    expect(button('Publish')).toBeUndefined();
  });

  it('closes on an account change and sends nothing more', async () => {
    const { root, view } = await render();
    accountVersion.set(1);
    await view.whenStable();
    view.detectChanges();
    expect(root.querySelector('dialog')?.hasAttribute('open')).toBe(false);
    expect(TestBed.inject(RecipeActionsService).sharing()).toBeNull();
    expect(sharing['share']).not.toHaveBeenCalled();
  });
});
