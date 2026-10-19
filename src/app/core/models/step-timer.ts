import type { Recipe } from './recipe.model';

import { instructionText, isStepTimerSeconds } from './recipe-metadata';
export { isStepTimerSeconds, maxStepTimerSeconds } from './recipe-metadata';
export interface StepTimerTarget {
  key: string;
  recipeId: string;
  index: number;
  seconds: number;
}

export function recipeStepTimers(recipe: Recipe): (StepTimerTarget | undefined)[] {
  return recipe.instructions.map((rawText, index) => {
    const text = instructionText(rawText, recipe.stepDetails?.[index]);
    const seconds = resolveStepTimer(text, recipe.stepDetails?.[index]?.timerSeconds);
    if (!seconds) return undefined;
    // Local identity, not a security hash. Edits must not resume an obsolete countdown.
    let hash = 2166136261;
    for (const char of JSON.stringify([text, recipe.stepDetails?.[index]?.section, seconds]))
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return {
      key: JSON.stringify([recipe.id, index, hash >>> 0]),
      recipeId: recipe.id,
      index,
      seconds,
    };
  });
}

const amount = '(?:\\d+(?:[.,]\\d+)?|en|ett|one|a|an)';
const duration = new RegExp(
  '\\b(' +
    amount +
    ')(?:\\s*(?:[-–—]|to|till)\\s*(' +
    amount +
    '))?\\s*(halvtimme|kvart(?:ar)?|minutes?|minut(?:er)?|mins?|min|timmar?|timme|hours?|hrs?|h|sekund(?:er)?|sek|seconds?|secs?|s|days?|dag(?:ar)?)\\b',
  'giu',
);
const cooking =
  /\b(?:cook|bake|roast|boil|simmer|fry|saute|sauté|grill|steam|microwave|chill|refrigerate|freeze|marinate|rest|rise|proof|soak|stir|whisk|knead|heat|wait|cool|leave|set aside|ferment|sjud|stek|baka|grädda|rosta|koka|tillaga|ugn|mikra|värm|vila|jäs|kyl|frys|marinera|blötlägg|rör|vispa|knåda|svalna|dra|stå|låt)[\p{L}]*\b/iu;
const notCountdown =
  /\b(?:up to|at most|no more than|upp till|högst|maximalt|within|inom|takes?|tar totalt|receptet tar|keeps?|förvar[\p{L}]*|hållbar[\p{L}]*|in advance)\b/iu;

/** First explicit cooking/waiting interval. Ranges use their lower bound for an early check. */
export function detectStepTimer(instruction: string): number | undefined {
  const text = instruction
    .slice(0, 20_000)
    .toLocaleLowerCase()
    .replace(/(\d+\s*)?([¼½¾])/g, (_, whole: string | undefined, fraction: string) =>
      String(Number(whole ?? 0) + ({ '¼': 0.25, '½': 0.5, '¾': 0.75 }[fraction] ?? 0)),
    )
    .replace(
      /\b(?:(\d+)\s+)?(\d+)\s*[/⁄]\s*(\d+)\b/g,
      (_, whole: string | undefined, numerator: string, denominator: string) =>
        Number(denominator) > 0
          ? String(Number(whole ?? 0) + Number(numerator) / Number(denominator))
          : 'invalid duration',
    )
    .replace(/\b(?:one and a half|en och en halv|ett och ett halvt)\b/g, '1.5')
    .replace(/\b(ca|c:a|approx)\./g, '$1')
    .replace(/\b(?:half an?|en halv|ett halvt)\b/g, '0.5');
  const matches = [...text.matchAll(duration)];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const before =
      text
        .slice(Math.max(0, match.index - 160), match.index)
        .split(/[.!?;\n]/)
        .at(-1) ?? '';
    const after = text
      .slice(match.index + match[0].length, match.index + match[0].length + 100)
      .split(/[.!?;\n]/)[0];
    if (
      notCountdown.test(before) ||
      /\b(?:before\s+(?:cook|bak|fry|start)[\p{L}]*|innan\s+(?:du|tillag|stek|kok)[\p{L}]*|in advance)\b/iu.test(
        after,
      )
    )
      continue;
    if (
      !cooking.test(before) &&
      !/^(?:\s*(?:i|in|on|på|the|en|ett))*\s*(?:ugn|oven|microwave)/iu.test(after)
    )
      continue;
    let seconds = value(match) * unit(match[3]);
    const next = matches[index + 1];
    if (
      next &&
      unit(next[3]) < unit(match[3]) &&
      /^\s*(?:(?:and|och)\s*)?$/.test(text.slice(match.index + match[0].length, next.index))
    )
      seconds += value(next) * unit(next[3]);
    seconds = Math.round(seconds);
    if (isStepTimerSeconds(seconds)) return seconds;
  }
  return undefined;
}

function value(match: RegExpMatchArray): number {
  const number = (value: string) => (/^\d/.test(value) ? Number(value.replace(',', '.')) : 1);
  return match[2] ? Math.min(number(match[1]), number(match[2])) : number(match[1]);
}
function unit(value: string): number {
  if (/^halv/.test(value)) return 1800;
  if (/^kvart/.test(value)) return 900;
  if (/^(?:h|tim)/.test(value)) return 3600;
  if (/^da/.test(value)) return 86400;
  return /^(?:s|sek)/.test(value) ? 1 : 60;
}

/** undefined means automatic, null is a deliberate opt-out that must survive sync/backups. */
export function resolveStepTimer(text: string, override?: number | null): number | undefined {
  if (override === undefined) return detectStepTimer(text);
  return isStepTimerSeconds(override) ? override : undefined;
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, '0');
  return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + rest : minutes + ':' + rest;
}
