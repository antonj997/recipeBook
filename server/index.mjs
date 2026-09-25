import express from 'express';
import * as cheerio from 'cheerio';

const app = express();

app.use(express.json({ limit: '8kb' }));

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
  '',
]);

const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Validate the destination before making a request.
function validateUrl(input) {
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

// Convert different instruction formats into strings.
function extractSteps(value) {
  if (Array.isArray(value)) {
    return value.flatMap(extractSteps);
  }

  if (typeof value === 'string') {
    const text = cleanText(value);
    return text ? [text] : [];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  if (value.itemListElement) {
    return extractSteps(value.itemListElement);
  }

  if (typeof value.text === 'string') {
    return extractSteps(value.text);
  }

  return [];
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
async function fetchHtml(url) {
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

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString('utf8');
}

// Angular sends a URL to this endpoint.
app.post('/api/import', async (req, res) => {
  let url;

  try {
    url = validateUrl(req.body?.url);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }

  let html;

  try {
    html = await fetchHtml(url);
  } catch (error) {
    console.error('Website fetch failed:', error);

    return res.status(502).json({
      error: 'Could not fetch the website. It may block requests or redirect to another URL.',
    });
  }

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
    return res.status(422).json({
      error: 'No structured recipe data was found.',
    });
  }

  const ingredients = Array.isArray(recipe.recipeIngredient)
    ? recipe.recipeIngredient.map(cleanText).filter(Boolean)
    : [];

  const instructions = extractSteps(recipe.recipeInstructions);

  const title = cleanText(recipe.name);

  if (!title || ingredients.length === 0 || instructions.length === 0) {
    return res.status(422).json({
      error: 'The website provided incomplete recipe data.',
    });
  }

  // Return a recipe draft.
  return res.json({
    imageUrl: extractRecipeImageUrl(recipe, html, url.toString()),
    title,
    servings: extractServings(recipe.recipeYield),
    ingredients,
    instructions,
    sourceUrl: url.toString(),
  });
});

// Keep the development API local to your computer.
app.listen(3000, '127.0.0.1', () => {
  console.log('Recipe importer running on http://127.0.0.1:3000');
});
