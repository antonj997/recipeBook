import { hasPhoto, type PhotoRef } from './recipe-image';
import { msg } from '../i18n/i18n';
export const recipeColors = [
  { id: 'beige', label: msg('Oat') },
  { id: 'butter', label: msg('Butter') },
  { id: 'clay', label: msg('Apricot') },
  { id: 'peach', label: msg('Peach') },
  { id: 'rose', label: msg('Rhubarb') },
  { id: 'accent', label: msg('Lavender') },
  { id: 'sage', label: msg('Sage') },
  { id: 'green', label: msg('Pistachio') },
  { id: 'mint', label: msg('Mint') },
  { id: 'blue', label: msg('Duck egg') },
] as const;
// Keep older Sky choices valid in local storage, cloud records and backups.
export type RecipeColor = (typeof recipeColors)[number]['id'] | 'sky';
export function isRecipeColor(value: unknown): value is RecipeColor {
  return value === 'sky' || recipeColors.some((color) => color.id === value);
}
export function recipeColorBackground(color: RecipeColor): string {
  return 'var(--recipe-color-' + (color === 'sky' ? 'blue' : color) + ')';
}
function hash(seed: string): number {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function defaultRecipeColor(seed: string, photo = false): RecipeColor {
  return recipeColors[hash((photo ? 'card:' : 'color:') + seed) % recipeColors.length].id;
}
export function recipeBackground(recipe: { id: string; color?: RecipeColor } & PhotoRef): string {
  return recipeColorBackground(
    isRecipeColor(recipe.color) ? recipe.color : defaultRecipeColor(recipe.id, hasPhoto(recipe)),
  );
}
