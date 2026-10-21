import { describe, expect, it } from 'vitest';
import { recipeCategoryNames } from './recipe-collection.model';

describe('recipe category labels', () => {
  const names = new Map([
    ['dinner', 'Dinner'],
    ['quick', 'Quick meals'],
    ['family', 'Family favourites'],
    ['weekend', 'Weekend'],
  ]);
  it('uses saved category order and skips deleted categories before limiting the display', () => {
    expect(recipeCategoryNames(['missing', 'family', 'quick', 'dinner', 'weekend'], names)).toEqual(
      ['Family favourites', 'Quick meals', 'Dinner'],
    );
  });
  it('keeps recipes without categories free of placeholder labels', () => {
    expect(recipeCategoryNames(undefined, names)).toEqual([]);
    expect(recipeCategoryNames(['missing'], names)).toEqual([]);
  });
});
