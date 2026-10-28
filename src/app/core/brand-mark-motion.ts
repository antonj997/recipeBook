import { motionMs } from './motion';

export interface BrandMarkMotion {
  finished: Promise<void>;
  cancel(): void;
}

const still: BrandMarkMotion = { finished: Promise.resolve(), cancel() {} };

/**
 * One R-to-book tip for the first-paint cover and route loading states: the same corner balance
 * and fall as the header mark (toBookFrames below).
 */
export function tipRecipebookMark(mark: HTMLElement | null): BrandMarkMotion {
  if (!mark) return still;
  if (
    mark.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof mark.animate !== 'function'
  ) {
    mark.style.transform = 'rotate(-90deg)';
    return still;
  }

  let animation: Animation | undefined;
  let settled = false;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  let resolve!: () => void;
  const finished = new Promise<void>((done) => {
    resolve = done;
  });
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(fallback);
    mark.style.transform = 'rotate(-90deg)';
    try {
      animation?.cancel();
    } catch {
      /* The static book is already in place. */
    }
    resolve();
  };
  const start = () => {
    if (settled) return;
    clearTimeout(fallback);
    // Hidden tabs or a failed animation engine must never trap the launch cover.
    fallback = setTimeout(finish, motionMs(620));
    mark.style.transform = 'rotate(-90deg)';
    try {
      animation = mark.animate(toBookFrames, {
        duration: motionMs(520),
        easing: 'linear',
        fill: 'both',
      });
      void Promise.resolve(animation.finished).then(finish, finish);
    } catch {
      finish();
    }
  };
  // Decode before animating to avoid an empty SVG/compositor frame. A stalled
  // optional logo falls back to the static book and never blocks the app.
  fallback = setTimeout(finish, motionMs(620));
  try {
    if (mark instanceof HTMLImageElement && typeof mark.decode === 'function')
      void mark.decode().then(start, finish);
    else start();
  } catch {
    finish();
  }
  return { finished, cancel: finish };
}

// Header mark frames pivot on the corner the R tips over and lands on. With that pivot the book
// pose is translateX(100%) rotate(-90deg), the same place as the static book's centred rotate.
const pivot = (frames: Keyframe[]): Keyframe[] =>
  frames.map((frame) => ({ ...frame, transformOrigin: '0% 100%' }));
const toBookFrames = pivot([
  // Pushed up onto its corner, slowing as it nears the tipping point.
  {
    offset: 0,
    transform: 'translateX(0%) rotate(0deg) scale(1, 1)',
    easing: 'cubic-bezier(0.25, 0.6, 0.4, 1)',
  },
  { offset: 0.3, transform: 'translateX(0%) rotate(-38deg) scale(1, 1)', easing: 'ease-in-out' },
  // A moment of balance on the corner, rocking just past the tipping point and back.
  { offset: 0.42, transform: 'translateX(0%) rotate(-45deg) scale(1, 1)', easing: 'ease-in-out' },
  {
    offset: 0.52,
    transform: 'translateX(0%) rotate(-42deg) scale(1, 1)',
    easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)',
  },
  // Gravity wins: it lands on its spine as the header finishes compacting (420 of 520 ms)…
  {
    offset: 0.81,
    transform: 'translateX(100%) rotate(-90deg) scale(1, 1)',
    easing: 'cubic-bezier(0.2, 0, 0.3, 1)',
  },
  // …with a short squash that shows its weight, and no rebound.
  {
    offset: 0.89,
    transform: 'translateX(100%) rotate(-90deg) scale(0.9, 1.04)',
    easing: 'ease-out',
  },
  { offset: 1, transform: 'translateX(100%) rotate(-90deg) scale(1, 1)' },
]);
const toUprightFrames = pivot([
  {
    offset: 0,
    transform: 'translateX(100%) rotate(-90deg)',
    easing: 'cubic-bezier(0.3, 0, 0.25, 1)',
  },
  { offset: 0.72, transform: 'translateX(-2%) rotate(3deg)', easing: 'ease-in-out' },
  { offset: 1, transform: 'translateX(0%) rotate(0deg)' },
]);

/**
 * The header mark stands as an R while the header is tall and tips onto its spine as a book when
 * it compacts. CSS holds both poses; this only animates between them. A swing that is still
 * running turns around instead of jumping, and Reduce Motion switches at once.
 */
export function swingHeaderMark(
  mark: HTMLElement,
  toBook: boolean,
  running?: Animation,
): Animation | undefined {
  if (running?.playState === 'running') {
    running.reverse();
    return running;
  }
  if (
    mark.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof mark.animate !== 'function'
  )
    return undefined;
  return mark.animate(toBook ? toBookFrames : toUprightFrames, {
    duration: motionMs(toBook ? 520 : 380),
    easing: 'linear',
  });
}
