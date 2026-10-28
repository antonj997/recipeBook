import { describe, expect, it } from 'vitest';
import { parseRecipeText } from './recipe-text';

describe('parseRecipeText', () => {
  it('reads a Swedish recipe with headings, a group and numbered steps', () => {
    const recipe = parseRecipeText(`Köttbullar med gräddsås
Klassiska köttbullar som mormor gjorde dem.

4 portioner
Tid: 45 min

Ingredienser
500 g blandfärs
1 gul lök
1 ägg

Sås
2 dl grädde
1 msk soja

Gör så här
1. Blanda färs, lök och ägg.
2) Rulla bullar och stek dem.
3. Vispa ihop såsen.`);
    expect(recipe).toEqual({
      title: 'Köttbullar med gräddsås',
      description: 'Klassiska köttbullar som mormor gjorde dem.',
      servings: 4,
      totalTime: 45,
      ingredients: ['500 g blandfärs', '1 gul lök', '1 ägg', '2 dl grädde', '1 msk soja'],
      ingredientSections: ['', '', '', 'Sås', 'Sås'],
      instructions: [
        'Blanda färs, lök och ägg.',
        'Rulla bullar och stek dem.',
        'Vispa ihop såsen.',
      ],
    });
  });

  it('reads an English recipe with bullets, a colon heading and hours', () => {
    const recipe = parseRecipeText(`Lemon pasta
Serves 2 · Ready in 1 hr 10 min

Ingredients:
- 200 g spaghetti
• 1 lemon, zested
* Salt

Method:
Boil the pasta.
Stir in the lemon zest and serve.`);
    expect(recipe).toMatchObject({
      title: 'Lemon pasta',
      servings: 2,
      totalTime: 70,
      ingredients: ['200 g spaghetti', '1 lemon, zested', 'Salt'],
      instructions: ['Boil the pasta.', 'Stir in the lemon zest and serve.'],
    });
    expect(recipe.ingredientSections).toBeUndefined();
  });

  it('tells ingredients from steps when the text has no headings', () => {
    expect(
      parseRecipeText(`Quick omelette
3 eggs
½ tbsp butter
Whisk the eggs with a pinch of salt.
Melt the butter and cook the eggs gently.`),
    ).toEqual({
      title: 'Quick omelette',
      ingredients: ['3 eggs', '½ tbsp butter'],
      instructions: [
        'Whisk the eggs with a pinch of salt.',
        'Melt the butter and cook the eggs gently.',
      ],
    });
  });

  it('keeps step headings like "Steg 2" out of the steps', () => {
    const recipe = parseRecipeText(`Pannkakor
Ingredienser
3 dl vetemjöl
6 dl mjölk
Instruktioner
Steg 1
Vispa mjöl och mjölk.
Steg 2
Stek tunna pannkakor.`);
    expect(recipe.instructions).toEqual(['Vispa mjöl och mjölk.', 'Stek tunna pannkakor.']);
  });

  it('asks for the whole recipe when ingredients or steps are missing', () => {
    expect(() => parseRecipeText('Just a title')).toThrow(
      'Paste the whole recipe, with its ingredients and steps.',
    );
  });
});
