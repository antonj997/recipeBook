import { FormArray, FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeGroupsComponent } from './recipe-groups';

describe('editor row motion', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  async function editor(values = ['Salt', 'Pepper', 'Oil']) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    TestBed.configureTestingModule({ imports: [RecipeGroupsComponent] });
    const fixture = TestBed.createComponent(RecipeGroupsComponent);
    const rows = values.map((value) => new FormControl(value, { nonNullable: true }));
    fixture.componentRef.setInput('items', new FormArray(rows));
    fixture.componentRef.setInput('kind', 'ingredient');
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const order = () =>
      Array.from(root.querySelectorAll<HTMLElement>('.editor-row')).map(
        (row) =>
          row.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')!.value,
      );
    return { fixture, root, rows, order };
  }

  it('marks every row with a stable key that follows its control', async () => {
    const { fixture, root, rows } = await editor();
    const keyOf = (value: string) =>
      Array.from(root.querySelectorAll<HTMLElement>('.editor-row')).find(
        (row) => row.querySelector<HTMLTextAreaElement>('textarea, input')!.value === value,
      )!.dataset['flip'];
    const before = keyOf('Oil');
    expect(before).toBeTruthy();
    fixture.componentInstance.move(rows[2]!, fixture.componentInstance.groups()[0]!.id, rows[0]!);
    fixture.detectChanges();
    expect(keyOf('Oil')).toBe(before);
  });

  it('moves a row with the arrow keys and keeps focus on its handle', async () => {
    const { fixture, root, order } = await editor();
    const handle = root.querySelectorAll<HTMLButtonElement>('.drag-handle')[0]!;
    handle.focus();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(order()).toEqual(['Pepper', 'Salt', 'Oil']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move ingredient 2');
  });
});
