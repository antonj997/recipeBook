import { describe, expect, it } from 'vitest';
import { perPortionNutrition } from './recipe-metadata';

describe('nutrition per portion', () => {
  it('reads six-figure energy as calories and shows it in kcal', () => {
    expect(perPortionNutrition({ calories: '654897' })?.calories).toBe('655 kcal');
    expect(perPortionNutrition({ calories: '654897 calories' })?.calories).toBe('655 kcal');
    expect(perPortionNutrition({ calories: '412000 cal' })?.calories).toBe('412 kcal');
  });

  it('keeps ordinary kcal values as they are', () => {
    expect(perPortionNutrition({ calories: '655 kcal' })?.calories).toBe('655 kcal');
    expect(perPortionNutrition({ calories: '1200' })?.calories).toBe('1200 kcal');
    expect(perPortionNutrition({ calories: '2500 kJ' })?.calories).toBe('598 kcal');
  });
});
