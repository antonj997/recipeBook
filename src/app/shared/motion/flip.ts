import { motionMs } from '../../core/motion';

export interface LayoutOptions {
  /** The children to follow; the container's direct children by default. */
  selector?: string;
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await update();
    return;
  }
  const children = () =>
    Array.from(container.querySelectorAll<HTMLElement>(options.selector ?? ':scope > *'));
  const before = new Map(children().map((child) => [child, child.getBoundingClientRect()]));
  await update();
  await new Promise(requestAnimationFrame);
  const easing =
    getComputedStyle(document.documentElement)
      .getPropertyValue(`--motion-spring-${options.easing ?? 'calm'}`)
      .trim() || fallbackEasing;
  const moves: Promise<unknown>[] = [];
  for (const child of children()) {
    const first = before.get(child);
    if (!first) continue;
    running.get(child)?.cancel();
    const last = child.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const animation = child.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: motionMs(options.duration ?? 280), easing },
    );
    running.set(child, animation);
    moves.push(animation.finished.catch(() => undefined));
  }
  await Promise.all(moves);
}
