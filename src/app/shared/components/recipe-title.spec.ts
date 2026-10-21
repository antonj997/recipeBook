import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeTitleComponent } from './recipe-title';

describe('recipe title overflow', () => {
  let resized: (() => void) | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();
  beforeEach(() => {
    observe.mockClear();
    disconnect.mockClear();
    resized = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    TestBed.configureTestingModule({ imports: [RecipeTitleComponent] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function title(contentHeight: number, limit = 2) {
    const view = TestBed.createComponent(RecipeTitleComponent);
    const root = view.nativeElement as HTMLElement;
    const layout = { contentHeight };
    Object.defineProperties(root, {
      clientHeight: { get: () => 40 },
      scrollHeight: { get: () => layout.contentHeight },
    });
    view.componentRef.setInput('title', 'Black Pepper Crust Chicken & Sandwich');
    if (limit) view.componentRef.setInput('maxLines', limit);
    view.detectChanges();
    await view.whenStable();
    return { view, root, layout };
  }

  it('enables two-line clamping only when words exceed the reserved space', async () => {
    const f = await title(60);
    expect(f.root.style.webkitLineClamp).toBe('2');
    expect(f.root.style.display).toBe('-webkit-box');
    expect(f.root.querySelectorAll('[data-title-word]')).toHaveLength(6);
    expect(f.root.textContent).toContain('Sandwich');
  });

  it('leaves an exactly fitting two-line title unclamped to avoid Safari’s false ellipsis', async () => {
    const f = await title(40);
    expect(f.root.style.webkitLineClamp).toBe('');
    expect(f.root.style.display).toBe('block');
    expect(f.root.textContent).toContain('Sandwich');
  });

  it('removes a previous clamp when a wider layout fits the complete title', async () => {
    const f = await title(60);
    expect(f.root.style.webkitLineClamp).toBe('2');
    expect(f.root.style.display).toBe('-webkit-box');
    f.layout.contentHeight = 40;
    resized?.();
    expect(f.root.style.webkitLineClamp).toBe('');
  });

  it('remeasures edited title text and disconnects on removal', async () => {
    const f = await title(60);
    f.layout.contentHeight = 20;
    f.view.componentRef.setInput('title', 'Airfryer lax');
    f.view.detectChanges();
    await f.view.whenStable();
    expect(f.root.style.webkitLineClamp).toBe('');
    f.view.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not measure unrestricted card or recipe-page titles', async () => {
    const f = await title(120, 0);
    expect(observe).not.toHaveBeenCalled();
    expect(f.root.style.display).toBe('');
    expect(f.root.style.webkitLineClamp).toBe('');
  });
});
