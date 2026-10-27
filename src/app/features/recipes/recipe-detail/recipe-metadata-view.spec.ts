import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { RecipeSummaryDetailsComponent } from './recipe-metadata-view';

describe('recipe summary details', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the cooking time before the categories, as list rows do', () => {
    const host = TestBed.createComponent(RecipeSummaryDetailsComponent);
    host.componentRef.setInput('recipe', {
      id: 'soup',
      title: 'Soup',
      ingredients: [],
      instructions: [],
      totalTime: 35,
    });
    host.componentRef.setInput('categories', ['Kyckling', 'Vardagsmat']);
    host.detectChanges();
    const metadata = host.nativeElement.querySelector('.recipe-metadata') as HTMLElement;
    const parts = [...metadata.children].map((child) => child.className);
    expect(parts[0]).toContain('recipe-time');
    expect(parts[1]).toContain('recipe-categories');
  });
});
