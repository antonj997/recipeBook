import type { Recipe } from './recipe.model';

type ParsedRecipe = Omit<Recipe, 'id'>;

const ingredientHeading =
  /^(ingredienser|ingredients?|du behöver|det här behöver du|you(?: will)? need)\s*:?$/i;
const stepHeading =
  /^(gör så här|så här gör du|instruktioner|instructions|method|directions|steps|tillagning|preparation|steg för steg)\s*:?$/i;
const stepLabel = /^(steg|step)\s*\d+\s*:?$/i;
// Bullets and list numbers; "1.5 dl" keeps its number because a space must follow the marker.
const marker = /^(?:[-•*–·]|\d+\s*[.)]|\d+\s*:)\s+/;
const quantity = /^(?:\d|[½¼¾⅓⅔⅛]|ca\.?\s|about\s|en nypa|a pinch)/i;
const unit =
  /^\S+\s+(?:g|kg|dl|cl|ml|l|msk|tsk|krm|st|förp|tbsp|tsp|cups?|oz|lb|klyftor|klyfta)\b/i;

/**
 * Turns a recipe pasted as plain text into a draft: the first line is the title, servings and
 * total time come from the lines below it, and ingredients and steps from their headings in
 * Swedish or English. Without headings, lines that start with an amount are ingredients and
 * sentences are steps. Short lines between blank lines in the ingredients become groups.
 */
export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());
  const first = lines.findIndex(Boolean);
  const title = first < 0 ? '' : clean(lines[first]!);
  let mode: 'header' | 'ingredients' | 'steps' = 'header';
  let headings = false;
  let section = '';
  let blankBefore = false;
  let servings: number | undefined;
  let totalTime: number | undefined;
  const header: string[] = [];
  const ingredients: string[] = [];
  const sections: string[] = [];
  const instructions: string[] = [];
  const addIngredient = (line: string) => {
    ingredients.push(line);
    sections.push(section);
  };

  for (const raw of first < 0 ? [] : lines.slice(first + 1)) {
    if (!raw) {
      blankBefore = true;
      continue;
    }
    const line = clean(raw);
    if (ingredientHeading.test(raw)) {
      [mode, section, headings] = ['ingredients', '', true];
    } else if (stepHeading.test(raw)) {
      [mode, headings] = ['steps', true];
    } else if (mode === 'header') {
      const people = readServings(raw);
      const minutes = readTime(raw);
      if (people !== undefined || minutes !== undefined) {
        servings ??= people;
        totalTime ??= minutes;
      } else header.push(line);
    } else if (mode === 'ingredients') {
      // A sentence after the list means the steps began without a heading of their own.
      if (isSentence(line) && !looksLikeIngredient(line)) {
        mode = 'steps';
        instructions.push(line);
      } else if (isGroupHeading(raw, blankBefore && ingredients.length > 0)) {
        section = raw.replace(/:$/, '').trim();
      } else addIngredient(line);
    } else if (!stepLabel.test(raw)) instructions.push(line);
    blankBefore = false;
  }

  let description = header;
  if (!headings) {
    // No headings: amounts make ingredients, sentences make steps.
    description = [];
    for (const line of header) {
      if (looksLikeIngredient(line) && !instructions.length) addIngredient(line);
      else if (ingredients.length || isSentence(line)) instructions.push(line);
      else description.push(line);
    }
  }
  if (!title || !ingredients.length || !instructions.length)
    throw new Error('Paste the whole recipe, with its ingredients and steps.');
  return {
    title,
    ...(description.length ? { description: description.join('\n') } : {}),
    ...(servings ? { servings } : {}),
    ...(totalTime ? { totalTime } : {}),
    ingredients,
    ...(sections.some(Boolean) ? { ingredientSections: sections } : {}),
    instructions,
  };
}

function clean(line: string): string {
  return line.replace(marker, '').trim();
}

function looksLikeIngredient(line: string): boolean {
  return quantity.test(line) || unit.test(line);
}

function isSentence(line: string): boolean {
  return /[.!?]$/.test(line) || line.split(/\s+/).length >= 6;
}

function isGroupHeading(raw: string, afterBlank: boolean): boolean {
  if (marker.test(raw) || quantity.test(raw)) return false;
  const words = raw.split(/\s+/).length;
  return (raw.endsWith(':') && words <= 4) || (afterBlank && words <= 3 && !/[.,]/.test(raw));
}

function readServings(line: string): number | undefined {
  const match =
    /(\d+)\s*(?:portioner|portion|port\.?|personer|pers\.?|servings?|portions?)\b/i.exec(line) ??
    /\b(?:serves|för|makes|yield:?)\s+(\d+)/i.exec(line);
  return match ? Number(match[1]) : undefined;
}

function readTime(line: string): number | undefined {
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?|tim(?:me|mar)?)\b/i.exec(line);
  const minutes = /(\d+)\s*(?:min|mins|minutes?|minuter)\b/i.exec(line);
  if (!hours && !minutes) return undefined;
  return Math.round(
    (hours ? Number(hours[1]!.replace(',', '.')) * 60 : 0) + (minutes ? Number(minutes[1]) : 0),
  );
}
