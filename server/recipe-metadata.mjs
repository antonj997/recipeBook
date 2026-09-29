import * as cheerio from 'cheerio';

const text = (value) =>
  typeof value === 'string'
    ? cheerio
        .load(value.replace(/<br\b[^>]*>|<\/p>/gi, ' '), null, false)
        .root()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';
const list = (value) =>
  (Array.isArray(value) ? value : [value]).flatMap((v) => text(v).split(/[,;]\s*/)).filter(Boolean);
const unique = (values) => [...new Map(values.map((v) => [v.toLocaleLowerCase(), v])).values()];

// Durations are stored in minutes. A missing total is not inferred: resting time may differ.
function minutes(value) {
  if (typeof value !== 'string') return undefined;
  const m = value.match(
    /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (!m || !m.slice(1).some(Boolean)) return undefined;
  const n =
    Number(m[1] || 0) * 10080 +
    Number(m[2] || 0) * 1440 +
    Number(m[3] || 0) * 60 +
    Number(m[4] || 0) +
    Number(m[5] || 0) / 60;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

function imageUrl(value, base) {
  for (const item of Array.isArray(value) ? value : [value]) {
    const candidates = typeof item === 'string' ? [item] : [item?.url, item?.contentUrl];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      try {
        const url = new URL(candidate, base);
        if (url.protocol === 'https:' && !url.username && !url.password && !url.port)
          return url.href;
      } catch {
        /* Ignore malformed optional images. */
      }
    }
  }
  return undefined;
}

export function extractInstructions(value, sourceUrl, section = '', result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => extractInstructions(item, sourceUrl, section, result));
  } else if (typeof value === 'string') {
    if (text(value)) result.push({ text: text(value), section });
  } else if (value && typeof value === 'object') {
    const types = [value['@type']].flat();
    if (types.some((t) => typeof t === 'string' && /(?:^|\/)HowToSection$/.test(t))) {
      extractInstructions(
        value.itemListElement,
        sourceUrl,
        [section, text(value.name)].filter(Boolean).join(' / '),
        result,
      );
    } else if (text(value.text)) {
      result.push({
        text: text(value.text),
        section,
        imageUrl: imageUrl(value.image, sourceUrl),
      });
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
  if (Array.isArray(value)) value.forEach((item) => extractIngredients(item, section, result));
  else if (typeof value === 'string' && text(value)) result.push({ text: text(value), section });
  else if (value && typeof value === 'object') {
    if (value.itemListElement)
      extractIngredients(value.itemListElement, text(value.name) || section, result);
    else if (value.item) extractIngredients(value.item, section, result);
    else {
      const label = [text(value.value), text(value.unitText), text(value.name)]
        .filter(Boolean)
        .join(' ');
      if (label) result.push({ text: label, section });
    }
  }
  return result;
}

// Keep site-specific reads scoped to the recipe, never comments or related recipes.
function perPortionNutrition(source) {
  const basis = text(source?.servingSize);
  // Do not relabel per-100g or whole-recipe values as a portion.
  if (basis && !/per portion|per serving|per port|^1\s*(serving|portion)|^one serving/i.test(basis))
    return undefined;
  const result = { servingSize: 'Per portion' };
  for (const key of ['calories', 'proteinContent', 'carbohydrateContent', 'fatContent']) {
    const raw = text(source?.[key]).replace(/,/g, '.');
    let match = raw.match(
      key === 'calories' ? /(\d+(?:\.\d+)?)\s*(?:kcal|calories)/i : /(\d+(?:\.\d+)?)\s*g\b/i,
    );
    let amount = match ? Number(match[1]) : undefined;
    if (amount === undefined && key === 'calories') {
      match = raw.match(/(\d+(?:\.\d+)?)\s*kj/i);
      if (match) amount = Math.round(Number(match[1]) / 4.184);
    }
    if (amount === undefined && /^\d+(?:\.\d+)?$/.test(raw)) amount = Number(raw);
    if (amount !== undefined) result[key] = amount + (key === 'calories' ? ' kcal' : ' g');
  }
  return Object.keys(result).length > 1 ? result : undefined;
}

function pageExtras($, sourceUrl, ingredients) {
  const result = {};
  if (new URL(sourceUrl).hostname === 'www.ica.se') {
    const tips = [],
      dietary = [];
    $('.ingredients-list-group-extra').each((_, el) => {
      const heading = text($(el).find('.accordion__label__title__text__title').first().text());
      const body = text($(el).find('.ingredients-list-group-extra__card__ingr').first().html());
      if (!body) return;
      if (/^tips$/i.test(heading)) tips.push(body);
      if (/^(för alla|klimatanpassa)$/i.test(heading)) dietary.push(heading + ': ' + body);
    });
    result.tips = tips.join('\n\n') || undefined;
    result.dietaryNotes = dietary.join('\n\n') || undefined;
    const health = $('.health-section').first();
    const serving = text(health.find('h2').first().text());
    if (serving) {
      result.nutrition = {
        servingSize: [serving, text(health.find('.tooltip-text').text())]
          .filter(Boolean)
          .join('. '),
      };
      const names = {
        Energi: 'calories',
        Fett: 'fatContent',
        Salt: 'saltContent',
        Kolhydrater: 'carbohydrateContent',
        Protein: 'proteinContent',
      };
      health.find('.health-section__wrapper').each((_, el) => {
        const key = names[text($(el).find('.health-section__type').text())];
        const value = text($(el).children('span').last().text());
        if (key && value) result.nutrition[key] = value;
      });
    }
    const groups = [];
    let heading = '';
    $('.ingredients-list')
      .first()
      .find('h3, h4, .ingredients-list-group__card')
      .each((_, el) => {
        if (/^h[34]$/.test(el.tagName)) heading = text($(el).text());
        else groups.push({ text: text($(el).text()), section: heading });
      });
    // Only attach headings when DOM and structured-data ingredient order agree.
    const comparable = (s) => s.replace(/\s+/g, '').toLocaleLowerCase();
    if (
      groups.length === ingredients.length &&
      groups.every((g, i) => comparable(g.text) === comparable(ingredients[i].text))
    ) {
      result.ingredientSections = groups.map((g) => g.section);
    }
    const steps = $('.cooking-steps').first();
    const notes = [];
    steps.find('h2, h3, h4, strong').each((_, el) => {
      if (/^tips!?$/i.test(text($(el).text()))) {
        const content = $(el)
          .nextAll('p')
          .map((_, p) => text($(p).text()))
          .get();
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
  for (const key of [
    'servingSize',
    'calories',
    'proteinContent',
    'carbohydrateContent',
    'fatContent',
  ]) {
    const v = text(recipe.nutrition?.[key]);
    if (v) nutrition[key] = v;
  }
  const category = list(recipe.recipeCategory).join(', ');
  const cuisine = list(recipe.recipeCuisine).join(', ');
  const diet = list(recipe.suitableForDiet).map((v) =>
    v.replace(/^https?:\/\/schema.org\//, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
  );
  const extras = pageExtras($, sourceUrl, ingredients);
  return {
    description:
      unique(
        [
          text(recipe.description),
          text(recipe.tips) || extras.tips,
          text(recipe.substitutions),
          extras.dietaryNotes,
        ].filter(Boolean),
      ).join('\n\n') || undefined,
    totalTime: minutes(recipe.totalTime),
    category: category || undefined,
    cuisine: cuisine || undefined,
    tags: unique(list(recipe.keywords)),
    nutrition: perPortionNutrition(extras.nutrition || nutrition),
    dietaryNotes: [...diet, text(recipe.dietaryNotes)].filter(Boolean).join('\n') || undefined,
    ingredientSections: extras.ingredientSections || ingredients.map((i) => i.section),
    stepDetails: steps.map(({ section, imageUrl }) => ({ section, imageUrl })),
  };
}
