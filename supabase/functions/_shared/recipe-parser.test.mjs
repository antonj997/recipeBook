import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRecipe } from './recipe-parser.mjs';

const sourceUrl = new URL('https://recept.se/recept/testbiffar');
const schema = {
  '@type': 'Recipe',
  name: 'Testbiffar',
  recipeYield: 4,
  recipeIngredient: [
    '600 g blandfärs',
    '2 soltorkade tomater',
    '½ gurka',
    '2 dl yoghurt',
    'sallad',
  ],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Blanda och stek.' }],
  nutrition: { servingSize: '1 portion', calories: '623415 calories', proteinContent: '35.8 g' },
};
const ingredient = (name, plural = name) => ({
  ingredient: { name_singular: name, name_plural: plural },
});
const page = {
  slug: 'testbiffar',
  title: 'Testbiffar',
  nutrition: { calories: 623.415, kilojoules: 2608.365 },
  ingredient_groups: [
    {
      title: 'Färsbiffar',
      ingredients: [ingredient('blandfärs'), ingredient('soltorkad tomat', 'soltorkade tomater')],
    },
    { title: 'Tzatziki', ingredients: [ingredient('gurka', 'gurkor'), ingredient('yoghurt')] },
    { title: 'Servering', ingredients: [ingredient('sallad')] },
  ],
};
function html(data = page, recipe = schema) {
  const attribute = JSON.stringify(data)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return `<script type="application/ld+json">${JSON.stringify(recipe)}</script><page-recipe :recipe="${attribute}"></page-recipe>`;
}

test('recovers Recept.se ingredient headings in JSON-LD order without changing quantities', () => {
  const recipe = parseRecipe(html(), sourceUrl);
  assert.deepEqual(recipe.ingredientSections, [
    'Färsbiffar',
    'Färsbiffar',
    'Tzatziki',
    'Tzatziki',
    'Servering',
  ]);
  assert.deepEqual(recipe.ingredients, schema.recipeIngredient);
  assert.equal(recipe.servings, 4);
});

test('uses the numeric page calories when Recept.se JSON-LD has lost the decimal separator', () => {
  const recipe = parseRecipe(html(), sourceUrl);
  assert.deepEqual(recipe.nutrition, {
    servingSize: 'Per portion',
    calories: '623 kcal',
    proteinContent: '35.8 g',
  });
});

for (const [label, data] of [
  ['another recipe slug', { ...page, slug: 'unrelated' }],
  ['another title', { ...page, title: 'Unrelated recipe' }],
  ['malformed data', null],
]) {
  test(`does not borrow metadata from ${label}`, () => {
    const recipe = parseRecipe(html(data), sourceUrl);
    assert.deepEqual(recipe.ingredientSections, ['', '', '', '', '']);
    assert.equal(recipe.nutrition.calories, '623415 kcal');
  });
}

test('does not attach headings if ingredient counts differ', () => {
  const data = structuredClone(page);
  data.ingredient_groups[0].ingredients.pop();
  assert.deepEqual(parseRecipe(html(data), sourceUrl).ingredientSections, ['', '', '', '', '']);
});

test('does not attach headings to unrelated or reordered ingredients even if the counts match', () => {
  const data = structuredClone(page);
  data.ingredient_groups[0].ingredients.reverse();
  assert.deepEqual(parseRecipe(html(data), sourceUrl).ingredientSections, ['', '', '', '', '']);
});

test('preserves explicit structured ingredient sections when optional page groups do not match', () => {
  const recipe = {
    ...schema,
    recipeIngredient: [
      { name: 'Dough', itemListElement: ['2 dl flour'] },
      { name: 'Filling', itemListElement: ['1 apple'] },
    ],
  };
  assert.deepEqual(parseRecipe(html(page, recipe), sourceUrl).ingredientSections, [
    'Dough',
    'Filling',
  ]);
});

test('ignores invalid optional page JSON without breaking the import', () => {
  const input = html().replace(/:recipe="[^"]*"/, ':recipe="not JSON"');
  assert.equal(parseRecipe(input, sourceUrl).title, 'Testbiffar');
});

for (const calories of [null, -1, '623.415', 'not a number']) {
  test(`does not coerce an invalid page calorie value (${calories})`, () => {
    const recipe = parseRecipe(html({ ...page, nutrition: { calories } }), sourceUrl);
    assert.equal(recipe.nutrition.calories, '623415 kcal');
  });
}

test('does not relabel per-100g nutrition as per portion', () => {
  assert.equal(
    parseRecipe(
      html(page, { ...schema, nutrition: { ...schema.nutrition, servingSize: '100 g' } }),
      sourceUrl,
    ).nutrition,
    undefined,
  );
});

test('leaves other sites and their calorie units unchanged', () => {
  const recipe = parseRecipe(
    html(page, { ...schema, nutrition: { servingSize: '1 serving', calories: '2092 kJ' } }),
    new URL('https://www.koket.se/testbiffar'),
  );
  assert.equal(recipe.nutrition.calories, '500 kcal');
  assert.deepEqual(recipe.ingredientSections, ['', '', '', '', '']);
});

test('keeps existing ICA headings when DOM and schema ingredients match', () => {
  const body =
    '<div class="ingredients-list"><h3>Färs</h3><div class="ingredients-list-group__card">600 g blandfärs</div></div>';
  const input = html(page, { ...schema, recipeIngredient: ['600 g blandfärs'] }) + body;
  assert.deepEqual(
    parseRecipe(input, new URL('https://www.ica.se/recept/test-123/')).ingredientSections,
    ['Färs'],
  );
});

test('rejects deeply nested recipe sections before extracting their contents', () => {
  let instruction = { '@type': 'HowToStep', text: 'Cook.' };
  for (let i = 0; i < 40; i++)
    instruction = { '@type': 'HowToSection', itemListElement: [instruction] };
  assert.throws(
    () => parseRecipe(html(page, { ...schema, recipeInstructions: [instruction] }), sourceUrl),
    /too much data/,
  );
});

test('rejects excessively nested HTML before constructing the recipe DOM', () => {
  const wrapped = '<div>'.repeat(5000) + html() + '</div>'.repeat(5000);
  assert.throws(() => parseRecipe(wrapped, sourceUrl), /webpage is too complex/);
});

test('cannot bypass HTML depth limits with self-closing non-void tags', () => {
  const wrapped = '<div/>'.repeat(500) + html();
  assert.throws(() => parseRecipe(wrapped, sourceUrl), /webpage is too complex/);
});

test('rejects a very broad HTML DOM before building it', () => {
  const wrapped = '<span>x</span>'.repeat(20_001) + html();
  assert.throws(() => parseRecipe(wrapped, sourceUrl), /webpage is too complex/);
});

test('does not count HTML-like recipe text inside inert JSON as page elements', () => {
  const recipe = { ...schema, publisher: { name: '<div/>'.repeat(500) } };
  assert.equal(parseRecipe(html(page, recipe), sourceUrl).title, 'Testbiffar');
});

for (const labelSize of [250, 30000]) {
  test('bounds repeated extracted step sections with ' + labelSize + '-character labels', () => {
    let instruction = Array.from({ length: 500 }, () => ({ '@type': 'HowToStep', text: 'Cook.' }));
    for (let i = 0; i < 20; i++)
      instruction = {
        '@type': 'HowToSection',
        name: 'a'.repeat(labelSize),
        itemListElement: instruction,
      };
    assert.throws(
      () => parseRecipe(html(page, { ...schema, recipeInstructions: instruction }), sourceUrl),
      /too much data/,
    );
  });
}
