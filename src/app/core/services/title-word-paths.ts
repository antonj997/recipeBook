export interface WordBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Title words fly one by one between the card and the recipe page while the title itself moves
 * and grows. A word that changes line would cut diagonally through its neighbours; instead,
 * halfway through the flight it sits on its new line at its old place within the title, so it
 * first reaches its line and then moves along it, travelling with the rest of the title.
 * Returns the offset from the browser's straight midpoint, per word that changes line.
 */
export function titleWordDetours(
  from: ReadonlyMap<string, WordBox>,
  to: ReadonlyMap<string, WordBox>,
): Map<string, { x: number; y: number }> {
  const shared = [...from.keys()].filter((word) => to.has(word));
  if (!shared.length) return new Map();
  const before = lineIndices(from);
  const after = lineIndices(to);
  const originFrom = origin(from);
  const originTo = origin(to);
  // How much the title grows, from the word heights.
  const scale = median(shared.map((word) => to.get(word)!.height / from.get(word)!.height));
  const halfway = (1 + scale) / 2;
  const detours = new Map<string, { x: number; y: number }>();
  for (const word of shared) {
    if (before.get(word) === after.get(word)) continue;
    const start = from.get(word)!;
    const end = to.get(word)!;
    const x = (originFrom.left + originTo.left) / 2 + (start.left - originFrom.left) * halfway;
    const y = (originFrom.top + originTo.top) / 2 + ((end.top - originTo.top) * halfway) / scale;
    detours.set(word, {
      x: x - (start.left + end.left) / 2,
      y: y - (start.top + end.top) / 2,
    });
  }
  return detours;
}

function origin(words: ReadonlyMap<string, WordBox>): { left: number; top: number } {
  const boxes = [...words.values()];
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 1;
}

/** Words whose tops lie within half a word height of each other share a line. */
function lineIndices(words: ReadonlyMap<string, WordBox>): Map<string, number> {
  const boxes = [...words.values()];
  const tolerance = Math.min(...boxes.map((box) => box.height)) / 2;
  const tops: number[] = [];
  for (const top of boxes.map((box) => box.top).sort((a, b) => a - b))
    if (!tops.length || top - tops.at(-1)! > tolerance) tops.push(top);
  // The last line starting at or above a word's top is its line.
  const line = (top: number) => tops.filter((start) => top >= start - tolerance).length - 1;
  return new Map([...words].map(([word, box]) => [word, line(box.top)]));
}
