import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeDraftService } from '../../../core/services/recipe-draft.service';
import { RecipeService } from '../../../core/services/recipe.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { RecipeImportComponent } from './recipe-import';

describe('importing with fewer steps', () => {
  const imported = {
    title: 'Soup',
    ingredients: ['1 onion'],
    instructions: ['Cook.'],
  };
  let invokeImporter: ReturnType<typeof vi.fn>;
  let fromImport: ReturnType<typeof vi.fn>;
  let setDraft: ReturnType<typeof vi.fn>;
  let query: Record<string, string>;

  beforeEach(() => {
    sessionStorage.clear();
    query = {};
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    invokeImporter = vi.fn(async () => new Response(JSON.stringify(imported)));
    fromImport = vi.fn(async (value: unknown) => ({ ...(value as object), id: 'draft' }));
    setDraft = vi.fn();
    TestBed.configureTestingModule({
      imports: [RecipeImportComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useFactory: () => ({ snapshot: { queryParamMap: convertToParamMap(query) } }),
        },
        {
          provide: SupabaseService,
          useValue: {
            cacheScope: 'import-tests',
            configured: signal(true),
            user: signal({ id: 'alice' }),
            accountVersion: signal(0),
            invokeImporter,
          },
        },
        { provide: RecipeDraftService, useValue: { fromImport, set: setDraft } },
        { provide: RecipeService, useValue: {} },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render() {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RecipeImportComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement, navigate };
  }

  it('starts at once with a link from ?url=', async () => {
    query = { url: 'https://example.com/soup' };
    const { root, navigate } = await render();
    expect((root.querySelector('#recipe-url') as HTMLInputElement).value).toBe(
      'https://example.com/soup',
    );
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/recipes/new']));
    expect(invokeImporter.mock.calls[0]![0]).toEqual({ url: 'https://example.com/soup' });
  });

  it('starts when a lone link is pasted into the empty field', async () => {
    const { root, navigate } = await render();
    const input = root.querySelector('#recipe-url') as HTMLInputElement;
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => ' https://example.com/soup ' },
    });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/recipes/new']));
  });

  it('pastes and imports a link from the clipboard with one tap', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => 'https://example.com/soup' },
    });
    try {
      const { root, navigate } = await render();
      (root.querySelector('.paste-link') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/recipes/new']));
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('turns pasted recipe text into a draft to review', async () => {
    query = { text: 'Soup\n1 onion\nCook it gently.' };
    const { root, fixture, navigate } = await render();
    const area = root.querySelector('#recipe-text') as HTMLTextAreaElement;
    expect(area.value).toBe('Soup\n1 onion\nCook it gently.');
    (root.querySelector('.import-text') as HTMLButtonElement).click();
    fixture.detectChanges();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/recipes/new']));
    expect(fromImport.mock.calls[0]![0]).toMatchObject({
      title: 'Soup',
      ingredients: ['1 onion'],
      instructions: ['Cook it gently.'],
    });
    expect(setDraft).toHaveBeenCalledOnce();
    expect(invokeImporter).not.toHaveBeenCalled();
  });

  it('explains what is missing when the text is not a whole recipe', async () => {
    const { root, fixture } = await render();
    const area = root.querySelector('#recipe-text') as HTMLTextAreaElement;
    area.value = 'Only a title';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (root.querySelector('.import-text') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('ingredients and steps');
  });
});
