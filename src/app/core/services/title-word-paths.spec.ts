import { describe, expect, it } from 'vitest';
import { titleWordDetours, type WordBox } from './title-word-paths';

const box = (left: number, top: number, width = 40, height = 20): WordBox => ({
  left,
  top,
  width,
  height,
});

describe('titleWordDetours', () => {
  it('leaves words that keep their line on the straight flight', () => {
    const from = new Map([
      ['0', box(0, 0)],
      ['1', box(50, 0)],
    ]);
    const to = new Map([
      ['0', box(10, 100, 60, 30)],
      ['1', box(80, 100, 60, 30)],
    ]);
    expect(titleWordDetours(from, to).size).toBe(0);
  });

  it('sends a word that changes line to its new line first, then along it', () => {
    // "Kycklinggryta med | röd curry" becomes "Kycklinggryta | med röd curry".
    const from = new Map([
      ['0', box(0, 0, 120)],
      ['1', box(130, 0)],
      ['2', box(0, 24)],
      ['3', box(50, 24)],
    ]);
    const to = new Map([
      ['0', box(0, 200, 180, 30)],
      ['1', box(0, 236, 60, 30)],
      ['2', box(70, 236, 60, 30)],
      ['3', box(140, 236, 60, 30)],
    ]);
    const detours = titleWordDetours(from, to);
    expect([...detours.keys()]).toEqual(['1']);
    // The title moves down 200px and grows 1.5×. Halfway it is at (0, 100) at 1.25×, so the
    // word sits at its old x (130 × 1.25) on its new line (36 / 1.5 × 1.25) instead of the
    // straight midpoint (65, 118).
    expect(detours.get('1')).toEqual({ x: 97.5, y: 12 });
  });

  it('tolerates small baseline differences inside one line', () => {
    const from = new Map([
      ['0', box(0, 0)],
      ['1', box(50, 2)],
    ]);
    const to = new Map([
      ['0', box(0, 50)],
      ['1', box(50, 51)],
    ]);
    expect(titleWordDetours(from, to).size).toBe(0);
  });

  it('ignores words missing on either side', () => {
    expect(titleWordDetours(new Map([['0', box(0, 0)]]), new Map()).size).toBe(0);
  });
});
