import * as cheerio from 'cheerio';
import { extractIngredients, extractInstructions, extractMetadata } from './recipe-metadata.mjs';

// Only these exact domains are permitted in this first version.
// Add domains here after reviewing them.
const allowedHosts = new Set([
  'www.ica.se',
  'www.koket.se',
  'www.arla.se',
  'www.cookwell.com',
  'www.elinaomickesmat.se',
  'recept.se',
  'www.kokaihop.se',
]);

const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Validate the destination before making a request.
export function validateUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) {
    throw new Error('Invalid URL.');
  }

  let url;

  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Only standard HTTPS URLs are supported.');
  }

  if (!allowedHosts.has(url.hostname)) {
    throw new Error('This website is not on the supported-sites list.');
  }

  url.hash = '';

  return url;
}

// Strip HTML markup and normalize whitespace.
function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const $ = cheerio.load(value, null, false);

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

function extractRecipeImageUrl(recipe, html, sourceUrl) {
  const $ = cheerio.load(html);

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

// Fetch a webpage, with a timeout and size limit.
export async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!/html/i.test(contentType)) {
    throw new Error('The URL did not return an HTML page.');
  }

  const declaredSize = Number(response.headers.get('content-length') ?? 0);

  if (declaredSize > MAX_HTML_BYTES) {
    throw new Error('The webpage is too large.');
  }

  if (!response.body) {
    throw new Error('The webpage returned no content.');
  }

  const reader = response.body.getReader();

  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    totalBytes += value.byteLength;

    if (totalBytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error('The webpage is too large.');
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

export function parseRecipe(html, url) {
  const $ = cheerio.load(html);

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

  const ingredientItems = extractIngredients(recipe.recipeIngredient);
  const stepItems = extractInstructions(recipe.recipeInstructions, url.toString());
  const ingredients = ingredientItems.map((item) => item.text);
  const instructions = stepItems.map((item) => item.text);
  const title = cleanText(recipe.name);

  if (!title || ingredients.length === 0 || instructions.length === 0) {
    throw new Error('The website provided incomplete recipe data.');
  }

  // Return a recipe draft.
  return {
    ...extractMetadata(recipe, html, url.toString(), ingredientItems, stepItems),
    imageUrl: extractRecipeImageUrl(recipe, html, url.toString()),
    title,
    servings: extractServings(recipe.recipeYield),
    ingredients,
    instructions,
    sourceUrl: url.toString(),
  };
}
