export const nutritionFields = [
  { key: 'servingSize', label: 'Serving basis' },
  { key: 'calories', label: 'Energy' },
  { key: 'proteinContent', label: 'Protein' },
  { key: 'carbohydrateContent', label: 'Carbohydrates' },
  { key: 'fatContent', label: 'Fat' },
  { key: 'saturatedFatContent', label: 'Saturated fat' },
  { key: 'unsaturatedFatContent', label: 'Unsaturated fat' },
  { key: 'transFatContent', label: 'Trans fat' },
  { key: 'fiberContent', label: 'Fibre' },
  { key: 'sugarContent', label: 'Sugar' },
  { key: 'sodiumContent', label: 'Sodium' },
  { key: 'cholesterolContent', label: 'Cholesterol' },
] as const;

export type RecipeNutrition = Partial<Record<(typeof nutritionFields)[number]['key'], string>>;
export interface RecipeStepDetail {
  section?: string;
  title?: string;
  imageUrl?: string;
  imageDataUrl?: string;
}
export interface RecipeSourceRating {
  value: number;
  best: number;
  worst: number;
  ratingCount?: number;
  reviewCount?: number;
}
export interface RecipeMetadata {
  description?: string;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  yieldText?: string;
  category?: string;
  cuisine?: string;
  tags?: string[];
  difficulty?: string;
  tips?: string;
  dietaryNotes?: string;
  nutrition?: RecipeNutrition;
  sourceRating?: RecipeSourceRating;
  // One entry per ingredient/step keeps the original string arrays compatible.
  ingredientSections?: string[];
  stepDetails?: RecipeStepDetail[];
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function isRecipeImage(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1_500_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Shared by import review and backup restoration. Never spread untrusted fields into a recipe.
export function readRecipeMetadata(value: unknown, strict = false): RecipeMetadata {
  const result: RecipeMetadata = {};
  if (!object(value)) return result;
  const invalid = () => { if (strict) throw new Error('The backup contains invalid recipe details.'); };
  for (const key of ['description','yieldText','category','cuisine','difficulty','tips','dietaryNotes'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (typeof v === 'string') result[key] = v.trim() || undefined;
    else invalid();
  }
  for (const key of ['prepTime','cookTime','totalTime'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) result[key] = v;
    else invalid();
  }
  for (const key of ['tags','ingredientSections'] as const) {
    const v = value[key];
    if (v == null) continue;
    if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
      result[key] = v.map(x => x.trim());
      if (key === 'ingredientSections' && Array.isArray(value['ingredients']) && v.length !== value['ingredients'].length) {
        delete result[key]; invalid();
      }
    } else invalid();
  }
  const nutrition = value['nutrition'];
  if (nutrition != null) {
    if (object(nutrition)) {
      result.nutrition = {};
      for (const {key} of nutritionFields) {
        const v = nutrition[key];
        if (v == null) continue;
        if (typeof v === 'string') { if (v.trim()) result.nutrition[key] = v.trim(); }
        else invalid();
      }
      if (!Object.keys(result.nutrition).length) delete result.nutrition;
    } else invalid();
  }
  const rating = value['sourceRating'];
  if (rating != null) {
    if (object(rating) && typeof rating['value'] === 'number' && typeof rating['best'] === 'number' && typeof rating['worst'] === 'number' &&
      [rating['value'], rating['best'], rating['worst']].every(Number.isFinite) && rating['best'] > rating['worst'] && rating['value'] >= rating['worst'] && rating['value'] <= rating['best']) {
      result.sourceRating = {value: rating['value'], best: rating['best'], worst: rating['worst']};
      for (const key of ['ratingCount', 'reviewCount'] as const) {
        const v = rating[key];
        if (v == null) continue;
        if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) result.sourceRating[key] = v;
        else invalid();
      }
    } else invalid();
  }
  const steps = value['stepDetails'];
  if (steps != null) {
    if (Array.isArray(steps) && steps.every(object) && (!Array.isArray(value['instructions']) || steps.length === value['instructions'].length)) {
      result.stepDetails = steps.map(step => {
        const detail: RecipeStepDetail = {};
        for (const key of ['section','title'] as const) {
          if (step[key] == null) continue;
          if (typeof step[key] === 'string') detail[key] = step[key].trim() || undefined;
          else invalid();
        }
        if (step['imageUrl'] != null) { if (isHttpsUrl(step['imageUrl'])) detail.imageUrl = step['imageUrl']; else invalid(); }
        if (step['imageDataUrl'] != null) { if (isRecipeImage(step['imageDataUrl'])) detail.imageDataUrl = step['imageDataUrl']; else invalid(); }
        return detail;
      });
    } else invalid();
  }
  return result;
}

export function formatRecipeTime(minutes: number): string {
  if (minutes < 1) return Math.round(minutes * 60) + ' sec';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) * 100) / 100;
  return [hours ? hours + ' hr' : '', rest ? rest + ' min' : ''].filter(Boolean).join(' ');
}
