import * as cheerio from 'cheerio';

const text = value => typeof value === 'string'
  ? cheerio.load(value, null, false).root().text().replace(/\s+/g, ' ').trim()
  : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
const list = value => (Array.isArray(value) ? value : [value]).flatMap(v => text(v).split(/[,;]\s*/)).filter(Boolean);
const unique = values => [...new Map(values.map(v => [v.toLocaleLowerCase(), v])).values()];

// Durations are stored in minutes. A missing total is not inferred: resting time may differ.
function minutes(value) {
  if (typeof value !== 'string') return undefined;
  const m = value.match(/^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m || !m.slice(1).some(Boolean)) return undefined;
  const n = Number(m[1] || 0) * 10080 + Number(m[2] || 0) * 1440 + Number(m[3] || 0) * 60 + Number(m[4] || 0) + Number(m[5] || 0) / 60;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

function imageUrl(value, base) {
  for (const item of Array.isArray(value) ? value : [value]) {
    const candidates = typeof item === 'string' ? [item] : [item?.url, item?.contentUrl];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      try {
        const url = new URL(candidate, base);
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port) return url.href;
      } catch { /* Ignore malformed optional images. */ }
    }
  }
  return undefined;
}

export function extractInstructions(value, sourceUrl, section = '', result = []) {
  if (Array.isArray(value)) {
    value.forEach(item => extractInstructions(item, sourceUrl, section, result));
  } else if (typeof value === 'string') {
    if (text(value)) result.push({ text: text(value), section });
  } else if (value && typeof value === 'object') {
    const types = [value['@type']].flat();
    if (types.some(t => typeof t === 'string' && /(?:^|\/)HowToSection$/.test(t))) {
      extractInstructions(value.itemListElement, sourceUrl, [section, text(value.name)].filter(Boolean).join(' / '), result);
    } else if (text(value.text)) {
      result.push({text: text(value.text), section, title: text(value.name), imageUrl: imageUrl(value.image, sourceUrl)});
    } else if (value.itemListElement) {
      extractInstructions(value.itemListElement, sourceUrl, section, result);
    } else if (value.item) {
      extractInstructions(value.item, sourceUrl, section, result);
    } else if (text(value.name)) {
      result.push({ text: text(value.name), section, imageUrl: imageUrl(value.image, sourceUrl) });
    }
  }
  return result;
}

export function extractIngredients(value, section = '', result = []) {
  if (Array.isArray(value)) value.forEach(item => extractIngredients(item, section, result));
  else if (typeof value === 'string' && text(value)) result.push({text: text(value), section});
  else if (value && typeof value === 'object') {
    if (value.itemListElement) extractIngredients(value.itemListElement, text(value.name) || section, result);
    else if (value.item) extractIngredients(value.item, section, result);
    else {
      const label = [text(value.value), text(value.unitText), text(value.name)].filter(Boolean).join(' ');
      if (label) result.push({text: label, section});
    }
  }
  return result;
}

function yieldText(value) {
  return (Array.isArray(value) ? value : [value]).map(v => {
    if (!v || typeof v !== 'object') return text(v);
    const amount = v.value ?? (v.minValue != null && v.maxValue != null ? text(v.minValue) + '–' + text(v.maxValue) : undefined);
    return [text(amount), text(v.unitText || v.name)].filter(Boolean).join(' ');
  }).filter(Boolean).join(' / ');
}

function rating(value) {
  if (!value || typeof value !== 'object') return undefined;
  const number = v => typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN;
  const n = number(value.ratingValue);
  const best = value.bestRating == null ? 5 : number(value.bestRating);
  const worst = value.worstRating == null ? 1 : number(value.worstRating);
  if (![n, best, worst].every(Number.isFinite) || best <= worst || n < worst || n > best) return undefined;
  const result = { value: n, best, worst };
  for (const key of ['ratingCount', 'reviewCount']) {
    const count = number(value[key]);
    if (Number.isSafeInteger(count) && count >= 0) result[key] = count;
  }
  return result;
}

// Keep site-specific reads scoped to the recipe, never comments or related recipes.
function pageExtras($, sourceUrl, ingredients) {
  const result = {};
  const scope = $('[itemtype$="/Recipe"]').first();
  const prop = name => scope.find('[itemprop="' + name + '"]').first();
  const difficulty = prop('difficulty');
  result.difficulty = text(difficulty.attr('content') || difficulty.text()) || undefined;
  if (new URL(sourceUrl).hostname === 'www.ica.se') {
    result.dietaryNotes = text($('.ingredients-list-group-extra__card__ingr').first().html()) || undefined;
    const groups = [];
    let heading = '';
    $('.ingredients-list').first().find('h3, h4, .ingredients-list-group__card').each((_, el) => {
      if (/^h[34]$/.test(el.tagName)) heading = text($(el).text());
      else groups.push({ text: text($(el).text()), section: heading });
    });
    // Only attach headings when DOM and structured-data ingredient order agree.
    const comparable = s => s.replace(/\s+/g, '').toLocaleLowerCase();
    if (groups.length === ingredients.length && groups.every((g, i) => comparable(g.text) === comparable(ingredients[i].text))) {
      result.ingredientSections = groups.map(g => g.section);
    }
    const steps = $('.cooking-steps').first();
    const notes = [];
    steps.find('h2, h3, h4, strong').each((_, el) => {
      if (/^tips!?$/i.test(text($(el).text()))) {
        const content = $(el).nextAll('p').map((_, p) => text($(p).text())).get();
        notes.push(...content);
      }
    });
    if (notes.length) result.tips = unique(notes).join('\n\n');
  }
  return result;
}

export function extractMetadata(recipe, html, sourceUrl, ingredients, steps) {
  const $ = cheerio.load(html);
  const nutrition = {};
  for (const key of ['servingSize', 'calories', 'proteinContent', 'carbohydrateContent', 'fatContent', 'saturatedFatContent', 'unsaturatedFatContent', 'transFatContent', 'fiberContent', 'sugarContent', 'sodiumContent', 'cholesterolContent']) {
    const v = text(recipe.nutrition?.[key]);
    if (v) nutrition[key] = v;
  }
  const category = list(recipe.recipeCategory).join(', ');
  const cuisine = list(recipe.recipeCuisine).join(', ');
  const diet = list(recipe.suitableForDiet).map(v => v.replace(/^https?:\/\/schema.org\//, '').replace(/([a-z])([A-Z])/g, '$1 $2'));
  const extras = pageExtras($, sourceUrl, ingredients);
  return {
    description: text(recipe.description) || undefined,
    prepTime: minutes(recipe.prepTime), cookTime: minutes(recipe.cookTime), totalTime: minutes(recipe.totalTime),
    yieldText: yieldText(recipe.recipeYield) || undefined,
    category: category || undefined, cuisine: cuisine || undefined,
    tags: unique([...list(recipe.keywords), ...list(recipe.recipeCategory), ...list(recipe.recipeCuisine)]),
    nutrition: Object.keys(nutrition).some(k => k !== 'servingSize') ? nutrition : undefined,
    sourceRating: rating(recipe.aggregateRating),
    difficulty: text(recipe.difficulty) || extras.difficulty,
    tips: text(recipe.tips) || extras.tips,
    dietaryNotes: [extras.dietaryNotes, ...diet].filter(Boolean).join('\n') || undefined,
    ingredientSections: extras.ingredientSections || ingredients.map(i => i.section),
    stepDetails: steps.map(({section, title, imageUrl}) => ({section, title, imageUrl})),
  };
}
