import { afterEach, describe, expect, it, vi } from 'vitest';
import { anySignal, markLiteEffects, needsPopoverPolyfill } from './compat';

describe('older browser support', () => {
  afterEach(() => vi.restoreAllMocks());

  it('combines abort signals where AbortSignal.any is missing (Safari 16)', () => {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    try {
      const first = new AbortController();
      const second = new AbortController();
      const combined = anySignal([first.signal, second.signal]);
      expect(combined.aborted).toBe(false);
      second.abort(new Error('timeout'));
      expect(combined.aborted).toBe(true);
      expect((combined.reason as Error).message).toBe('timeout');
      const already = anySignal([AbortSignal.abort('gone')]);
      expect(already.aborted).toBe(true);
    } finally {
      Reflect.deleteProperty(AbortSignal, 'any');
    }
  });

  it('asks for the popover polyfill only where popovers are missing', () => {
    expect(needsPopoverPolyfill({ prototype: { popover: null } } as never)).toBe(false);
    expect(needsPopoverPolyfill({ prototype: {} } as never)).toBe(true);
  });

  it('turns off the heaviest effects on engines older than Safari 17', () => {
    const root = document.createElement('html');
    markLiteEffects(root, { prototype: {} } as never);
    expect(root.classList).toContain('lite-effects');
    const modern = document.createElement('html');
    markLiteEffects(modern, { prototype: { popover: null } } as never);
    expect(modern.classList).not.toContain('lite-effects');
  });
});
