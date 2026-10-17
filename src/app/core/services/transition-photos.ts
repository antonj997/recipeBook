/** Decode the selected live photo before its landing handoff, including cache hits.
 * The source snapshot stays opaque; these waits are bounded and cancelled with the flight.
 */
export async function prepareTransitionPhotos(
  document: Document,
  images: HTMLImageElement[],
  transition: Pick<ViewTransition, 'finished'>,
): Promise<boolean> {
  if (!images.length) return true;
  const animations = document.getAnimations().filter((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    return (
      animation.playState === 'running' && effect?.pseudoElement?.startsWith('::view-transition')
    );
  });
  for (const animation of animations) animation.pause();
  let ended = false;
  let settled = false;
  let frame: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const finished = transition.finished.then(
    () => {
      ended = true;
      return false;
    },
    () => {
      ended = true;
      return false;
    },
  );
  const decoded = Promise.all(
    images.map(async (image) => {
      // Returning to a card can mount a lazy image before carousel restoration.
      image.loading = 'eager';
      try {
        await image.decode();
        return image.complete && image.naturalWidth > 0;
      } catch {
        return false;
      }
    }),
  ).then((ready) => {
    if (settled || ended || !ready.every(Boolean)) return false;
    // rAF runs BEFORE paint. Two frames allow an intervening rendering opportunity;
    // they are not a guarantee of hardware presentation.
    return new Promise<boolean>((resolve) => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => resolve(true));
      });
    });
  });
  try {
    return await Promise.race([
      decoded,
      finished,
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 2000);
      }),
    ]);
  } finally {
    settled = true;
    clearTimeout(timeout);
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (!ended)
      for (const animation of animations) if (animation.playState === 'paused') animation.play();
  }
}
