const unicodeFractions: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
};
const fractionCharacters = Object.keys(unicodeFractions).join('');
const quantityPattern = `(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[${fractionCharacters}]|[${fractionCharacters}]|\\d+(?:[.,]\\d+)?|[.,]\\d+)`;
const leadingQuantity = new RegExp(
  `^(\\s*(?:(?:ca\\.?|circa|about|approx(?:imately)?\\.?|ungefär)\\s+|[~≈]\\s*)?)(${quantityPattern})(?:(\\s*[-–—]\\s*)(${quantityPattern}))?`,
  'i',
);
const attachedUnit = /^(?:kg|mg|g|ml|cl|dl|l|oz|lbs?|tsp|tbsp|cups?)\b|^x\s*\d/i;
const unsafeRemainder = new RegExp(`^[\\d.,/⁄–—${fractionCharacters}-]`);

/** Scale only an explicit leading amount; all remaining ingredient text stays verbatim. */
export function scaleIngredient(
  ingredient: string,
  baseServings: number,
  selectedServings: number,
): string {
  if (
    baseServings === selectedServings ||
    !Number.isSafeInteger(baseServings) ||
    baseServings <= 0 ||
    !Number.isSafeInteger(selectedServings) ||
    selectedServings <= 0
  ) {
    return ingredient;
  }

  const match = leadingQuantity.exec(ingredient);
  if (!match) return ingredient;
  const [, prefix, first, separator, last] = match;
  const remainder = ingredient.slice(match[0].length);
  const trimmedRemainder = remainder.trimStart();
  // Reject ambiguous partial numbers, percentages, temperatures, and attached names.
  if (
    unsafeRemainder.test(trimmedRemainder) ||
    /^(?:%|°|[cf]\b|degrees?\b|percent\b|procent\b|[eE][+-]?\d)/i.test(trimmedRemainder) ||
    (/^\S/.test(remainder) && !attachedUnit.test(remainder))
  ) {
    return ingredient;
  }

  const firstValue = parseQuantity(first);
  const lastValue = last ? parseQuantity(last) : undefined;
  if (
    firstValue <= 0 ||
    !Number.isFinite(firstValue) ||
    (lastValue !== undefined && (!Number.isFinite(lastValue) || lastValue < firstValue))
  ) {
    return ingredient;
  }

  const ratio = selectedServings / baseServings;
  const decimalComma = first.includes(',') || (last?.includes(',') ?? false);
  const scaledFirst = formatQuantity(firstValue * ratio, decimalComma);
  const scaledLast =
    lastValue === undefined ? undefined : formatQuantity(lastValue * ratio, decimalComma);
  if (!scaledFirst || (lastValue !== undefined && !scaledLast)) return ingredient;
  return `${prefix}${scaledFirst}${separator ?? ''}${scaledLast ?? ''}${remainder}`;
}

function parseQuantity(quantity: string): number {
  const unicodeFraction = unicodeFractions[quantity.at(-1) ?? ''];
  if (unicodeFraction !== undefined) {
    return Number(quantity.slice(0, -1).trim() || 0) + unicodeFraction;
  }
  const fraction = /^(?:(\d+)\s+)?(\d+)\s*[/⁄]\s*(\d+)$/.exec(quantity);
  if (fraction) {
    const whole = Number(fraction[1] ?? 0);
    const numerator = Number(fraction[2]);
    const denominator = Number(fraction[3]);
    if (
      ![whole, numerator, denominator].every(Number.isSafeInteger) ||
      denominator === 0 ||
      (fraction[1] && numerator >= denominator)
    )
      return NaN;
    return whole + numerator / denominator;
  }
  return Number(quantity.replace(',', '.'));
}

function formatQuantity(value: number, decimalComma: boolean): string | undefined {
  const hundredths = Math.round((value + Number.EPSILON) * 100);
  // Preserve the original if rounding would produce zero or an unsafe number.
  if (!Number.isSafeInteger(hundredths) || hundredths <= 0) return undefined;
  const formatted = String(hundredths / 100);
  return decimalComma ? formatted.replace('.', ',') : formatted;
}
