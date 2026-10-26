import { loadRecipeHtml } from './recipe-html.mjs';
import { extractIngredients, extractInstructions, extractMetadata } from './recipe-metadata.mjs';

export { validatePublicUrl as validateUrl } from './public-url.mjs';

// Strip HTML markup and normalize whitespace.
function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const $ = loadRecipeHtml(value, true);

  return $.root().text().replace(/\s+/g, ' ').trim();
}

// Find a Recipe object in JSON-LD.
function findRecipe(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const recipe = findRecipe(item);
      if (recipe) return recipe;
    }

    return null;
  }

  if (!data || typeof data !== 'object') {
    return null;
  }

  const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];

  const isRecipe = types.some(
    (type) =>
      type === 'Recipe' ||
      type === 'https://schema.org/Recipe' ||
      type === 'http://schema.org/Recipe',
  );

  if (isRecipe) {
    return data;
  }

  return findRecipe(data['@graph']) || findRecipe(data.mainEntity);
}

// Convert recipeYield into a number.
function extractServings(value) {
  const first = Array.isArray(value) ? value[0] : value;

  const raw = first && typeof first === 'object' ? first.value : first;

  const match = String(raw ?? '').match(/\d+/);

  return match ? Math.max(1, Number(match[0])) : 4;
}

function extractRecipeImageUrl(recipe, $, sourceUrl) {
  // JSON-LD images can be strings, objects or arrays.
  const images = Array.isArray(recipe.image) ? recipe.image : [recipe.image];

  const candidates = [];

  for (const image of images) {
    if (typeof image === 'string') {
      candidates.push(image);
    } else if (image && typeof image === 'object') {
      candidates.push(image.url, image.contentUrl);
    }
  }

  // Fallback: the image used when sharing the webpage.
  candidates.push($('meta[property="og:image"]').attr('content'));

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) {
      continue;
    }

    try {
      // Handles both absolute and relative image URLs.
      const imageUrl = new URL(candidate, sourceUrl);

      if (
        imageUrl.protocol !== 'https:' ||
        imageUrl.username ||
        imageUrl.password ||
        imageUrl.port
      ) {
        continue;
      }

      imageUrl.hash = '';

      return imageUrl.toString();
    } catch {
      // Ignore malformed image URLs and try the next candidate.
    }
  }

  return undefined;
}

// Bound nested structured data before HTML-cleaning every ingredient or step.
function assertRecipeSize(recipe) {
  const pending = [[recipe, 0]];
  let count = 0;
  let characters = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    if (typeof value === 'string') characters += value.length;
    if (characters > 256 * 1024)
      throw new Error('The recipe contains too much data to import safely.');
    if (++count > 10_000 || depth > 32 || (typeof value === 'string' && value.length > 32_000))
      throw new Error('The recipe contains too much data to import safely.');
    if (value && typeof value === 'object') {
      const values = Object.values(value);
      if (values.length + pending.length > 10_000)
        throw new Error('The recipe contains too much data to import safely.');
      for (const child of values) pending.push([child, depth + 1]);
    }
  }
}

export function parseRecipe(html, url) {
  const $ = loadRecipeHtml(html);

  let recipe = null;

  // Search every JSON-LD script on the page.
  $('script[type="application/ld+json"]').each((_, element) => {
    if (recipe) return;

    const json = $(element).html();

    if (!json) return;

    try {
      const data = JSON.parse(json);
      recipe = findRecipe(data);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  if (!recipe) {
    throw new Error('No structured recipe data was found.');
  }

  assertRecipeSize(recipe);
  const ingredientItems = extractIngredients(recipe.recipeIngredient);
  const stepItems = extractInstructions(recipe.recipeInstructions, url.toString());
  const ingredients = ingredientItems.map((item) => item.text);
  const instructions = stepItems.map((item) => item.text);
  const title = cleanText(recipe.name);

  if (
    title.length > 1000 ||
    ingredients.length > 500 ||
    instructions.length > 500 ||
    [...ingredients, ...instructions].some((value) => value.length > 16000)
  ) {
    throw new Error('The recipe contains too much data to import safely.');
  }

  if (!title || ingredients.length === 0 || instructions.length === 0) {
    throw new Error('The website provided incomplete recipe data.');
  }

  // Revalidate the extracted result: nested section labels are repeated for
  // every step and must not amplify a small source into a huge JSON response.
  const draft = {
    ...extractMetadata(recipe, $, url.toString(), ingredientItems, stepItems),
    imageUrl: extractRecipeImageUrl(recipe, $, url.toString()),
    title,
    servings: extractServings(recipe.recipeYield),
    ingredients,
    instructions,
    sourceUrl: url.toString(),
  };
  assertRecipeSize(draft);
  return draft;
}
