export interface BrandMarkMotion {
  finished: Promise<void>;
  cancel(): void;
}

const still: BrandMarkMotion = { finished: Promise.resolve(), cancel() {} };
const tipFrames: Keyframe[] = [
  {
    transform: 'translateY(-3px) rotate(0deg)',
    offset: 0,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  {
    transform: 'translateY(-3px) rotate(6deg)',
    offset: 0.18,
    easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)',
  },
  {
    transform: 'translateY(0) rotate(-90deg)',
    offset: 0.8,
    easing: 'linear',
  },
  // Contact stops the fall abruptly; hold flat without a rebound or settling.
  { transform: 'rotate(-90deg)', offset: 1 },
];

/** One R-to-book tip, shared by the first-paint cover and route loading states. */
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
    fallback = setTimeout(finish, 620);
    mark.style.transform = 'rotate(-90deg)';
    try {
      animation = mark.animate(tipFrames, { duration: 520, easing: 'linear', fill: 'both' });
      void Promise.resolve(animation.finished).then(finish, finish);
    } catch {
      finish();
    }
  };
  // Decode before animating to avoid an empty SVG/compositor frame. A stalled
  // optional logo falls back to the static book and never blocks the app.
  fallback = setTimeout(finish, 620);
  try {
    if (mark instanceof HTMLImageElement && typeof mark.decode === 'function')
      void mark.decode().then(start, finish);
    else start();
  } catch {
    finish();
  }
  return { finished, cancel: finish };
}
