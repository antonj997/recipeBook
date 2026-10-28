import { motionMs } from '../../core/motion';

export interface LayoutOptions {
  /** The children to follow; the container's direct children by default. */
  selector?: string;
  /** Matches a child the view re-created elsewhere, such as a row moved to another list. */
  key?: (child: HTMLElement) => string | undefined;
  /** Milliseconds before Slow motion (test) scaling; the surface token by default. */
  duration?: number;
  easing?: 'calm' | 'snappy';
}

const running = new WeakMap<Element, Animation>();
const fallbackEasing = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Animates a layout change (FLIP): measures the children, applies `update`, waits one frame for
 * the view to render, then plays every moved child from where it was to where it is now.
 * Children that arrive or leave keep their own enter and leave motion. An interrupted move
 * starts again from the child's current visual position.
 */
export async function animateLayout(
  container: HTMLElement,
  update: () => unknown,
  options: LayoutOptions = {},
): Promise<void> {
  // Without Web Animations (or with Reduce Motion) the layout simply changes.
  if (!animates(container)) {
    await update();
    return;
  }
  const children = () =>
    Array.from(container.querySelectorAll<HTMLElement>(options.selector ?? ':scope > *'));
  const identity = (child: HTMLElement): unknown => options.key?.(child) ?? child;
  const before = new Map(
    children().map((child) => [identity(child), child.getBoundingClientRect()]),
  );
  await update();
  await new Promise(requestAnimationFrame);
  const curve = easing(options.easing);
  const moves: Promise<unknown>[] = [];
  for (const child of children()) {
    const first = before.get(identity(child));
    if (!first) continue;
    running.get(child)?.cancel();
    const last = child.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const animation = child.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: motionMs(options.duration ?? 280), easing: curve },
    );
    running.set(child, animation);
    moves.push(animation.finished.catch(() => undefined));
  }
  await Promise.all(moves);
}

/** Animates `element` from its height before `update` to its height after it. */
export async function animateHeight(
  element: HTMLElement,
  update: () => unknown,
  options: Pick<LayoutOptions, 'duration' | 'easing'> = {},
): Promise<void> {
  if (!animates(element)) {
    await update();
    return;
  }
  const from = element.getBoundingClientRect().height;
  running.get(element)?.cancel();
  await update();
  await new Promise(requestAnimationFrame);
  const to = element.getBoundingClientRect().height;
  if (Math.abs(from - to) < 0.5) return;
  const animation = element.animate(
    [
      { height: from + 'px', overflow: 'hidden' },
      { height: to + 'px', overflow: 'hidden' },
    ],
    { duration: motionMs(options.duration ?? 200), easing: easing(options.easing) },
  );
  running.set(element, animation);
  await animation.finished.catch(() => undefined);
}

function animates(element: HTMLElement): boolean {
  return (
    typeof element.animate === 'function' &&
    typeof matchMedia === 'function' &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function easing(name: LayoutOptions['easing'] = 'calm'): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(`--motion-spring-${name}`).trim() ||
    fallbackEasing
  );
}
