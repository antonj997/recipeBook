import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSlowMotion } from '../../core/motion';
import { animateLayout } from './flip';

describe('animateLayout', () => {
  let container: HTMLElement;
  let reduced: boolean;
  let animate: ReturnType<typeof vi.fn>;
  const tops = new Map<Element, number>();

  function row(name: string, top: number): HTMLElement {
    const element = document.createElement('li');
    element.textContent = name;
    tops.set(element, top);
    container.append(element);
    return element;
  }

  beforeEach(() => {
    reduced = false;
    container = document.createElement('ul');
    document.body.append(container);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = tops.get(this) ?? 0;
      return { top, left: 10, width: 300, height: 40, bottom: top + 40, right: 310 } as DOMRect;
    });
    animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animate,
    });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0),
    );
    document.documentElement.style.setProperty('--motion-spring-calm', 'linear(0, 1)');
  });
  afterEach(() => {
    container.remove();
    tops.clear();
    setSlowMotion(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty('--motion-spring-calm');
  });

  it('plays moved rows from where they were to where they are now', async () => {
    const first = row('a', 0);
    const second = row('b', 40);
    await animateLayout(container, () => {
      container.prepend(second);
      tops.set(second, 0);
      tops.set(first, 40);
    });
    expect(animate).toHaveBeenCalledTimes(2);
    const calls = animate.mock.calls.map((call, index) => ({
      element: animate.mock.contexts[index],
      from: call[0][0].transform,
      to: call[0][1].transform,
    }));
    expect(calls).toContainEqual({ element: second, from: 'translate(0px, 40px)', to: 'none' });
    expect(calls).toContainEqual({ element: first, from: 'translate(0px, -40px)', to: 'none' });
  });

  it('leaves rows that stayed put and rows that just arrived to their own motion', async () => {
    row('a', 0);
    await animateLayout(container, () => {
      row('new', 40);
    });
    expect(animate).not.toHaveBeenCalled();
  });

  it('uses the calm spring and scales with slow motion', async () => {
    setSlowMotion(true);
    const moved = row('a', 0);
    await animateLayout(container, () => tops.set(moved, 80), { duration: 200 });
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 1000, easing: 'linear(0, 1)' });
  });

  it('only updates under Reduce Motion', async () => {
    reduced = true;
    const moved = row('a', 0);
    const update = vi.fn(() => tops.set(moved, 80));
    await animateLayout(container, update);
    expect(update).toHaveBeenCalledOnce();
    expect(animate).not.toHaveBeenCalled();
  });

  it('starts a new move from the current position of an interrupted one', async () => {
    const moved = row('a', 0);
    const cancel = vi.fn();
    animate.mockReturnValueOnce({ cancel, finished: new Promise(() => undefined) });
    void animateLayout(container, () => tops.set(moved, 80));
    await new Promise((resolve) => setTimeout(resolve, 5));
    tops.set(moved, 50);
    await animateLayout(container, () => tops.set(moved, 0));
    expect(cancel).toHaveBeenCalledOnce();
    expect(animate.mock.calls[1]![0][0].transform).toBe('translate(0px, 50px)');
  });
});
