import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { LeaveConfirmationService } from '../../core/services/leave-confirmation.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../../core/models/recipe.model';
import { recipeBackground } from '../../core/models/recipe-color';
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
  const recipeRevision = signal(0);
  let savedRecipes: Recipe[];
  let readRecipes: () => Promise<Recipe[]>;
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
    savedRecipes = [];
    readRecipes = async () => savedRecipes;
    recipeRevision.set(0);
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
                // Like groupShoppingItems, a group's key names its checked state.
                groups.update((current) =>
                  current.map((group) =>
                    group.items.some((entry) => ids.includes(entry.id))
                      ? {
                          ...group,
                          checked,
                          key: (checked ? 'bought:' : 'needed:') + group.key.replace(/^\w+:/, ''),
                        }
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
          useValue: { accountVersion, revision: recipeRevision, getRecipes: () => readRecipes() },
        },
      ],
    });
    feedback = TestBed.inject(FeedbackService);
  });
  afterEach(() => {
    feedback?.dismiss();
    TestBed.resetTestingModule();
    vi.useRealTimers();
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

  function pointer(target: EventTarget, type: string, x = 100, y = 100) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
      pointerId: { value: 7 },
    });
    target.dispatchEvent(event);
    return event;
  }

  it('edits held item text without checking it or activating the release click', async () => {
    checkUpdatesList = true;
    const host = await fixture();
    vi.useFakeTimers();
    const text = host.nativeElement.querySelector('.item-name') as HTMLElement;
    pointer(text, 'pointerdown');
    await vi.advanceTimersByTimeAsync(450);
    expect(host.componentInstance.editor()).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    host.detectChanges();
    expect(host.nativeElement.querySelector('.edit-item-input')?.value).toBe('2 kg tomatoes');
    pointer(document, 'pointerup');
    const release = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    expect(groups()[0].checked).toBe(false);
    expect(host.nativeElement.querySelector('.edit-item-input')).not.toBeNull();
  });

  it('keeps a normal text tap available for checking the item', async () => {
    checkUpdatesList = true;
    const host = await fixture();
    vi.useFakeTimers();
    const text = host.nativeElement.querySelector('.item-name') as HTMLElement;
    pointer(text, 'pointerdown');
    await vi.advanceTimersByTimeAsync(100);
    pointer(document, 'pointerup');
    text.click();
    expect(groups()[0].checked).toBe(true);
    expect(host.componentInstance.editor()).toBeNull();
  });

  it.each(['move', 'scroll', 'pointercancel', 'blur', 'release', 'account', 'busy', 'destroy'])(
    'cancels a pending text hold on %s',
    async (reason) => {
      const host = await fixture();
      vi.useFakeTimers();
      pointer(host.nativeElement.querySelector('.item-name'), 'pointerdown');
      if (reason === 'move') pointer(document, 'pointermove', 100, 125);
      if (reason === 'scroll') document.dispatchEvent(new Event('scroll'));
      if (reason === 'pointercancel') pointer(document, 'pointercancel');
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      if (reason === 'release') pointer(document, 'pointerup');
      if (reason === 'account') {
        accountVersion.set(1);
        host.detectChanges();
      }
      if (reason === 'busy') host.componentInstance.busy.set(true);
      if (reason === 'destroy') host.destroy();
      await vi.advanceTimersByTimeAsync(600);
      expect(host.componentInstance.editor()).toBeNull();
    },
  );

  it('does not consume the first intentional tap in the editor after a long hold', async () => {
    const host = await fixture();
    vi.useFakeTimers();
    pointer(host.nativeElement.querySelector('.item-name'), 'pointerdown');
    await vi.advanceTimersByTimeAsync(5000);
    host.detectChanges();
    pointer(document, 'pointerup');
    const release = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    const input = host.nativeElement.querySelector('.edit-item-input') as HTMLElement;
    pointer(input, 'pointerdown');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    input.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('supports keyboard and right-click editing with a discoverable checkbox hint', async () => {
    const host = await fixture();
    const checkbox = host.nativeElement.querySelector('input[type="checkbox"]') as HTMLElement;
    expect(checkbox.getAttribute('aria-keyshortcuts')).toContain('F2');
    const descriptions = checkbox.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(
      descriptions.some((id) => document.getElementById(id)?.textContent?.includes('Hold')),
    ).toBe(true);
    checkbox.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
    );
    host.detectChanges();
    expect(host.nativeElement.querySelector('.edit-item-input')).not.toBeNull();
    host.componentInstance.cancelEdit();
    host.detectChanges();
    const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    host.nativeElement.querySelector('.item-name').dispatchEvent(context);
    host.detectChanges();
    expect(context.defaultPrevented).toBe(true);
    expect(host.nativeElement.querySelector('.edit-item-input')).not.toBeNull();
  });

  it('uses only a minus icon for the accessible delete action and keeps Undo', async () => {
    const host = await fixture();
    const actions = host.nativeElement.querySelector('.row-actions') as HTMLElement;
    expect(actions.querySelectorAll('button')).toHaveLength(1);
    const remove = actions.querySelector('button') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Delete 2 kg tomatoes');
    expect(remove.textContent?.trim()).toBe('');
    expect(remove.querySelector('app-icon')).not.toBeNull();
    remove.click();
    await host.whenStable();
    expect(removed).toEqual([['a', 'b']]);
    expect(feedback.action()?.label).toBe('Undo');
  });

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
      'Fruit & veg',
      'Dairy, cheese & eggs',
      'Pantry',
    ]);
    const dairy = host.nativeElement.querySelector('[data-department="dairy"]') as HTMLElement;
    expect(dairy.querySelectorAll('.shopping-row')).toHaveLength(2);
    expect(dairy.querySelector('button[aria-label="Edit 1 l mjölk"]')).toBeNull();
    expect(dairy.querySelector('input[type="checkbox"]')?.id).toBe('shopping-item-milk');
  });

  it('reclassifies an edited item and omits its now-empty department', async () => {
    const host = await fixture();
    groups.update((current) => [{ ...current[0], text: '1 l mjölk' }]);
    host.detectChanges();
    expect(host.nativeElement.querySelector('.department-heading')?.textContent?.trim()).toBe(
      'Dairy, cheese & eggs',
    );
    expect(host.nativeElement.querySelector('[data-department="produce"]')).toBeNull();
  });

  it('keeps checked items visible at the bottom without repeating department headings', async () => {
    items.set([item('checked', true), item('milk'), item('apple')]);
    groups.set([
      {
        ...groups()[0],
        key: 'checked',
        text: '1 kg tomatoes',
        checked: true,
        items: [item('checked', true)],
      },
      { ...groups()[0], key: 'milk', text: '1 l mjölk', items: [item('milk')] },
      { ...groups()[0], key: 'apple', text: '2 äpplen', items: [item('apple')] },
    ]);
    const host = await fixture();
    const checkboxes = Array.from(
      host.nativeElement.querySelectorAll(
        '.shopping-row input[type="checkbox"]',
      ) as NodeListOf<HTMLInputElement>,
    );
    expect(checkboxes.map((checkbox) => checkbox.id)).toEqual([
      'shopping-item-apple',
      'shopping-item-milk',
      'shopping-item-checked',
    ]);
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([false, false, true]);
    const headings = Array.from(
      host.nativeElement.querySelectorAll('.department-heading') as NodeListOf<HTMLElement>,
    );
    expect(headings.map((heading) => heading.textContent?.trim())).toEqual([
      'Fruit & veg',
      'Dairy, cheese & eggs',
    ]);
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
      if (action === 'complete') {
        // A checked row stays struck through in place, then moves down and passes focus on.
        expect(document.activeElement).toBe(trigger);
        await new Promise((resolve) => setTimeout(resolve, 950));
        await host.whenStable();
        host.detectChanges();
      }
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

  it('shows one colored dot and legend entry per recipe, without visible per-item recipe text or servings', async () => {
    savedRecipes = [
      { id: 'soup', title: 'Tomato soup', color: 'rose', ingredients: [], instructions: [] },
      { id: 'pasta', title: 'Lemon pasta', color: 'blue', ingredients: [], instructions: [] },
    ];
    const source = groups()[0].sources[0];
    groups.set([
      {
        ...groups()[0],
        sources: [
          source,
          { ...source, servings: 2 },
          { ...source, recipeId: 'pasta', recipeTitle: 'Lemon pasta' },
        ],
      },
      {
        key: 'onion',
        text: '1 onion',
        checked: false,
        items: [{ ...item('onion'), text: '1 onion' }],
        sources: [source],
      },
    ]);
    const before = JSON.stringify(groups().map((group) => group.sources));
    const host = await fixture();
    const legend = host.nativeElement.querySelector('.recipe-legend') as HTMLElement;
    expect(legend.querySelectorAll('li')).toHaveLength(2);
    expect(legend.textContent).toContain('Tomato soup');
    expect(legend.textContent).toContain('Lemon pasta');
    expect(legend.querySelector('a[href="/recipes/soup"]')).not.toBeNull();
    expect(host.nativeElement.querySelector('.item-sources')).toBeNull();
    expect(host.nativeElement.textContent).not.toContain('servings');
    const row = host.nativeElement.querySelector('.shopping-row') as HTMLElement;
    const dots = row.querySelectorAll('.source-dot');
    expect(dots).toHaveLength(2);
    expect((dots[0] as HTMLElement).style.getPropertyValue('--source-color')).toBe(
      recipeBackground(savedRecipes[0]),
    );
    expect((dots[1] as HTMLElement).style.getPropertyValue('--source-color')).toBe(
      recipeBackground(savedRecipes[1]),
    );
    const input = row.querySelector('input')!;
    const description = input
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(description).toContain('Tomato soup');
    expect(description).toContain('Lemon pasta');
    expect(row.querySelector('.source-dots')?.getAttribute('aria-hidden')).toBe('true');
    expect(JSON.stringify(groups().map((group) => group.sources))).toBe(before);
  });

  it('matches the automatic recipe color including the photo-based default', async () => {
    savedRecipes = [
      {
        id: 'soup',
        title: 'Tomato soup',
        imageDataUrl: 'data:image/jpeg;base64,preview',
        ingredients: [],
        instructions: [],
      },
    ];
    const host = await fixture();
    const dot = host.nativeElement.querySelector('.shopping-row .source-dot') as HTMLElement;
    expect(dot.style.getPropertyValue('--source-color')).toBe(recipeBackground(savedRecipes[0]));
    const legendDot = host.nativeElement.querySelector('.recipe-legend .source-dot') as HTMLElement;
    expect(legendDot.style.getPropertyValue('--source-color')).toBe(
      dot.style.getPropertyValue('--source-color'),
    );
  });

  it('omits source decoration for manual items', async () => {
    groups.set([{ ...groups()[0], sources: [] }]);
    const host = await fixture();
    expect(host.nativeElement.querySelector('.recipe-legend')).toBeNull();
    expect(host.nativeElement.querySelector('.source-dot')).toBeNull();
    expect(
      host.nativeElement.querySelector('input[type="checkbox"]').getAttribute('aria-describedby'),
    ).toBe('shopping-edit-hint');
  });

  it('keeps missing recipe snapshots in the legend with a stable color and no broken link', async () => {
    const host = await fixture();
    const legend = host.nativeElement.querySelector('.recipe-legend') as HTMLElement;
    expect(legend.textContent).toContain('Tomato soup');
    expect(legend.querySelector('a')).toBeNull();
    const color = (
      host.nativeElement.querySelector('.shopping-row .source-dot') as HTMLElement
    ).style.getPropertyValue('--source-color');
    expect(color).toBe(recipeBackground({ id: 'soup' }));
    expect(
      (legend.querySelector('.source-dot') as HTMLElement).style.getPropertyValue('--source-color'),
    ).toBe(color);
  });

  it('updates legend names and dots when the saved recipe changes', async () => {
    savedRecipes = [
      { id: 'soup', title: 'Tomato soup', color: 'blue', ingredients: [], instructions: [] },
    ];
    const host = await fixture();
    savedRecipes = [{ ...savedRecipes[0], title: 'Roasted tomato soup', color: 'rose' }];
    recipeRevision.update((value) => value + 1);
    host.detectChanges();
    await host.whenStable();
    host.detectChanges();
    const legend = host.nativeElement.querySelector('.recipe-legend') as HTMLElement;
    expect(legend.textContent).toContain('Roasted tomato soup');
    expect(
      (
        host.nativeElement.querySelector('.shopping-row .source-dot') as HTMLElement
      ).style.getPropertyValue('--source-color'),
    ).toBe(recipeBackground(savedRecipes[0]));
    expect(groups()[0].sources[0].recipeTitle).toBe('Tomato soup');
  });

  it('ignores a previous account recipe lookup after switching accounts', async () => {
    let completeOld!: (recipes: Recipe[]) => void;
    readRecipes = () =>
      new Promise((resolve) => {
        completeOld = resolve;
      });
    const host = TestBed.createComponent(ShoppingListComponent);
    host.detectChanges();
    savedRecipes = [
      { id: 'new', title: 'New account recipe', color: 'green', ingredients: [], instructions: [] },
    ];
    readRecipes = async () => savedRecipes;
    accountVersion.set(1);
    groups.set([
      {
        ...groups()[0],
        sources: [
          { ...groups()[0].sources[0], recipeId: 'new', recipeTitle: 'New account recipe' },
        ],
      },
    ]);
    host.detectChanges();
    await host.whenStable();
    completeOld([{ ...savedRecipes[0], title: 'Old account private title', color: 'rose' }]);
    await host.whenStable();
    host.detectChanges();
    expect(host.nativeElement.textContent).not.toContain('Old account private title');
    const dot = host.nativeElement.querySelector('.shopping-row .source-dot') as HTMLElement;
    expect(dot.style.getPropertyValue('--source-color')).toBe(recipeBackground(savedRecipes[0]));
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

  async function twoItems() {
    checkUpdatesList = true;
    items.set([item('milk'), item('apple')]);
    groups.set([
      { ...groups()[0], key: 'milk', text: '1 l mjölk', items: [item('milk')] },
      { ...groups()[0], key: 'apple', text: '2 äpplen', items: [item('apple')] },
    ]);
    const host = await fixture();
    const rows = () =>
      Array.from(
        host.nativeElement.querySelectorAll('.shopping-row') as NodeListOf<HTMLElement>,
      ).map(
        (row) =>
          (row.closest('[data-department]') as HTMLElement).dataset['department'] +
          ':' +
          row.querySelector('input[type="checkbox"]')!.id.replace('shopping-item-', '') +
          (row.classList.contains('is-checked') ? ' ✓' : ''),
      );
    const toggle = async (id: string) => {
      (host.nativeElement.querySelector('#shopping-item-' + id) as HTMLInputElement).click();
      await host.whenStable();
      host.detectChanges();
    };
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve, 950));
      await host.whenStable();
      host.detectChanges();
    };
    return { host, rows, toggle, settle };
  }

  it('keeps a just-checked item struck through in place, then moves it to the bottom', async () => {
    const f = await twoItems();
    const before = f.rows();
    await f.toggle('apple');
    expect(f.rows()).toEqual(before.map((row) => (row.endsWith(':apple') ? row + ' ✓' : row)));
    await f.settle();
    expect(f.rows().at(-1)).toBe('checked:apple ✓');
    expect(f.rows()[0]).toMatch(/:milk$/);
  });

  it('moves the previous item at once when the next one is checked', async () => {
    const f = await twoItems();
    await f.toggle('apple');
    await f.toggle('milk');
    expect(f.rows()).toContain('checked:apple ✓');
    expect(f.rows().find((row) => row.includes(':milk'))).not.toMatch(/^checked:/);
    await f.settle();
    expect(f.rows().every((row) => row.startsWith('checked:'))).toBe(true);
  });

  it('brings an unchecked item back to its department at once and keeps it focused', async () => {
    const f = await twoItems();
    await f.toggle('apple');
    await f.settle();
    await f.toggle('apple');
    expect(f.rows().find((row) => row.includes(':apple'))).not.toMatch(/^checked:|✓/);
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('shopping-item-apple'));
    await f.host.componentInstance.requestClear();
    f.host.detectChanges();
    expect(f.host.nativeElement.querySelector('dialog').open).toBe(true);
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
    'returns focus to add item after clearing removes the trigger (checked only: %s)',
    async (checkedOnly) => {
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      removeUpdatesList = true;
      if (checkedOnly)
        groups.update((current) => current.map((group) => ({ ...group, checked: true })));
      const host = await fixture();
      const trigger = host.nativeElement.querySelector('.clear-list') as HTMLButtonElement;
      trigger.focus();
      await host.componentInstance.requestClear();
      host.detectChanges();
      if (!checkedOnly) await host.componentInstance.confirmClear();
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

  it('returns focus to add item after clearing removes all checked items', async () => {
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
    const trigger = host.nativeElement.querySelector('.clear-checked') as HTMLButtonElement;
    trigger.focus();
    await host.componentInstance.clearChecked();
    host.detectChanges();
    for (const frame of frames) frame(0);
    expect(trigger.isConnected).toBe(false);
    expect(document.activeElement).toBe(host.nativeElement.querySelector('#shopping-add'));
  });
});
