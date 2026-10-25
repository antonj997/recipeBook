import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { LeaveConfirmationService } from '../../core/services/leave-confirmation.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingGroup, ShoppingItem } from '../../core/models/shopping-item';
import { ShoppingListService } from '../../core/services/shopping-list.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { ShoppingListComponent } from './shopping-list';

@Component({ template: '<h1>Settings destination</h1>' })
class NavigationDestination {}

describe('shopping list', () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  const accountVersion = signal(0);
  const groups = signal<ShoppingGroup[]>([]);
  const items = signal<ShoppingItem[]>([]);
  const item = (id: string, checked = false): ShoppingItem => ({
    id,
    text: '1 kg tomatoes',
    checked,
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    sources: [
      {
        recipeId: 'soup',
        recipeTitle: 'Tomato soup',
        servings: 4,
        ingredientIndex: 0,
        originalText: '1 kg tomatoes',
      },
    ],
  });
  let edits: { ids: readonly string[]; text: string }[];
  let removed: readonly string[][];
  let manual: string[];
  let restored: boolean;
  let removeUpdatesList: boolean;
  let checkUpdatesList: boolean;
  let feedback: FeedbackService;

  beforeEach(() => {
    edits = [];
    removed = [];
    manual = [];
    restored = false;
    removeUpdatesList = false;
    checkUpdatesList = false;
    accountVersion.set(0);
    items.set([item('a'), item('b')]);
    groups.set([
      {
        key: 'tomatoes',
        text: '2 kg tomatoes',
        checked: false,
        items: items(),
        sources: items()[0].sources ?? [],
      },
    ]);
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.setAttribute('open', '');
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.removeAttribute('open');
        },
      },
    });
    TestBed.configureTestingModule({
      imports: [ShoppingListComponent],
      providers: [
        provideRouter([]),
        {
          provide: ShoppingListService,
          useValue: {
            items,
            groups,
            accountVersion,
            loading: signal(false),
            error: signal(''),
            cloud: { online: signal(true), error: signal('') },
            refresh: async () => {},
            addManual: async (text: string) => {
              manual.push(text);
              return 2;
            },
            edit: async (ids: readonly string[], text: string) => {
              edits.push({ ids, text });
            },
            setChecked: async (ids: readonly string[], checked: boolean) => {
              if (checkUpdatesList) {
                items.update((current) =>
                  current.map((entry) => (ids.includes(entry.id) ? { ...entry, checked } : entry)),
                );
                groups.update((current) =>
                  current.map((group) =>
                    group.items.some((entry) => ids.includes(entry.id))
                      ? { ...group, checked }
                      : group,
                  ),
                );
              }
            },
            remove: async (ids: readonly string[]) => {
              removed = [...removed, [...ids]];
              if (removeUpdatesList) {
                items.update((current) => current.filter((item) => !ids.includes(item.id)));
                groups.update((current) =>
                  current.filter((group) => group.items.some((item) => !ids.includes(item.id))),
                );
              }
              return async () => {
                restored = true;
              };
            },
            clear: async () => {
              if (removeUpdatesList) {
                items.update((current) => current.filter((item) => !item.checked));
                groups.update((current) => current.filter((group) => !group.checked));
              }
              return async () => {
                restored = true;
              };
            },
          },
        },
        {
          provide: RecipeService,
          useValue: { accountVersion, revision: signal(0), getRecipes: async () => [] },
        },
      ],
    });
    feedback = TestBed.inject(FeedbackService);
  });
  afterEach(() => {
    feedback?.dismiss();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalShowModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  async function fixture() {
    const host = TestBed.createComponent(ShoppingListComponent);
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    return host;
  }

  async function navigationFixture() {
    const shoppingRoute = routes.find((route) => route.path === 'shopping-list');
    if (!shoppingRoute) throw new Error('Shopping route is missing');
    TestBed.inject(Router).resetConfig([
      { ...shoppingRoute, loadComponent: undefined, component: ShoppingListComponent },
      { path: 'settings', component: NavigationDestination },
    ]);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/shopping-list', ShoppingListComponent);
    return { harness, page, router: TestBed.inject(Router) };
  }

  it('allows navigation away from the registered shopping route after items are saved', async () => {
    const { router } = await navigationFixture();
    expect(await router.navigateByUrl('/settings')).toBe(true);
    expect(router.url).toBe('/settings');
  });

  it('keeps a pending item draft until the user confirms leaving', async () => {
    const { page, router } = await navigationFixture();
    page.draft.set('2 onions');
    const confirmation = TestBed.inject(LeaveConfirmationService);
    const leaving = router.navigateByUrl('/settings');
    await vi.waitFor(() => expect(confirmation.message()).not.toBe(''));
    confirmation.answer(false);
    expect(await leaving).toBe(false);
    expect(router.url).toBe('/shopping-list');
    expect(page.draft()).toBe('2 onions');
    const retry = router.navigateByUrl('/settings');
    await vi.waitFor(() => expect(confirmation.message()).not.toBe(''));
    confirmation.answer(true);
    expect(await retry).toBe(true);
  });

  it('blocks navigation while a shopping write is in progress', async () => {
    const { page, router } = await navigationFixture();
    page.adding.set(true);
    expect(await router.navigateByUrl('/settings')).toBe(false);
    expect(router.url).toBe('/shopping-list');
    page.adding.set(false);
    expect(await router.navigateByUrl('/settings')).toBe(true);
  });

  it('renders nonempty shop departments together without changing the item controls', async () => {
    groups.set([
      {
        key: 'flour',
        text: '500 g vetemjöl',
        checked: false,
        items: [{ ...item('flour'), text: '500 g vetemjöl' }],
        sources: [],
      },
      {
        key: 'milk',
        text: '1 l mjölk',
        checked: false,
        items: [{ ...item('milk'), text: '1 l mjölk' }],
        sources: [],
      },
      {
        key: 'lemons',
        text: '2 citroner',
        checked: false,
        items: [{ ...item('lemons'), text: '2 citroner' }],
        sources: [],
      },
      {
        key: 'eggs',
        text: '6 ägg',
        checked: false,
        items: [{ ...item('eggs'), text: '6 ägg' }],
        sources: [],
      },
    ]);
    const host = await fixture();
    const headings = Array.from(
      host.nativeElement.querySelectorAll('.department-heading') as NodeListOf<HTMLElement>,
    );
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      'Frukt & grönt',
      'Mejeri, ost & ägg',
      'Skafferi',
    ]);
    const dairy = host.nativeElement.querySelector('[data-department="dairy"]') as HTMLElement;
    expect(dairy.querySelectorAll('.shopping-row')).toHaveLength(2);
    expect(dairy.querySelector('button[aria-label="Edit 1 l mjölk"]')).not.toBeNull();
    expect(dairy.querySelector('input[type="checkbox"]')?.id).toBe('shopping-item-milk');
  });

  it('reclassifies an edited item and omits its now-empty department', async () => {
    const host = await fixture();
    groups.update((current) => [{ ...current[0], text: '1 l mjölk' }]);
    host.detectChanges();
    expect(host.nativeElement.querySelector('.department-heading')?.textContent?.trim()).toBe(
      'Mejeri, ost & ägg',
    );
    expect(host.nativeElement.querySelector('[data-department="produce"]')).toBeNull();
  });

  it('keeps Bought collapsed and uses distinct department labels when it is expanded', async () => {
    items.set([item('a'), item('b', true)]);
    groups.set([
      { ...groups()[0], items: [item('a')] },
      { ...groups()[0], key: 'bought', checked: true, items: [item('b', true)] },
    ]);
    const host = await fixture();
    expect(host.nativeElement.querySelector('.bought-section .department-heading')).toBeNull();
    host.componentInstance.showBought.set(true);
    host.detectChanges();
    const departments = Array.from(
      host.nativeElement.querySelectorAll('.shopping-department') as NodeListOf<HTMLElement>,
    );
    expect(departments).toHaveLength(2);
    expect(
      new Set(departments.map((department) => department.getAttribute('aria-labelledby'))).size,
    ).toBe(2);
    expect(host.nativeElement.querySelector('#shopping-bought-items')).not.toBeNull();
  });

  it.each(['complete', 'delete'] as const)(
    'keeps keyboard focus on the next department after %s removes its last row',
    async (action) => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      checkUpdatesList = true;
      removeUpdatesList = true;
      items.set([
        { ...item('apple'), text: '2 äpplen' },
        { ...item('milk'), text: '1 l mjölk' },
      ]);
      groups.set(
        items().map((entry) => ({
          key: entry.id,
          text: entry.text,
          checked: false,
          items: [entry],
          sources: [],
        })),
      );
      const host = await fixture();
      const trigger = host.nativeElement.querySelector(
        action === 'complete' ? '#shopping-item-apple' : 'button[aria-label="Delete 2 äpplen"]',
      ) as HTMLElement;
      trigger.focus();
      trigger.click();
      await host.whenStable();
      host.detectChanges();
      for (const frame of frames) frame(0);
      expect(document.activeElement).toBe(host.nativeElement.querySelector('#shopping-item-milk'));
      expect(host.nativeElement.querySelector('#shopping-to-buy-produce')).toBeNull();
    },
  );

  it('keeps deleted source recipes readable without linking to a missing recipe', async () => {
    const host = await fixture();
    expect(host.nativeElement.textContent).toContain('Tomato soup');
    expect(host.nativeElement.querySelector('a[href="/recipes/soup"]')).toBeNull();
  });

  it('edits captured contributions without including items added while the editor is open', async () => {
    const host = await fixture();
    host.componentInstance.startEdit(groups()[0]);
    host.detectChanges();
    groups.set([{ ...groups()[0], items: [...items(), item('c')] }]);
    host.detectChanges();
    const input = host.nativeElement.querySelector('.edit-item-input') as HTMLInputElement;
    input.value = '4 kg tomatoes';
    input.dispatchEvent(new Event('input'));
    await host.componentInstance.saveEdit();
    expect(edits).toEqual([{ ids: ['a', 'b'], text: '4 kg tomatoes' }]);
  });

  it('preserves pasted multiline quantities and offers an account-bound Undo after deletion', async () => {
    const host = await fixture();
    const event = {
      clipboardData: { getData: () => '2 kg tomatoes\n1 onion' },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    host.componentInstance.pasteItems(event);
    await host.whenStable();
    expect(manual).toEqual(['2 kg tomatoes\n1 onion']);
    await host.componentInstance.removeGroup(groups()[0]);
    expect(removed).toEqual([['a', 'b']]);
    expect(feedback.action()?.label).toBe('Undo');
    await feedback.runAction();
    expect(restored).toBe(true);
  });

  it('collapses bought items by default and requires confirmation before clearing unbought items', async () => {
    const host = await fixture();
    items.set([item('a'), item('b', true)]);
    groups.set([
      { ...groups()[0], text: '1 kg tomatoes', items: [item('a')] },
      {
        ...groups()[0],
        key: 'bought-tomatoes',
        text: '1 kg tomatoes',
        checked: true,
        items: [item('b', true)],
      },
    ]);
    host.detectChanges();
    const disclosure = host.nativeElement.querySelector('.bought-disclosure') as HTMLButtonElement;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    host.componentInstance.requestClear();
    host.detectChanges();
    expect(host.nativeElement.querySelector('dialog').open).toBe(true);
    expect(removed).toEqual([]);
  });

  it('clears the confirmed IDs while retaining additions that arrive after the dialog opens', async () => {
    const host = await fixture();
    host.componentInstance.requestClear();
    host.detectChanges();
    items.update((current) => [...current, item('new')]);
    await host.componentInstance.confirmClear();
    expect(removed).toEqual([['a', 'b']]);
  });

  it.each([false, true])(
    'returns focus to add item after clearing removes the trigger (bought only: %s)',
    async (boughtOnly) => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      removeUpdatesList = true;
      if (boughtOnly)
        groups.update((current) => current.map((group) => ({ ...group, checked: true })));
      const host = await fixture();
      const trigger = host.nativeElement.querySelector('.clear-list') as HTMLButtonElement;
      trigger.focus();
      await host.componentInstance.requestClear();
      host.detectChanges();
      if (!boughtOnly) await host.componentInstance.confirmClear();
      await host.whenStable();
      host.detectChanges();
      for (const frame of frames) frame(0);
      expect(trigger.isConnected).toBe(false);
      expect(document.activeElement).toBe(host.nativeElement.querySelector('#shopping-add'));
    },
  );

  it('returns focus to the connected clear trigger when its dialog is cancelled', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const host = await fixture();
    const trigger = host.nativeElement.querySelector('.clear-list') as HTMLButtonElement;
    trigger.focus();
    host.componentInstance.requestClear();
    host.detectChanges();
    (host.nativeElement.querySelector('.dialog-actions button') as HTMLButtonElement).focus();
    host.componentInstance.cancelClear();
    host.detectChanges();
    for (const frame of frames) frame(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('does not restore clear-action focus after the account changes', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    removeUpdatesList = true;
    const host = await fixture();
    (host.nativeElement.querySelector('.clear-list') as HTMLButtonElement).focus();
    host.componentInstance.requestClear();
    host.detectChanges();
    await host.componentInstance.confirmClear();
    host.detectChanges();
    accountVersion.set(1);
    host.detectChanges();
    const backLink = host.nativeElement.querySelector('.back-link') as HTMLAnchorElement;
    backLink.focus();
    for (const frame of frames) frame(0);
    expect(document.activeElement).toBe(backLink);
  });

  it('returns focus to add item after clearing removes the bought section', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    removeUpdatesList = true;
    items.update((current) => current.map((item) => ({ ...item, checked: true })));
    groups.update((current) =>
      current.map((group) => ({ ...group, checked: true, items: items() })),
    );
    const host = await fixture();
    const trigger = host.nativeElement.querySelector('.clear-bought') as HTMLButtonElement;
    trigger.focus();
    await host.componentInstance.clearBought();
    host.detectChanges();
    for (const frame of frames) frame(0);
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(host.nativeElement.querySelector('#shopping-add'));
  });
});
