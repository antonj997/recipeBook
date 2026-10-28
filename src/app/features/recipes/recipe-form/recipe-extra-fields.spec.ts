import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMetadataForm,
  RecipeExtraFieldsComponent,
  RecipeNutritionFieldsComponent,
} from './recipe-extra-fields';

describe('recipe details and nutrition in the editor', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  function form() {
    return createMetadataForm(new FormBuilder());
  }

  it('keeps nutrition out of Recipe details', () => {
    const fixture = TestBed.createComponent(RecipeExtraFieldsComponent);
    fixture.componentRef.setInput('form', form());
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Total time');
    expect(root.textContent).not.toContain('Protein');
  });

  it('is its own row that sums up the energy once it is filled in', () => {
    const metadata = form();
    const fixture = TestBed.createComponent(RecipeNutritionFieldsComponent);
    fixture.componentRef.setInput('form', metadata);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const summary = () => root.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(summary()).toBe('Nutrition Optional');
    metadata.controls.nutrition.controls.calories.setValue(655);
    fixture.detectChanges();
    expect(summary()).toBe('Nutrition 655 kcal');
    expect(root.querySelectorAll('input[type="number"]')).toHaveLength(4);
  });
});
