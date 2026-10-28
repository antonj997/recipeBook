import { afterEach, describe, expect, it } from 'vitest';
import { applyMotionScale, motionMs, setSlowMotion, slowMotion } from './motion';

describe('motion scale', () => {
  afterEach(() => {
    setSlowMotion(false);
    localStorage.clear();
  });

  it('keeps real durations by default', () => {
    expect(slowMotion()).toBe(false);
    expect(motionMs(430)).toBe(430);
  });

  it('slows every CSS and script duration on this device when switched on', () => {
    setSlowMotion(true);
    expect(slowMotion()).toBe(true);
    expect(motionMs(100)).toBe(500);
    expect(document.documentElement.style.getPropertyValue('--motion-scale')).toBe('5');
    setSlowMotion(false);
    expect(motionMs(100)).toBe(100);
    expect(document.documentElement.style.getPropertyValue('--motion-scale')).toBe('');
  });

  it('remembers the choice for the next start', () => {
    setSlowMotion(true);
    document.documentElement.style.removeProperty('--motion-scale');
    applyMotionScale();
    expect(document.documentElement.style.getPropertyValue('--motion-scale')).toBe('5');
  });
});
