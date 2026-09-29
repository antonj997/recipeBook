import { RECIPE_TAGS } from './recipe-tag.model';
export const nutritionFields = [
  { key: 'calories', label: 'Energy', unit: 'kcal' },
  { key: 'proteinContent', label: 'Protein', unit: 'g' },
  { key: 'carbohydrateContent', label: 'Carbs', unit: 'g' },
  { key: 'fatContent', label: 'Fat', unit: 'g' },
] as const;

export type RecipeNutrition = Partial<Record<(typeof nutritionFields)[number]['key'], string>> & {
  servingSize?: string;
};
export interface RecipeStepDetail {
  section?: string;
  title?: string;
  imageUrl?: string;
  imageDataUrl?: string;
}
export interface RecipeMetadata {
  description?: string;
  totalTime?: number;
  // Accepted from import drafts and older saves; collections replace these fields when saved.
  category?: string;
  cuisine?: string;
  tags?: string[];
  dietaryNotes?: string;
  nutrition?: RecipeNutrition;
  // One entry per ingredient/step keeps the original string arrays compatible.
  ingredientSections?: string[];
  stepDetails?: RecipeStepDetail[];
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}
export function isRecipeImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 1_500_000 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Shared by import review and backup restoration. Never spread untrusted fields into a recipe.
export function readRecipeMetadata(value: unknown, strict = false): RecipeMetadata {
  const result: RecipeMetadata = {};
  if (!object(value)) return result;
  const invalid = () => {
    if (strict) throw new Error('The backup contains invalid recipe details.');
  };
  for (const key of ['description'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (typeof v === 'string') result[key] = v.trim() || undefined;
    else invalid();
  }
  for (const key of ['totalTime'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) result[key] = v;
    else invalid();
  }
  for (const key of ['tags', 'ingredientSections'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      result[key] = v.map((x) => x.trim());
      if (
        key === 'ingredientSections' &&
        Array.isArray(value['ingredients']) &&
        v.length !== value['ingredients'].length
      ) {
        delete result[key];
        invalid();
      }
    } else invalid();
  }
  const nutrition = value['nutrition'];
  if (nutrition != null) {
    if (object(nutrition)) {
      result.nutrition = {};
      for (const { key } of nutritionFields) {
        const v = nutrition[key];
        if (v == null) continue;
        if (typeof v === 'string') {
          if (v.trim()) result.nutrition[key] = v.trim();
        } else invalid();
      }
      result.nutrition = perPortionNutrition(nutrition);
    } else invalid();
  }
  const steps = value['stepDetails'];
  if (steps != null) {
    if (
      Array.isArray(steps) &&
      steps.every(object) &&
      (!Array.isArray(value['instructions']) || steps.length === value['instructions'].length)
    ) {
      result.stepDetails = steps.map((step) => {
        const detail: RecipeStepDetail = {};
        for (const key of ['section', 'title'] as const) {
          if (step[key] == null) continue;
          if (typeof step[key] === 'string') detail[key] = step[key].trim() || undefined;
          else invalid();
        }
        if (step['imageUrl'] != null) {
          if (isHttpsUrl(step['imageUrl'])) detail.imageUrl = step['imageUrl'];
          else invalid();
        }
        if (step['imageDataUrl'] != null) {
          if (isRecipeImage(step['imageDataUrl'])) detail.imageDataUrl = step['imageDataUrl'];
          else invalid();
        }
        return detail;
      });
    } else invalid();
  }
  result.description = combinedDescription(value);
  result.tags = metadataTags(value);
  return result;
}

export function combinedDescription(value: unknown): string | undefined {
  if (!object(value)) return undefined;
  const description = typeof value['description'] === 'string' ? value['description'].trim() : '';
  const tips = typeof value['tips'] === 'string' ? value['tips'].trim() : '';
  const substitutions =
    typeof value['substitutions'] === 'string' ? value['substitutions'].trim() : '';
  const oldNotes =
    typeof value['dietaryNotes'] === 'string' &&
    /substitut|replace|swap|byt ut|ersätt|för alla|klimatanpassa/i.test(value['dietaryNotes'])
      ? value['dietaryNotes'].trim()
      : '';
  return (
    [description, tips, substitutions, oldNotes]
      .filter(
        (part, index, all) =>
          part && !all.slice(0, index).some((previous) => previous.includes(part)),
      )
      .join('\n\n') || undefined
  );
}

export function perPortionNutrition(value: unknown): RecipeNutrition | undefined {
  if (!object(value)) return undefined;
  const basis = typeof value['servingSize'] === 'string' ? value['servingSize'] : '';
  if (basis && !/per portion|per serving|per port|^1\s*(serving|portion)|^one serving/i.test(basis))
    return undefined;
  const result: RecipeNutrition = { servingSize: 'Per portion' };
  for (const { key, unit } of nutritionFields) {
    const raw = typeof value[key] === 'string' ? value[key].replace(/,/g, '.') : '';
    let match = raw.match(
      key === 'calories' ? /(\d+(?:\.\d+)?)\s*(?:kcal|calories)/i : /(\d+(?:\.\d+)?)\s*g\b/i,
    );
    let amount = match ? Number(match[1]) : undefined;
    if (amount === undefined && key === 'calories') {
      match = raw.match(/(\d+(?:\.\d+)?)\s*kj/i);
      if (match) amount = Math.round(Number(match[1]) / 4.184);
    }
    if (amount === undefined && /^\d+(?:\.\d+)?$/.test(raw)) amount = Number(raw);
    if (amount !== undefined) result[key] = amount + ' ' + unit;
  }
  return Object.keys(result).length > 1 ? result : undefined;
}

export function formatRecipeTime(minutes: number): string {
  if (minutes < 1) return Math.round(minutes * 60) + ' sec';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) * 100) / 100;
  return [hours ? hours + ' hr' : '', rest ? rest + ' min' : ''].filter(Boolean).join(' ');
}

const tagKey = (value: string) =>
  value
    .replace(/^https?:\/\/schema.org\//i, '')
    .replace(/diet$/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLocaleLowerCase();
export function metadataTags(value: unknown): string[] {
  if (!object(value)) return [];
  const aliases: Record<string, string> = {
    vegetarisk: 'vegetarian',
    vegetariskt: 'vegetarian',
    vegansk: 'vegan',
    veganskt: 'vegan',
    glutenfri: 'glutenfree',
    glutenfritt: 'glutenfree',
    mjölkfri: 'dairyfree',
    mjölkfritt: 'dairyfree',
    italiensk: 'italian',
    italienskt: 'italian',
    svensk: 'swedish',
    svenskt: 'swedish',
    mexikansk: 'mexican',
    mexikanskt: 'mexican',
    indisk: 'indian',
    indiskt: 'indian',
    japansk: 'japanese',
    japanskt: 'japanese',
  };
  const tags = Array.isArray(value['tags'])
    ? value['tags']
        .filter((v): v is string => typeof v === 'string' && !!v.trim())
        .map((v) => v.trim())
    : [];
  const candidates = [value['cuisine'], value['dietaryNotes']].flatMap((v) =>
    typeof v === 'string' ? v.split(/[,;\n]/) : [],
  );
  for (const candidate of candidates) {
    const key = tagKey(candidate);
    const match = RECIPE_TAGS.find((tag) => tagKey(tag.label) === (aliases[key] ?? key));
    if (match) tags.push(match.label);
  }
  return [...new Map(tags.map((tag) => [tag.toLocaleLowerCase(), tag])).values()];
}
export function instructionText(text: string, detail?: RecipeStepDetail): string {
  const title = detail?.title?.trim();
  return title && !text.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())
    ? title + ': ' + text
    : text;
}
