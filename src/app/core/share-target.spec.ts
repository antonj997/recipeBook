import { describe, expect, it } from 'vitest';
import { sharedStartUrl, shareTargetRoute } from './share-target';

describe('shareTargetRoute', () => {
  it('opens the import page with a shared link', () => {
    expect(shareTargetRoute('?title=Soup&url=https%3A%2F%2Fexample.com%2Fsoup')).toBe(
      '/recipes/import?url=https%3A%2F%2Fexample.com%2Fsoup',
    );
  });

  it('finds the link that apps put in the shared text', () => {
    expect(shareTargetRoute('?text=Try+this+soup+https%3A%2F%2Fexample.com%2Fsoup')).toBe(
      '/recipes/import?url=https%3A%2F%2Fexample.com%2Fsoup',
    );
  });

  it('imports shared recipe text that has no link', () => {
    expect(shareTargetRoute('?text=Soup%0A1+onion%0ACook+it.')).toBe(
      '/recipes/import?text=Soup%0A1%20onion%0ACook%20it.',
    );
  });

  it('ignores ordinary starts', () => {
    expect(shareTargetRoute('')).toBeNull();
    expect(shareTargetRoute('?utm_source=homescreen')).toBeNull();
  });

  it('rewrites a shared start into the hash route on GitHub Pages', () => {
    expect(
      sharedStartUrl(
        new URL('https://example.github.io/recipeBook/?url=https%3A%2F%2Fa.se%2Fb'),
        true,
      ),
    ).toBe('/recipeBook/#/recipes/import?url=https%3A%2F%2Fa.se%2Fb');
  });

  it('rewrites a shared start into a path route elsewhere', () => {
    expect(sharedStartUrl(new URL('http://localhost:4200/?text=Soup'), false)).toBe(
      '/recipes/import?text=Soup',
    );
    expect(sharedStartUrl(new URL('http://localhost:4200/'), false)).toBeNull();
  });
});
